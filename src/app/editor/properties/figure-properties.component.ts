// src/app/editor/properties/figure-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-figure-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './figure-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FigurePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    if (!sel) return null;
    const t = sel.type;
    return t === 'rect' || t === 'circle' || t === 'triangle' || t === 'image' ? sel : null;
  });

  protected onWidthChange(px: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { width: Number(px) } as any);
  }

  protected onHeightChange(px: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { height: Number(px) } as any);
  }

  protected onFillChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { fill: color } as any);
  }

  protected onFillNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { fill: noneChecked ? '' : '#000000' } as any);
  }

  protected onStrokeChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { stroke: color } as any);
  }

  protected onStrokeNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { stroke: noneChecked ? '' : '#000000' } as any);
  }

  protected onStrokeWidthChange(width: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { strokeWidth: Number(width) } as any);
  }
}
