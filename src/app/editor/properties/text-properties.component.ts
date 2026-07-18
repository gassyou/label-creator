// src/app/editor/properties/text-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-text-properties',
  standalone: true,
  imports: [CommonModule, FormsModule, NzIconModule],
  templateUrl: './text-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextPropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    return sel?.type === 'text' ? sel : null;
  });

  protected onColorChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { color } as any);
  }

  protected onColorNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { color: noneChecked ? '' : '#000000' } as any);
  }

  protected onFontFamilyChange(family: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { fontFamily: family } as any);
  }

  protected onFontSizeChange(size: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { fontSize: Number(size) } as any);
  }

  protected onBoldToggle(): void {
    const sel = this.state();
    if (!sel) return;
    const cur = $any(sel).fontWeight === 'bold' ? 'normal' : 'bold';
    this.doc.updateElement(sel.id, { fontWeight: cur } as any);
  }

  protected onItalicToggle(): void {
    const sel = this.state();
    if (!sel) return;
    const cur = $any(sel).fontStyle === 'italic' ? 'normal' : 'italic';
    this.doc.updateElement(sel.id, { fontStyle: cur } as any);
  }

  protected onUnderlineToggle(): void {
    const sel = this.state();
    if (!sel) return;
    const cur = ($any(sel).textDecoration ?? '').includes('underline') ? '' : 'underline';
    this.doc.updateElement(sel.id, { textDecoration: cur } as any);
  }

  protected onAlignChange(align: 'left' | 'center' | 'right'): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { textAlign: align } as any);
  }
}
