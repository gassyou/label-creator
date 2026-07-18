// src/app/editor/document/label-document.service.ts
import { Injectable, computed, signal } from '@angular/core';
import {
  DEFAULT_SELECTION_STATE,
  type EditorSelectionState,
  type LabelElement,
} from '../models/editor.models';
import {
  DEFAULT_PAGE_SETTINGS,
  type LabelPageSettings,
} from './label-document';

/**
 * Runtime central model. Single source of truth for the editor's editing
 * state. Observed by both `EditorCanvasService` (Fabric adapter) and the
 * property panels via signals + `effect`.
 *
 * Mutations are coarse: `updateElement(id, patch)` shallow-merges the patch
 * into the element's data and replaces the `elements` Map with a new one.
 * Consumers' `computed`/`effect` re-run because the Map reference changes.
 */
@Injectable()
export class LabelDocumentService {
  // ----- state signals -----
  readonly page = signal<LabelPageSettings>({ ...DEFAULT_PAGE_SETTINGS });
  readonly elements = signal<ReadonlyMap<string, LabelElement>>(new Map());
  readonly selectionId = signal<string | null>(null);

  // ----- selectors -----
  readonly selection = computed<LabelElement | null>(() => {
    const id = this.selectionId();
    if (!id) return null;
    return this.elements().get(id) ?? null;
  });

  readonly selectionProperties = computed<EditorSelectionState>(() => {
    const sel = this.selection();
    return sel ? this.toProperties(sel) : { ...DEFAULT_SELECTION_STATE };
  });

  // ----- page mutations -----
  setPageSize(widthMm: number, heightMm: number): void {
    this.page.update((p) => ({ ...p, widthMm, heightMm }));
  }

  setPageBackground(color: string | null, image?: string | null): void {
    this.page.update((p) => ({
      ...p,
      backgroundColor: color ?? undefined,
      backgroundImage: image ?? undefined,
    }));
  }

  // ----- element mutations -----
  addElement(state: LabelElement): void {
    if (!state?.id) {
      throw new Error('LabelDocumentService.addElement: element must have an id');
    }
    this.elements.update((m) => {
      const next = new Map(m);
      next.set(state.id, state);
      return next;
    });
  }

  /**
   * Main write entry. Shallow-merges `patch` into the element identified by
   * `id`. No-op if the id is not present. Preserves the `id` and `type`
   * fields — callers cannot rename either via patch.
   */
  updateElement(id: string, patch: Partial<LabelElement>): void {
    this.elements.update((m) => {
      const current = m.get(id);
      if (!current) return m;
      const next = new Map(m);
      next.set(id, { ...current, ...patch, id, type: current.type } as LabelElement);
      return next;
    });
  }

  removeElement(id: string): void {
    this.elements.update((m) => {
      if (!m.has(id)) return m;
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    if (this.selectionId() === id) {
      this.selectionId.set(null);
    }
  }

  selectElement(id: string | null): void {
    this.selectionId.set(id);
  }

  // ----- internal: ElementState → EditorSelectionState projection -----
  private toProperties(s: LabelElement): EditorSelectionState {
    // ElementState is an open shape (LabelElement union members satisfy it).
    // We pluck only the fields the property panels care about.
    const anyState = s as unknown as Record<string, unknown>;
    return {
      id: anyState['id'] as string,
      type: (anyState['type'] as EditorSelectionState['type']) ?? undefined,
      opacity: Number(anyState['opacity'] ?? 1) * 100,
      width: anyState['width'] as number | undefined,
      height: anyState['height'] as number | undefined,
      length: anyState['length'] as number | undefined,
      fill: anyState['fill'] as string | undefined,
      stroke: anyState['stroke'] as string | undefined,
      strokeWidth: anyState['strokeWidth'] as number | undefined,
      color: anyState['color'] as string | undefined,
      text: anyState['text'] as string | undefined,
      fontFamily: anyState['fontFamily'] as string | undefined,
      fontSize: anyState['fontSize'] as number | undefined,
      fontWeight: anyState['fontWeight'] as string | undefined,
      fontStyle: anyState['fontStyle'] as string | undefined,
      textAlign: anyState['textAlign'] as string | undefined,
      textDecoration: anyState['textDecoration'] as string | undefined,
      barcodeFormat: anyState['barcodeFormat'] as string | undefined,
      showText: anyState['showText'] as boolean | undefined,
      errorCorrectionLevel: anyState['errorCorrectionLevel'] as string | undefined,
      foregroundColor: anyState['foregroundColor'] as string | undefined,
      backgroundColor: anyState['backgroundColor'] as string | undefined,
    };
  }
}
