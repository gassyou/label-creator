import { Label, PrintSetting, millimetersToPixels } from '../../editor/models/label.models';
import { jsPDF } from 'jspdf';
import { StaticCanvas } from 'fabric';
import { LabelGenerator, PdfGenerateOptions } from './label-generator.interface';
import { PrintLayoutCalculator } from './print-layout-calculator';
import {
  RenderCache,
  applyLabelToCanvas,
  createRenderCanvas
} from './fabric-render-helper';
import { fontLoader } from './font-loader';
import { extractFontRequests, rewriteSvgFontFamily, splitTspansByCharset } from './svg-font-rewriter';

// 注意：jsPDF 用 unit='px' 时，所有坐标/尺寸都是 px，与设计画布 1:1。
// 1 canvas px = 1 PDF px = 1/96 inch = 25.4/96 mm。
// 物理输出尺寸由 jsPDF.format [paperWidthPx, paperHeightPx] 决定。

/**
 * PDF 标签生成器
 *
 * 渲染策略：整张画布导 SVG → svg2pdf 一次性矢量写入。
 * 所有元素（文本 / 矢量图形 / 背景图 / QR / 条码）的位置和尺寸
 * 都由 fabric 在 toSVG() 时统一处理，PDF 生成器不区分元素类型。
 *
 * 单位策略：jsPDF 使用 'px' 单位，画布和 PDF 坐标都用像素，
 * 1:1 映射设计坐标，避免 mm/px 换算带来的偏差。
 *
 * 渲染层（Fabric 状态构建）由 fabric-render-helper 统一管理：
 * 首个标签构建对象树，后续标签只增量更新文本/图片，复用缓存。
 */
export class PdfLabelGenerator implements LabelGenerator {
  readonly name = 'pdf';

  constructor(private printSetting: PrintSetting) {}

  async generate(labels: Label[], options?: PdfGenerateOptions): Promise<Blob> {
    if (!labels.length) {
      throw new Error('No labels to generate');
    }

    const layout = PrintLayoutCalculator.calculate(
      this.printSetting,
      labels[0].width,
      labels[0].height
    );

    // jsPDF 使用 px 单位（与设计画布单位 1:1）。
    // format: [paperWidthPx, paperHeightPx] 决定 PDF 物理尺寸：
    //   物理 mm = paperWidthPx / (96/25.4) = paperWidthPx × 25.4/96
    // 设计画布 px 数 = PDF px 数 = PDF 物理 1/96 inch × 25.4 mm
    // 即设计阶段 mm 数 = 画布 px / 3.78，与 96 DPI 设计画布一致。
    // 这样用户在编辑器里设的 px 数与 PDF 中元素的 px 数 1:1，
    // 物理 mm 数自然也匹配。
    const paperWidthPx = millimetersToPixels(layout.paperWidth);
    const paperHeightPx = millimetersToPixels(layout.paperHeight);
    const pdf = new jsPDF({
      orientation: this.printSetting.orientation,
      unit: 'px',
      format: [paperWidthPx, paperHeightPx]
    });

    const { canvas,svgHost, cache } = this.prepareRenderEnv(labels[0].width, labels[0].height);

    const pageCount = PrintLayoutCalculator.getPageCount(labels.length, layout);
    let completed = 0;
    const total = labels.length;

    try {
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        if (pageIndex > 0) {
          pdf.addPage(
            [paperWidthPx, paperHeightPx],
            this.printSetting.orientation
          );
        }

        const pageLabels = this.getPageLabels(pageIndex, labels, layout);

        for (let i = 0; i < pageLabels.length; i++) {
          // layout 是 mm 单位，jsPDF 用 px 单位，所以这里把位置/尺寸转 px。
          const positionMm = PrintLayoutCalculator.getPosition(i, layout);
          const positionPx = {
            x: millimetersToPixels(positionMm.x),
            y: millimetersToPixels(positionMm.y)
          };
          await this.renderOneLabel(
            pdf, canvas, svgHost, cache, pageLabels[i],
            positionPx, millimetersToPixels(layout.labelWidth), millimetersToPixels(layout.labelHeight)
          );

          completed++;
          options?.onProgress?.({
            completed,
            total,
            currentPage: pageIndex,
            totalPages: pageCount
          });
        }
      }
    } finally {
      svgHost.remove();
      canvas.dispose();
    }

