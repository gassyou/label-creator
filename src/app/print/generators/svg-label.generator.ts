import { Label, PrintSetting } from '../../editor/models/label.models';
import { Canvas, FabricImage, Pattern } from 'fabric';
import { LabelGenerator, SvgGenerateOptions } from './label-generator.interface';
import { PrintLayoutCalculator } from './print-layout-calculator';

/**
 * SVG 标签生成器
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

    // 创建合并 SVG 字符串：所有页面平铺
    const pageSvgs: string[] = [];

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const pageLabels = this.getPageLabels(pageIndex, labels, layout);
      const pageSvgsList: string[] = [];

      for (const label of pageLabels) {
        const svg = await this.renderLabelToSvg(label, multiplier);
        pageSvgsList.push(svg);
      }

      // 拼接同一页的标签
      pageSvgs.push(this.combinePageSvgs(pageSvgsList, layout.paperWidth, layout.paperHeight));
    }

    // 拼接所有页面
    const combined = this.combineAllPages(pageSvgs, pageCount, layout.paperWidth, layout.paperHeight);

    if (options?.asString) {
      return combined as string;
    }
    return new Blob([combined], { type: 'image/svg+xml' });
  }

  async generateSingle(label: Label, options?: SvgGenerateOptions): Promise<Blob | string> {
    const svg = await this.renderLabelToSvg(label, 2);

    if (options?.asString) {
      return svg;
    }
    return new Blob([svg], { type: 'image/svg+xml' });
  }

  private getPageLabels(pageIndex: number, labels: Label[], layout: ReturnType<typeof PrintLayoutCalculator.calculate>): Label[] {
    const start = pageIndex * layout.labelsPerPage;
    const end = start + layout.labelsPerPage;
    return labels.slice(start, end);
  }

  private async renderLabelToSvg(label: Label, multiplier: number): Promise<string> {
    const element = document.createElement('canvas');
    const canvas = new Canvas(element, {
      selection: false,
      renderOnAddRemove: false
    });

    const widthPx = Math.round(label.width * multiplier);
    const heightPx = Math.round(label.height * multiplier);

    canvas.setDimensions({ width: widthPx, height: heightPx });
    canvas.backgroundColor = label.backgroundColor;

    if (label.backgroundImage) {
      try {
        const bgImg = await FabricImage.fromURL(label.backgroundImage);
        const pattern = new Pattern({
          source: bgImg.getElement(),
          repeat: 'repeat'
        });
        canvas.backgroundColor = pattern;
      } catch (err) {
        console.error('[renderLabelToSvg] failed to load background image:', err);
      }
    }

    if (label.canvasJson) {
      await canvas.loadFromJSON(label.canvasJson);
    }

    const svg = canvas.toSVG();
    canvas.dispose();
    return svg;
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

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}">
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
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${totalHeight}">
${contents.join('\n')}
</svg>`;
  }
}