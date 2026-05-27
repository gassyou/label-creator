import { Label, PrintSetting, millimetersToPixels } from '../../editor/models/label.models';
import { Canvas } from 'fabric';
import { LabelGenerator, PngGenerateOptions } from './label-generator.interface';
import { PrintLayoutCalculator } from './print-layout-calculator';

/**
 * PNG 标签生成器
 */
export class PngLabelGenerator implements LabelGenerator {
  readonly name = 'png';

  constructor(private printSetting: PrintSetting) {}

  async generate(labels: Label[], options?: PngGenerateOptions): Promise<Blob> {
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

    // 创建合并画布：所有页面纵向平铺
    const totalWidth = layout.paperWidth;
    const totalHeight = layout.paperHeight * pageCount;

    const element = document.createElement('canvas');
    element.width = millimetersToPixels(totalWidth);
    element.height = millimetersToPixels(totalHeight);

    const ctx = element.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, element.width, element.height);

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const pageLabels = this.getPageLabels(pageIndex, labels, layout);
      const pageOffsetY = millimetersToPixels(layout.paperHeight * pageIndex);

      for (const label of pageLabels) {
        const pageImage = await this.renderLabelToPng(label, multiplier);
        const img = await this.loadImage(pageImage);
        ctx.drawImage(img, 0, pageOffsetY);
      }
    }

    return this.canvasToBlob(element);
  }

  async generateSingle(label: Label, options?: PngGenerateOptions): Promise<Blob> {
    const pngData = await this.renderLabelToPng(label, options?.multiplier ?? 2);
    const img = await this.loadImage(pngData);

    const targetMax = options?.thumbnailMaxDimension ?? 200;
    const isThumbnail = options?.thumbnail ?? false;

    if (isThumbnail) {
      // 计算等比缩放
      const scale = Math.min(targetMax / img.width, targetMax / img.height);
      const newWidth = Math.round(img.width * scale);
      const newHeight = Math.round(img.height * scale);

      const element = document.createElement('canvas');
      element.width = newWidth;
      element.height = newHeight;
      const ctx = element.getContext('2d')!;
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      return this.canvasToBlob(element);
    }

    const element = document.createElement('canvas');
    element.width = img.width;
    element.height = img.height;
    const ctx = element.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    return this.canvasToBlob(element);
  }

  private getPageLabels(pageIndex: number, labels: Label[], layout: ReturnType<typeof PrintLayoutCalculator.calculate>): Label[] {
    const start = pageIndex * layout.labelsPerPage;
    const end = start + layout.labelsPerPage;
    return labels.slice(start, end);
  }

  private async renderLabelToPng(label: Label, multiplier: number): Promise<string> {
    const element = document.createElement('canvas');
    const canvas = new Canvas(element, {
      selection: false,
      renderOnAddRemove: false
    });

    const widthPx = millimetersToPixels(label.width);
    const heightPx = millimetersToPixels(label.height);

    canvas.setDimensions({ width: widthPx, height: heightPx });
    canvas.backgroundColor = label.backgroundColor;

    if (label.canvasJson) {
      await canvas.loadFromJSON(label.canvasJson);
    }

    canvas.requestRenderAll();
    const png = canvas.toDataURL({ format: 'png', multiplier });
    canvas.dispose();
    return png;
  }

  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Blob {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to convert canvas to blob'));
      }, 'image/png');
    }) as unknown as Blob;
  }
}
