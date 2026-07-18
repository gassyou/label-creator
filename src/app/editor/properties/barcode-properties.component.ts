// src/app/editor/properties/barcode-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-barcode-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './barcode-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarcodePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    return sel?.type === 'barcode' ? sel : null;
  });

  protected onFormatChange(format: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { barcodeFormat: format } as any);
  }

  protected onTextChange(text: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { text } as any);
  }

  protected onShowTextChange(show: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { showText: !!show } as any);
  }
}