import { Label, PrintSetting, millimetersToPixels } from '../../editor/models/label.models';
import { Canvas, FabricImage, Pattern } from 'fabric';
import { LabelGenerator, PdfGenerateOptions } from './label-generator.interface';
import { PrintLayoutCalculator } from './print-layout-calculator';

/**
 * PDF 标签生成器
 */
export class PdfLabelGenerator implements LabelGenerator {
  readonly name = 'pdf';

  constructor(private printSetting: PrintSetting) {}

  async generate(labels: Label[], options?: PdfGenerateOptions): Promise<Blob> {
    if (!labels.length) {
      throw new Error('No labels to generate');
    }

    const { jsPDF } = await import('jspdf');
    const multiplier = options?.multiplier ?? 2;

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

    // 分页渲染
    const pageCount = PrintLayoutCalculator.getPageCount(labels.length, layout);

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      // 添加新页面（第一页已经创建）
      if (pageIndex > 0) {
        pdf.addPage([layout.paperWidth, layout.paperHeight], orientation);
      }

      const pageLabels = this.getPageLabels(pageIndex, labels, layout);

      for (let i = 0; i < pageLabels.length; i++) {
        const label = pageLabels[i];
        const pageImage = await this.renderLabelToPng(label, multiplier);

        const position = PrintLayoutCalculator.getPosition(i, layout);

        pdf.addImage(
          pageImage,
          'PNG',
          position.x,
          position.y,
          layout.labelWidth,
          layout.labelHeight,
          `label-${pageIndex}-${i}`,
          'FAST'
        );
      }
    }

    return pdf.output('blob');
  }

  async generateSingle(label: Label, options?: PdfGenerateOptions): Promise<Blob> {
    if (!label) {
      throw new Error('No label to generate');
    }

    const { jsPDF } = await import('jspdf');
    const multiplier = options?.multiplier ?? 2;

    const orientation = this.getOrientation(options?.orientation, label.width, label.height);

    // 直接使用标签的宽高作为 PDF 页面大小
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [label.width, label.height]
    });

    // 渲染标签为 PNG 并添加到 PDF（居中填充整个页面）
    const pageImage = await this.renderLabelToPng(label, multiplier);

    pdf.addImage(
      pageImage,
      'PNG',
      0,
      0,
      label.width,
      label.height,
      `label-single`,
      'FAST'
    );

    return pdf.output('blob');
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

    if (label.backgroundImage) {
      try {
        const bgImg = await FabricImage.fromURL(label.backgroundImage);
        const pattern = new Pattern({
          source: bgImg.getElement(),
          repeat: 'repeat'
        });
        canvas.backgroundColor = pattern;
      } catch (err) {
        console.error('Failed to load background image:', err);
      }
    }

    if (label.canvasJson) {
      await canvas.loadFromJSON(label.canvasJson);
    }

    canvas.requestRenderAll();
    const png = canvas.toDataURL({ format: 'png', multiplier });
    canvas.dispose();
    return png;
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
