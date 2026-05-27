import { Label, millimetersToPixels } from '../../editor/models/label.models';
import { Canvas } from 'fabric';
import { LabelGenerator, PngGenerateOptions } from './label-generator.interface';

/**
 * PNG 标签生成器
 */
export class PngLabelGenerator implements LabelGenerator {
  readonly name = 'png';

  async generate(labels: Label[], options?: PngGenerateOptions): Promise<Blob> {
    if (!labels.length) {
      throw new Error('No labels to generate');
    }

    // PNG 生成器生成所有标签到单个合并画布
    const totalWidth = labels.reduce((sum, l) => sum + millimetersToPixels(l.width), 0);
    const maxHeight = Math.max(...labels.map(l => millimetersToPixels(l.height)));

    const element = document.createElement('canvas');
    element.width = totalWidth;
    element.height = maxHeight;

    const ctx = element.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalWidth, maxHeight);

    let offsetX = 0;
    for (const label of labels) {
      const pngData = await this.renderLabelToPng(label, options?.multiplier ?? 2);
      const img = await this.loadImage(pngData);
      ctx.drawImage(img, offsetX, 0);
      offsetX += img.width;
    }

    return this.canvasToBlob(element);
  }

  async generateSingle(label: Label, options?: PngGenerateOptions): Promise<Blob> {
    const pngData = await this.renderLabelToPng(label, options?.multiplier ?? 2);
    const img = await this.loadImage(pngData);

    const element = document.createElement('canvas');
    element.width = img.width;
    element.height = img.height;
    const ctx = element.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    return this.canvasToBlob(element);
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
