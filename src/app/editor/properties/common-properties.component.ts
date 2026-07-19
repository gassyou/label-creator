// src/app/editor/properties/common-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-common-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './common-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommonPropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => this.doc.selection());

  /**
   * Returns the selected element's opacity in the 0..100 range used by the UI.
   * Fabric stores opacity in 0..1; the `?? 1` default matches the template's prior behavior.
   */
  protected opacity(sel: NonNullable<ReturnType<typeof this.state>>): number {
    return ((sel as any).opacity ?? 1) * 100;
  }

  protected onOpacityChange(opacityPct: number): void {
    const sel = this.state();
    if (!sel) return;
    // Fabric uses 0..1; UI uses 0..100.
    this.doc.updateElement(sel.id, { opacity: Number(opacityPct) / 100 } as any);
  }
}
