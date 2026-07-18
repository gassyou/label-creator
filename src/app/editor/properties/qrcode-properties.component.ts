// src/app/editor/properties/qrcode-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-qrcode-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './qrcode-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrcodePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    return sel?.type === 'qrcode' ? sel : null;
  });

  protected onTextChange(text: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { text } as any);
  }

  protected onForegroundChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { foregroundColor: color } as any);
  }

  protected onForegroundNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { foregroundColor: noneChecked ? '' : '#000000' } as any);
  }

  protected onBackgroundChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { backgroundColor: color } as any);
  }

  protected onBackgroundNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { backgroundColor: noneChecked ? '' : '#ffffff' } as any);
  }

  protected onErrorCorrectionChange(level: 'L' | 'M' | 'Q' | 'H'): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { errorCorrectionLevel: level } as any);
  }
}