import { Injectable, inject } from '@angular/core';
import { jsPDF } from 'jspdf';
import { LabelTemplate, PrintSetting, getPaperSize, DEFAULT_PRINT_SETTING } from '../editor/models/label.models';
import { BindingResolverService } from '../editor/services/binding-resolver.service';
import { generateBarcode, generateQRCode } from './barcode-generator';

@Injectable()
export class PrintService {
  private readonly bindingResolver = inject(BindingResolverService);

  /**
   * Generate labels PDF from template and data array
   */
  async generateLabelsPdf(
    template: LabelTemplate,
    data: Record<string, any>[]
  ): Promise<Blob> {
    const settings = { ...DEFAULT_PRINT_SETTING, ...template.printSetting };
    const { width, height, canvasJson } = template;

    // 1. Get paper size
    const paperSize = getPaperSize(
      settings.paperSize,
      settings.orientation,
      settings.customPaperWidth,
      settings.customPaperHeight
    );

    // 2. Calculate layout
    const layout = this.calculateLayout(
      paperSize.width,
      paperSize.height,
      width,
      height,
      settings
    );

    // 3. Create PDF
    const pdf = new jsPDF({
      orientation: settings.orientation,
      unit: 'mm',
      format: settings.paperSize === 'custom' ? 'a4' : settings.paperSize
    });

    // 4. Generate each label
    let labelIndex = 0;
    for (const record of data) {
      const pageLabelIndex = labelIndex % layout.labelsPerPage;
      const col = pageLabelIndex % layout.colsPerRow;
      const row = Math.floor(pageLabelIndex / layout.colsPerRow);

      // New page if needed
      if (pageLabelIndex === 0 && labelIndex > 0) {
        pdf.addPage();
      }

      // Calculate position
      const x = settings.marginLeft + col * (width + settings.gapX);
      const y = settings.marginTop + row * (height + settings.gapY);

      // Render label
      await this.renderLabelToPdf(pdf, canvasJson, record, x, y, width, height);
      labelIndex++;
    }

    return pdf.output('blob');
  }

  private calculateLayout(
    paperWidth: number,
    paperHeight: number,
    labelWidth: number,
    labelHeight: number,
    settings: PrintSetting
  ) {
    const availableWidth = paperWidth - settings.marginLeft - settings.marginRight;
    const availableHeight = paperHeight - settings.marginTop - settings.marginBottom;

    const colsPerRow = Math.floor((availableWidth + settings.gapX) / (labelWidth + settings.gapX));
    const rowsPerColumn = Math.floor((availableHeight + settings.gapY) / (labelHeight + settings.gapY));

    return {
      colsPerRow: Math.max(1, colsPerRow),
      rowsPerColumn: Math.max(1, rowsPerColumn),
      labelsPerPage: Math.max(1, colsPerRow * rowsPerColumn)
    };
  }

  private async renderLabelToPdf(
    pdf: jsPDF,
    canvasJson: string,
    data: Record<string, any>,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    let parsed: any;
    try {
      parsed = JSON.parse(canvasJson);
    } catch (e) {
      console.error('Failed to parse canvas JSON:', e);
      pdf.setDrawColor('#ff0000');
      pdf.setLineWidth(0.5);
      pdf.rect(x, y, width, height);
      pdf.setFontSize(10);
      pdf.setTextColor('#ff0000');
      pdf.text('Parse Error', x + 2, y + height / 2);
      return;
    }

    try {
      this.resolveBindingsInObjects(parsed.objects || [], data);

      for (const obj of parsed.objects || []) {
        if (obj.type === 'i-text' || obj.type === 'textbox') {
          const fontSize = obj.fontSize || 12;
          pdf.setFontSize(fontSize);
          pdf.setTextColor(obj.fill || '#000000');
          const text = obj.text || '';
          const objX = x + (obj.left || 0);
          const objY = y + (obj.top || 0) + fontSize / 3;
          pdf.text(text, objX, objY);
        } else if (obj.type === 'image' && obj.src) {
          try {
            pdf.addImage(obj.src, 'PNG', x + (obj.left || 0), y + (obj.top || 0), obj.width || width, obj.height || height);
          } catch (e) {
            console.error('Failed to add image to PDF:', e);
          }
        }
      }
    } catch (e) {
      console.error('Failed to render label:', e);
      pdf.setDrawColor('#ff0000');
      pdf.setLineWidth(0.5);
      pdf.rect(x, y, width, height);
      pdf.setFontSize(10);
      pdf.setTextColor('#ff0000');
      pdf.text('Render Error', x + 2, y + height / 2);
    }
  }

  private resolveBindingsInObjects(objects: any[], data: Record<string, any>): void {
    if (!objects) return;

    for (const obj of objects) {
      // Resolve text bindings
      if (obj.text) {
        obj.text = this.bindingResolver.resolveTemplate(obj.text, data);
      }

      // Resolve custom binding properties
      if (obj.bindingValue) {
        obj.bindingValue = this.bindingResolver.resolveTemplate(obj.bindingValue, data);

        // Generate new barcode/qrcode image
        if (obj.elementType === 'barcode' && obj.barcodeFormat) {
          obj.src = generateBarcode(obj.bindingValue, obj.barcodeFormat, obj.height || 50);
        } else if (obj.elementType === 'qrcode') {
          obj.src = generateQRCode(obj.bindingValue, obj.width || 100);
        }
      }
    }
  }
}