import { Label, PrintSetting, millimetersToPixels } from '../../editor/models/label.models';
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

/**
 * PDF 标签生成器
 * 使用 svg2pdf 将标签以矢量方式写入 PDF（文字/矢量图形清晰、体积小）。
 * 渲染层（Fabric 状态构建）由 fabric-render-helper 统一管理。
 */
export class PdfLabelGenerator implements LabelGenerator {
  readonly name = 'pdf';

  constructor(private printSetting: PrintSetting) {}

  async generate(labels: Label[], options?: PdfGenerateOptions): Promise<Blob> {
    if (!labels.length) {
      throw new Error('No labels to generate');
    }

    const { jsPDF } = await import('jspdf');
    const { svg2pdf } = await import('svg2pdf.js');

    // 计算排版
    const layout = PrintLayoutCalculator.calculate(
      this.printSetting,
      labels[0].width,
      labels[0].height
    );

    const orientation = this.printSetting.orientation;

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [layout.paperWidth, layout.paperHeight]
    });

    const pageCount = PrintLayoutCalculator.getPageCount(labels.length, layout);

    // 复用同一个 StaticCanvas 与对象树缓存
    const widthPx = millimetersToPixels(labels[0].width);
    const heightPx = millimetersToPixels(labels[0].height);
    const canvas = createRenderCanvas(widthPx, heightPx);
    const cache: RenderCache = { loaded: false, current: [] };

    // 复用的离屏 SVG 容器（svg2pdf 需要节点在 DOM 中以读取计算样式）
    const svgHost = this.createSvgHost();
    document.body.appendChild(svgHost);

    let completed = 0;
    const total = labels.length;

    try {
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        if (pageIndex > 0) {
          pdf.addPage([layout.paperWidth, layout.paperHeight], orientation);
        }

        const pageLabels = this.getPageLabels(pageIndex, labels, layout);

        for (let i = 0; i < pageLabels.length; i++) {
          const label = pageLabels[i];

          await applyLabelToCanvas(canvas, label, widthPx, heightPx, cache);

          const svgElement = await this.canvasToSvgElement(canvas, svgHost, pdf);
          const position = PrintLayoutCalculator.getPosition(i, layout);

          await svg2pdf(svgElement, pdf, {
            x: position.x,
            y: position.y,
            width: layout.labelWidth,
            height: layout.labelHeight
          });

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

    const { jsPDF } = await import('jspdf');
    const { svg2pdf } = await import('svg2pdf.js');

    const orientation = this.getOrientation(options?.orientation, label.width, label.height);

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [label.width, label.height]
    });

    const widthPx = millimetersToPixels(label.width);
    const heightPx = millimetersToPixels(label.height);
    const canvas = createRenderCanvas(widthPx, heightPx);
    const cache: RenderCache = { loaded: false, current: [] };

    const svgHost = this.createSvgHost();
    document.body.appendChild(svgHost);

    try {
      await applyLabelToCanvas(canvas, label, widthPx, heightPx, cache);
      const svgElement = await this.canvasToSvgElement(canvas, svgHost, pdf);
      await svg2pdf(svgElement, pdf, {
        x: 0,
        y: 0,
        width: label.width,
        height: label.height
      });
    } finally {
      svgHost.remove();
      canvas.dispose();
    }

    return pdf.output('blob');
  }

  /**
   * 创建离屏 SVG 宿主容器（svg2pdf 读取计算样式需节点在文档中）
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

  /**
   * 将画布内容导出为 SVG DOM 元素（供 svg2pdf 使用）
   * 同时预注册 SVG 中用到的字体到 jspdf。
   */
  private async canvasToSvgElement(
    canvas: StaticCanvas,
    host: HTMLDivElement,
    pdf: any
  ): Promise<SVGSVGElement> {
    const svgString = canvas.toSVG();
    // 1) 把所有 font-family 统一改写成我们注册的字体（带 CJK fallback）
    const rewritten = rewriteSvgFontFamily(svgString);
    // 2) 把混合字符的 tspan 按字符集拆开（ASCII 一段 / CJK 一段）
    //    否则 svg2pdf 不会做 per-character fallback，CJK 会变 tofu
    const split = splitTspansByCharset(rewritten);
    const doc = new DOMParser().parseFromString(split, 'image/svg+xml');
    const svgElement = doc.documentElement as unknown as SVGSVGElement;

    host.replaceChildren(svgElement);

    // 预注册 SVG 中用到的字体
    const requests = extractFontRequests(split);
    if (requests.length > 0) {
      await fontLoader.ensureFontsRegistered(pdf, requests);
    }

    return svgElement;
  }

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

  private getPageLabels(pageIndex: number, labels: Label[], layout: ReturnType<typeof PrintLayoutCalculator.calculate>): Label[] {
    const start = pageIndex * layout.labelsPerPage;
    const end = start + layout.labelsPerPage;
    return labels.slice(start, end);
  }
}
