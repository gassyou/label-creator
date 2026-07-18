import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EditorCanvasService } from '../editor-canvas.service';
import { LabelDocumentService } from '../document';

/**
 * JSON preview pane. Subscribes to two sources:
 *  - the document's selectionId (filters by id when set);
 *  - the canvas revision signal (re-renders on any canvas-only change,
 *    e.g. async image render completion that doesn't go through the document).
 *
 * Source of truth for serializable shape is `canvas.toCanvasJson()` — the
 * Fabric `toJSON()` projection — so what the user sees matches what's saved
 * to `Label.canvasJson`.
 */
@Component({
  selector: 'app-json-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-preview.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonPreviewComponent {
  private doc = inject(LabelDocumentService);
  private canvas = inject(EditorCanvasService);

  protected readonly preview = computed(() => {
    // Subscribe to revision so async-only canvas updates also refresh us.
    this.canvas.revision();

    const full = this.canvas.toCanvasJson() ?? {};
    const id = this.doc.selectionId();
    if (!id) {
      return JSON.stringify(full, null, 2);
    }

    const objects = (full as { objects?: Array<{ id?: string }> }).objects ?? [];
    const one = objects.find((o) => o?.id === id);
    if (!one) {
      // Selection stale (object removed). Fall back to full.
      return JSON.stringify(full, null, 2);
    }

    const filtered = {
      background: (full as { background?: unknown }).background,
      width: (full as { width?: unknown }).width,
      height: (full as { height?: unknown }).height,
      objects: [one],
    };
    return JSON.stringify(filtered, null, 2);
  });
}