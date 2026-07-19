import { Label, PrintSetting, millimetersToPixels } from '../../editor/models/label.models';
import { jsPDF } from 'jspdf';
import { StaticCanvas, FabricObject } from 'fabric';
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
 * QR/条码的 SVG 快照：用于 svg2pdf 矢量写入。
 * svgElement 始终是顶层 <svg>，不带嵌套 <g transform>，
 * 位置/尺寸由 svg2pdf options.x/y/width/height 显式控制。
 */
interface SvgSnapshot {
  svgElement: SVGSVGElement;
  centerXPx: number;
  centerYPx: number;
  widthPx: number;
  heightPx: number;
}

/**
 * PDF 标签生成器
 *
 * 渲染策略：
 * - 文字 / 矢量图形 / 模板背景：整张画布导 SVG → svg2pdf 矢量写入
 * - QR / 条码：独立取出原始 SVG，单独 svg2pdf 写入（矢量）
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

    const { canvas, widthPx, heightPx, svgHost, cache } = this.prepareRenderEnv(
      labels[0].width,
      labels[0].height
    );

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
    widthPx: number;
    heightPx: number;
    svgHost: HTMLDivElement;
    cache: RenderCache;
  } {
    const widthPx = millimetersToPixels(labelWidthMm);
    const heightPx = millimetersToPixels(labelHeightMm);
    const canvas = createRenderCanvas(widthPx, heightPx);
    const cache: RenderCache = { loaded: false, current: [] };
    const svgHost = this.createSvgHost();
    document.body.appendChild(svgHost);
    return { canvas, widthPx, heightPx, svgHost, cache };
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
    await applyLabelToCanvas(canvas, label, canvas.getWidth(), canvas.getHeight(), cache);

    // 1) 收集 QR / 条码 SVG 快照
    const svgSnapshots = this.collectSvgSnapshots(canvas);

    // 2) 临时从画布移除 QR / 条码，导出剩余矢量部分给 svg2pdf
    const removed = this.detachImageObjects(canvas);
    try {
      const svgElement = await this.canvasToSvgElement(canvas, svgHost, pdf);
      await svg2pdf(svgElement, pdf, {
        x: positionPx.x,
        y: positionPx.y,
        width: widthPxLayout,
        height: heightPxLayout
      });
    } finally {
      this.reattachImageObjects(canvas, removed);
    }

    // 3) QR / 条码独立写入：每个都是顶层 SVG 元素，位置/尺寸由 options 显式控制
    //    canvas px 直接 = PDF px（jsPDF unit='px'），1:1 映射设计
    for (const snap of svgSnapshots) {
      await svg2pdf(snap.svgElement, pdf, {
        x: positionPx.x + (snap.centerXPx - snap.widthPx / 2),
        y: positionPx.y + (snap.centerYPx - snap.heightPx / 2),
        width: snap.widthPx,
        height: snap.heightPx
      });
    }
  }

  // ===== QR / 条码快照 =====

  private collectSvgSnapshots(canvas: StaticCanvas): SvgSnapshot[] {
    const snapshots: SvgSnapshot[] = [];
    for (const obj of canvas.getObjects() as any[]) {
      if (!this.isBarcodeOrQrImage(obj)) continue;
      obj.setCoords();
      const src = (obj.getElement && obj.getElement()?.src) || obj.toDataURL({ format: 'png' });
      const widthPx = obj.width * obj.scaleX;
      const heightPx = obj.height * obj.scaleY;

      console.log("widthPx",widthPx)
      console.log("heightPx",heightPx)
      const svgElement = this.dataUrlToSvgElement(src, widthPx, heightPx);

       console.log("svgElement",svgElement)

      if (!svgElement) continue;
      snapshots.push({
        svgElement,
        centerXPx: obj.left,
        centerYPx: obj.top,
        widthPx,
        heightPx
      });
    }
    return snapshots;
  }

  /**
   * 将 dataURL 包装为独立 <svg> 元素。
   * - SVG dataURL：parseFromString 得到原始 <svg>，保留矢量结构
   * - PNG/JPEG dataURL：构造 <svg><image href="..."/></svg>，svg2pdf 按位图处理
   *
   * viewBox/width/height 用 obj 的视觉宽高（已含 scaleX/Y），
   * 让 svg2pdf 按 1:1 像素坐标渲染，无 mm/px 换算。
   */
  private dataUrlToSvgElement(
    dataUrl: string,
    visualWidthPx: number,
    visualHeightPx: number
  ): SVGSVGElement | null {
    if (dataUrl.startsWith('data:image/svg+xml')) {
      const decoded = this.decodeDataUrl(dataUrl);
      const doc = new DOMParser().parseFromString(decoded, 'image/svg+xml');
      const svg = doc.documentElement as unknown as SVGSVGElement;
      return svg.nodeName.toLowerCase() === 'svg' ? svg : null;
    }

    if (dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/jpeg')) {
      const w = Math.max(1, Math.round(visualWidthPx));
      const h = Math.max(1, Math.round(visualHeightPx));

      console.log("w",w);
      console.log("h",h);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttribute('x', '0');
      image.setAttribute('y', '0');
      image.setAttribute('width', String(w));
      image.setAttribute('height', String(h));
      image.setAttribute('href', dataUrl);
      svg.appendChild(image);
      return svg;
    }

    return null;
  }

  /**
   * 解码 dataURL：去除 MIME 头，base64 → UTF-8 字符串。
   * DOMParser 是同步 API，无需 async/Promise 包装。
   */
  private decodeDataUrl(dataUrl: string): string {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) {
      throw new Error('Invalid data URL');
    }
    const header = dataUrl.slice(0, commaIdx);
    const payload = dataUrl.slice(commaIdx + 1);
    if (header.includes(';base64')) {
      return atob(payload);
    }
    return decodeURIComponent(payload);
  }

  // ===== 画布对象操作 =====

  private isBarcodeOrQrImage(obj: any): boolean {
    if (!obj || obj.type?.toLowerCase() !== 'image') return false;
    return obj.elementType === 'qrcode' || obj.elementType === 'barcode';
  }

  private detachImageObjects(canvas: StaticCanvas): FabricObject[] {
    const toRemove = (canvas.getObjects() as any[]).filter((o) => this.isBarcodeOrQrImage(o));
    if (toRemove.length > 0) {
      canvas.remove(...toRemove);
    }
    return toRemove as FabricObject[];
  }

  private reattachImageObjects(canvas: StaticCanvas, removed: FabricObject[]): void {
    if (removed.length > 0) {
      canvas.add(...removed);
    }
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
