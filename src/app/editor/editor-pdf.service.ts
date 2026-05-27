import { Injectable } from '@angular/core';
import { Canvas, FabricImage, Pattern } from 'fabric';
import { LabelPage, millimetersToPixels } from './models/editor.models';

@Injectable()
export class EditorPdfService {
  async exportDocument(pages: LabelPage[], fileName = 'document.pdf'): Promise<void> {
    if (!pages.length) {
      return;
    }

    const { jsPDF } = await import('jspdf');
    let pdf: InstanceType<typeof jsPDF> | null = null;

    for (const [index, page] of pages.entries()) {
      const pageImage = await this.renderPageToPng(page);

      if (!pdf) {
        pdf = new jsPDF({
          orientation: page.widthMm > page.heightMm ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [page.widthMm, page.heightMm]
        });
      } else {
        pdf.addPage([page.widthMm, page.heightMm], page.widthMm > page.heightMm ? 'landscape' : 'portrait');
      }

      pdf.addImage(pageImage, 'PNG', 0, 0, page.widthMm, page.heightMm, `page-${index}`, 'FAST');
    }

    pdf?.save(fileName);
  }

  private async renderPageToPng(page: LabelPage): Promise<string> {
    const element = document.createElement('canvas');
    const canvas = new Canvas(element, {
      selection: false,
      renderOnAddRemove: false
    });

    // 将毫米转换为像素
    const widthPx = millimetersToPixels(page.widthMm);
    const heightPx = millimetersToPixels(page.heightMm);

    canvas.setDimensions({
      width: widthPx,
      height: heightPx
    });

    if (page.backgroundImage) {
      const image = await FabricImage.fromURL(page.backgroundImage);
      canvas.backgroundColor = new Pattern({
        source: image.getElement(),
        repeat: 'repeat'
      });
    } else {
      canvas.backgroundColor = page.backgroundColor;
    }

    if (page.canvasJson) {
      await canvas.loadFromJSON(page.canvasJson);
    }

    canvas.requestRenderAll();
    const png = canvas.toDataURL({ format: 'png', multiplier: 2 });
    canvas.dispose();
    return png;
  }
}
