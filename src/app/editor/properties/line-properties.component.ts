import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-line-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './line-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    return sel?.type === 'line' ? sel : null;
  });

  /**
   * Persist the user-entered line length as a width on the central doc.
   * The on-canvas line is rendered from `(x, y) → (x + width, y)`, so the
   * "Length" field is structurally a width delta — keeping it under a
   * separate `length` field on the doc would diverge from the rendered
   * shape (see {@link LineElement.fromFabricObject} which derives width
   * from `x2 - x1`).
   */
  protected onLengthChange(px: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { width: Number(px) } as any);
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