    return pdf.output('blob');
  }

  async generateSingle(label: Label, options?: PdfGenerateOptions): Promise<Blob> {
    if (!label) {
      throw new Error('No label to generate');
    }

    const orientation = this.getOrientation(options?.orientation, label.width, label.height);

    const labelWidthPx = millimetersToPixels(label.width);
    const labelHeightPx = millimetersToPixels(label.height);
    const pdf = new jsPDF({
      orientation,
      unit: 'px',
      format: [labelWidthPx, labelHeightPx]
    });

    const { canvas, svgHost, cache } = this.prepareRenderEnv(label.width, label.height);

    try {
      await this.renderOneLabel(
        pdf, canvas, svgHost, cache, label,
        { x: 0, y: 0 }, labelWidthPx, labelHeightPx
      );
    } finally {
      svgHost.remove();
      canvas.dispose();
    }

    return pdf.output('blob');
  }

  // ===== 渲染环境 =====

  private prepareRenderEnv(labelWidthMm: number, labelHeightMm: number): {
    canvas: StaticCanvas;
    svgHost: HTMLDivElement;
    cache: RenderCache;
  } {
    const widthPx = millimetersToPixels(labelWidthMm);
    const heightPx = millimetersToPixels(labelHeightMm);
    const canvas = createRenderCanvas(widthPx, heightPx);
    const cache: RenderCache = { loaded: false, current: [] };
    const svgHost = this.createSvgHost();
    document.body.appendChild(svgHost);
    return { canvas, svgHost, cache };
  }

  /**
   * 创建离屏 SVG 宿主容器（svg2pdf 需要节点在文档中以读取计算样式）
   */
  private createSvgHost(): HTMLDivElement {
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.left = '-99999px';
    host.style.top = '0';
    host.style.visibility = 'hidden';
    host.style.pointerEvents = 'none';
    return host;
  }

  // ===== 单张标签渲染 =====

  private async renderOneLabel(
    pdf: jsPDF,
    canvas: StaticCanvas,
    svgHost: HTMLDivElement,
    cache: RenderCache,
    label: Label,
    positionPx: { x: number; y: number },
    widthPxLayout: number,
    heightPxLayout: number
  ): Promise<void> {
    const { svg2pdf } = await import('svg2pdf.js');
    await applyLabelToCanvas(canvas, label, widthPxLayout, heightPxLayout, cache);

    // 整张画布 → SVG → svg2pdf：所有元素（文本/图形/背景/QR/条码）
    // 由 fabric 在 toSVG() 时统一输出位置和尺寸，生成器不区分类型。
    const svgElement = await this.canvasToSvgElement(canvas, svgHost, pdf);
    await svg2pdf(svgElement, pdf, {
      x: positionPx.x,
      y: positionPx.y,
      width: widthPxLayout,
      height: heightPxLayout
    });
  }

  // ===== 画布 → SVG =====

  private async canvasToSvgElement(
    canvas: StaticCanvas,
    host: HTMLDivElement,
    pdf: jsPDF
  ): Promise<SVGSVGElement> {
    const svgString = canvas.toSVG();
    const rewritten = rewriteSvgFontFamily(svgString);
    const split = splitTspansByCharset(rewritten);
    const doc = new DOMParser().parseFromString(split, 'image/svg+xml');
    const svgElement = doc.documentElement as unknown as SVGSVGElement;

    host.replaceChildren(svgElement);

    const requests = extractFontRequests(split);
    if (requests.length > 0) {
      await fontLoader.ensureFontsRegistered(pdf, requests);
    }

    return svgElement;
  }

  // ===== 工具方法 =====

  private getOrientation(
    orientation: 'portrait' | 'landscape' | 'auto' | undefined,
    labelWidth: number,
    labelHeight: number
  ): 'portrait' | 'landscape' {
    if (orientation === 'auto') {
      return labelWidth > labelHeight ? 'landscape' : 'portrait';
    }
    return orientation ?? (labelWidth > labelHeight ? 'landscape' : 'portrait');
  }

  private getPageLabels(
    pageIndex: number,
    labels: Label[],
    layout: ReturnType<typeof PrintLayoutCalculator.calculate>
  ): Label[] {
    const start = pageIndex * layout.labelsPerPage;
    return labels.slice(start, start + layout.labelsPerPage);
  }
}
