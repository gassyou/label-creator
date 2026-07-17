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

/** 物理像素 → mm（96 DPI） */
function pxToMm(px: number, dpi = 96): number {
  return px / (dpi / 25.4);
}

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
 *   —— 顶层 SVG 元素不嵌套 <g transform>，避免 svg2pdf 对 Fabric
 *   `<image>` 嵌套变换时的位置偏移
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

    const { svg2pdf } = await import('svg2pdf.js');

    const layout = PrintLayoutCalculator.calculate(
      this.printSetting,
      labels[0].width,
      labels[0].height
    );

    const pdf = new jsPDF({
      orientation: this.printSetting.orientation,
      unit: 'mm',
      format: [layout.paperWidth, layout.paperHeight]
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
          pdf.addPage([layout.paperWidth, layout.paperHeight], this.printSetting.orientation);
        }

        const pageLabels = this.getPageLabels(pageIndex, labels, layout);

        for (let i = 0; i < pageLabels.length; i++) {
          const position = PrintLayoutCalculator.getPosition(i, layout);
          await this.renderOneLabel(
            pdf, canvas, svgHost, cache, pageLabels[i],
            position, layout.labelWidth, layout.labelHeight,
            svg2pdf
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

    const { svg2pdf } = await import('svg2pdf.js');

    const orientation = this.getOrientation(options?.orientation, label.width, label.height);

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [label.width, label.height]
    });

    const { canvas, svgHost, cache } = this.prepareRenderEnv(label.width, label.height);

    try {
      await this.renderOneLabel(
        pdf, canvas, svgHost, cache, label,
        { x: 0, y: 0 }, label.width, label.height,
        svg2pdf
      );
    } finally {
      svgHost.remove();
      canvas.dispose();
    }

    return pdf.output('blob');
  }

  // ===== 渲染环境 =====

  /**
   * 准备共享渲染环境：StaticCanvas + 离屏 SVG 宿主 + 缓存。
   * generate / generateSingle 共用。
   */
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

  /**
   * 渲染一张标签到 PDF：先矢量部分（svg2pdf），再独立 QR/条码（svg2pdf）。
   * 抽出来给 generate / generateSingle 共用。
   */
  private async renderOneLabel(
    pdf: jsPDF,
    canvas: StaticCanvas,
    svgHost: HTMLDivElement,
    cache: RenderCache,
    label: Label,
    position: { x: number; y: number },
    widthMm: number,
    heightMm: number,
    svg2pdf: (element: Element, pdf: jsPDF, options?: { x?: number; y?: number; width?: number; height?: number }) => Promise<jsPDF>
  ): Promise<void> {
    await applyLabelToCanvas(canvas, label, canvas.getWidth(), canvas.getHeight(), cache);

    // 1) 收集 QR / 条码 SVG 快照
    const svgSnapshots = this.collectSvgSnapshots(canvas);

    // 2) 临时从画布移除 QR / 条码，导出剩余矢量部分给 svg2pdf
    const removed = this.detachImageObjects(canvas);
    try {
      const svgElement = await this.canvasToSvgElement(canvas, svgHost, pdf);
      await svg2pdf(svgElement, pdf, {
        x: position.x,
        y: position.y,
        width: widthMm,
        height: heightMm
      });
    } finally {
      this.reattachImageObjects(canvas, removed);
    }

    // 3) QR / 条码独立写入：每个都是顶层 SVG 元素，位置/尺寸由 options 显式控制
    for (const snap of svgSnapshots) {
      const wMm = pxToMm(snap.widthPx);
      const hMm = pxToMm(snap.heightPx);
      const xMm = position.x + pxToMm(snap.centerXPx - snap.widthPx / 2);
      const yMm = position.y + pxToMm(snap.centerYPx - snap.heightPx / 2);
      await svg2pdf(snap.svgElement, pdf, {
        x: xMm,
        y: yMm,
        width: wMm,
        height: hMm
      });
    }
  }

  // ===== QR / 条码快照 =====

  /**
   * 收集画布上 QR / 条码对象的 SVG DOM 元素 + 位置/尺寸。
   * 位置/尺寸用 obj.left/top/width/scaleX（center 锚点）直接算，
   * 不依赖 getBoundingRect（会引入 stroke / padding 像素差）。
   */
  private collectSvgSnapshots(canvas: StaticCanvas): SvgSnapshot[] {
    const snapshots: SvgSnapshot[] = [];
    for (const obj of canvas.getObjects() as any[]) {
      if (!this.isBarcodeOrQrImage(obj)) continue;
      obj.setCoords();
      const src = (obj.getElement && obj.getElement()?.src) || obj.toDataURL({ format: 'png' });
      const svgElement = this.dataUrlToSvgElement(src);
      if (!svgElement) continue;
      snapshots.push({
        svgElement,
        centerXPx: obj.left,
        centerYPx: obj.top,
        widthPx: obj.width * obj.scaleX,
        heightPx: obj.height * obj.scaleY
      });
    }
    return snapshots;
  }

  /**
   * 将 dataURL 包装成独立 <svg> 元素。
   * - SVG dataURL：parseFromString 得到原始 <svg>，保留矢量结构
   * - PNG/JPEG dataURL：构造 <svg><image href="..."/></svg>，svg2pdf 按位图处理
   *   （顶层 <image> 无嵌套 <g transform>，位置由 options 显式控制，不会偏移）
   */
  private dataUrlToSvgElement(dataUrl: string): SVGSVGElement | null {
    if (dataUrl.startsWith('data:image/svg+xml')) {
      const decoded = this.decodeDataUrl(dataUrl);
      const doc = new DOMParser().parseFromString(decoded, 'image/svg+xml');
      const svg = doc.documentElement as unknown as SVGSVGElement;
      return svg.nodeName.toLowerCase() === 'svg' ? svg : null;
    }

    if (dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/jpeg')) {
      // SVG 容器尺寸任意，svg2pdf 通过 options.width/height 控制输出尺寸
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttribute('x', '0');
      image.setAttribute('y', '0');
      image.setAttribute('width', '100');
      image.setAttribute('height', '100');
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

  /**
   * 判断对象是否需要走独立 SVG 路径的 image（QR / 条码）
   */
  private isBarcodeOrQrImage(obj: any): boolean {
    if (!obj || obj.type?.toLowerCase() !== 'image') return false;
    return obj.elementType === 'qrcode' || obj.elementType === 'barcode';
  }

  /**
   * 临时从画布移除 QR / 条码对象，返回被移除的对象引用（便于恢复）
   */
  private detachImageObjects(canvas: StaticCanvas): FabricObject[] {
    const toRemove = (canvas.getObjects() as any[]).filter((o) => this.isBarcodeOrQrImage(o));
    if (toRemove.length > 0) {
      canvas.remove(...toRemove);
    }
    return toRemove as FabricObject[];
  }

  /**
   * 把移除的对象加回画布
   */
  private reattachImageObjects(canvas: StaticCanvas, removed: FabricObject[]): void {
    if (removed.length > 0) {
      canvas.add(...removed);
    }
  }

  // ===== 画布 → SVG =====

  /**
   * 将画布内容导出为 SVG DOM 元素（供 svg2pdf 使用）
   * 同时预注册 SVG 中用到的字体到 jspdf。
   */
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