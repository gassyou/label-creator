import { Injectable } from '@angular/core';
import { Canvas, FabricImage, Pattern } from 'fabric';
import { EditorPage } from './editor.models';

@Injectable()
export class EditorPdfService {
  async exportDocument(pages: EditorPage[], fileName = 'document.pdf'): Promise<void> {
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

  private async renderPageToPng(page: EditorPage): Promise<string> {
    const element = document.createElement('canvas');
    const canvas = new Canvas(element, {
      selection: false,
      renderOnAddRemove: false
    });

    canvas.setDimensions({
      width: page.canvasState.width,
      height: page.canvasState.height
    });

    if (page.canvasState.backgroundImage) {
      const image = await FabricImage.fromURL(page.canvasState.backgroundImage);
      canvas.backgroundColor = new Pattern({
        source: image.getElement(),
        repeat: 'repeat'
      });
    } else {
      canvas.backgroundColor = page.canvasState.backgroundColor;
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
