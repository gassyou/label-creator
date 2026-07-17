import { Label, PrintSetting, PX_PER_MM, millimetersToPixels } from '../../editor/models/label.models';
import { LabelGenerator, SvgGenerateOptions } from './label-generator.interface';
import { PrintLayoutCalculator } from './print-layout-calculator';
import {
  RenderCache,
  applyLabelToCanvas,
  createRenderCanvas
} from './fabric-render-helper';

/**
 * SVG 标签生成器
 *
 * 与 PDF 生成器共享 fabric-render-helper 渲染层：
 * 批量场景下复用同一个 StaticCanvas + RenderCache，
 * 首个标签构建对象树后，后续标签只增量更新文本/图片，
 * 避免 N 次 loadFromJSON + N 次图片重解码。
 */
export class SvgLabelGenerator implements LabelGenerator {
  readonly name = 'svg';

  constructor(private printSetting: PrintSetting) {}

  async generate(labels: Label[], options?: SvgGenerateOptions): Promise<Blob | string> {
    if (!labels.length) {
      throw new Error('No labels to generate');
    }

    const multiplier = options?.multiplier ?? 2;

    // 计算排版
    const layout = PrintLayoutCalculator.calculate(
      this.printSetting,
      labels[0].width,
      labels[0].height
    );

    const pageCount = PrintLayoutCalculator.getPageCount(labels.length, layout);

    // 复用同一个 StaticCanvas 与对象树缓存
    // 注：单位与单标签导出保持一致（mm → px × multiplier），与之前仅用 mm × multiplier 的实现有差异；
    // 旧实现会得到 ~80px 画布明显偏小，这里修正为带 DPI 的物理像素尺寸。
    const widthPx = millimetersToPixels(labels[0].width) * multiplier;
    const heightPx = millimetersToPixels(labels[0].height) * multiplier;
    const canvas = createRenderCanvas(widthPx, heightPx);
    const cache: RenderCache = { loaded: false, current: [] };

    // 创建合并 SVG 字符串：所有页面平铺
    const pageSvgs: string[] = [];

    let completed = 0;
    const total = labels.length;

    try {
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const pageLabels = this.getPageLabels(pageIndex, labels, layout);
        const pageSvgsList: string[] = [];

        for (const label of pageLabels) {
          await applyLabelToCanvas(canvas, label, widthPx, heightPx, cache);
          pageSvgsList.push(canvas.toSVG());

          completed++;
          options?.onProgress?.({
            completed,
            total,
            currentPage: pageIndex,
            totalPages: pageCount
          });
        }

        // 拼接同一页的标签
        pageSvgs.push(this.combinePageSvgs(pageSvgsList, layout.paperWidth, layout.paperHeight));
      }
    } finally {
      canvas.dispose();
    }

    // 拼接所有页面
    const combined = this.combineAllPages(pageSvgs, pageCount, layout.paperWidth, layout.paperHeight);

    if (options?.asString) {
      return combined as string;
    }
    return new Blob([combined], { type: 'image/svg+xml' });
  }

  async generateSingle(label: Label, options?: SvgGenerateOptions): Promise<Blob | string> {
    const multiplier = options?.multiplier ?? 2;
    const widthPx = Math.round(label.width * multiplier * PX_PER_MM);
    const heightPx = Math.round(label.height * multiplier * PX_PER_MM);

    const canvas = createRenderCanvas(widthPx, heightPx);
    const cache: RenderCache = { loaded: false, current: [] };

    try {
      await applyLabelToCanvas(canvas, label, widthPx, heightPx, cache);
      const svg = canvas.toSVG();

      if (options?.asString) {
        return svg;
      }
      return new Blob([svg], { type: 'image/svg+xml' });
    } finally {
      canvas.dispose();
    }
  }

  private getPageLabels(pageIndex: number, labels: Label[], layout: ReturnType<typeof PrintLayoutCalculator.calculate>): Label[] {
    const start = pageIndex * layout.labelsPerPage;
    const end = start + layout.labelsPerPage;
    return labels.slice(start, end);
  }

  private combinePageSvgs(svgs: string[], pageWidth: number, pageHeight: number): string {
    if (svgs.length === 0) return '';
    if (svgs.length === 1) return svgs[0];

    const contents: string[] = [];
    for (const svg of svgs) {
      const bodyMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      if (bodyMatch) {
        contents.push(bodyMatch[1]);
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth * PX_PER_MM}" height="${pageHeight * PX_PER_MM}">
${contents.join('\n')}
</svg>`;
  }

  private combineAllPages(pageSvgs: string[], pageCount: number, pageWidth: number, pageHeight: number): string {
    if (pageCount === 0) return '';
    if (pageCount === 1) return pageSvgs[0];

    const contents: string[] = [];
    for (const svg of pageSvgs) {
      const bodyMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      if (bodyMatch) {
        contents.push(bodyMatch[1]);
      }
    }

    const totalHeight = pageHeight * pageCount;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth * PX_PER_MM}" height="${totalHeight * PX_PER_MM}">
${contents.join('\n')}
</svg>`;
  }
}
