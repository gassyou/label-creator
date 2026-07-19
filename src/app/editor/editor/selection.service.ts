/**
 * Selection service (Phase 3 of the four-layer architecture refactor).
 *
 * Owns the Fabric-event → selection-state half of the editor:
 *  - The selection read API (`selected`, `textEditorVisible`,
 *    `figureEditorVisible`) consumed by the legacy panels.
 *  - The computed proxies `selection` / `selectionProperties` from
 *    {@link LabelDocumentService} consumed by the newer properties panel.
 *  - The two Fabric event handlers:
 *      - {@link handleFabricSelection} — Fabric selection:* / text:changed
 *      - {@link handleFabricModification} — Fabric object:modified
 *
 * Does NOT own:
 *  - Canvas lifecycle or Fabric → geometry: that's `FabricRenderer`.
 *  - Cycle guard (`syncDirection`): that's `FabricRenderer` — read here as
 *    a flag to skip echoes of doc-driven updates.
 *  - Backfill of legacy elements into `doc.elements()`: still required because
 *    `elementRegistry` survives until Phase 6.
 *
 * Canvas event listener wiring (`canvas.on('selection:*', ...)` etc.) stays
 * on `EditorCanvasService.initialize()` — that wiring forwards the active
 * Fabric object into this service.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { FabricRenderer } from '../render/fabric-renderer';
import { LabelDocumentService } from '../document/label-document.service';
import { BaseElement } from '../models/element-base';
import { type LabelElement } from '../models/editor.models';

@Injectable()
export class SelectionService {
  private readonly renderer = inject(FabricRenderer);
  private readonly doc = inject(LabelDocumentService);

  // ---------------------------------------------------------------------
  // Public read API
  // ---------------------------------------------------------------------

  /** Legacy signal — the currently-selected Fabric element, or null. */
  readonly selected = signal<BaseElement | null>(null);

  /** Legacy signal — text editor visible for the selected element. */
  readonly textEditorVisible = signal(false);

  /** Legacy signal — figure editor (fill/stroke/etc.) visible for the selected element. */
  readonly figureEditorVisible = signal(false);

  /** Computed proxies of the doc's selection. */
  readonly selection = this.doc.selection;
  readonly selectionProperties = this.doc.selectionProperties;

  // ---------------------------------------------------------------------
  // Called by EditorCanvasService on Fabric events
  // ---------------------------------------------------------------------

  /**
   * Handles Fabric `selection:created`, `selection:updated`, `selection:cleared`,
   * and `text:changed` events.
   *
   * Mirrors selection into both the legacy signals (consumed by the legacy
   * property panel and the in-page text/figure editor UI) and the central
   * `LabelDocumentService.selectionId` (consumed by doc-level computeds).
   */
  handleFabricSelection(object: any): void {
    if (!object) {
      this.selected.set(null);
      this.textEditorVisible.set(false);
      this.figureEditorVisible.set(false);
      this.doc.selectElement(null);
      return;
    }

    // Check if this is an ActiveSelection (multi-select)
    const isMultiSelect = object.type?.toLowerCase() === 'activeselection';

    object.set({
      hasRotatingPoint: true,
      transparentCorners: false,
      cornerColor: 'rgba(37, 99, 235, 0.7)',
    });

    if (isMultiSelect) {
      // For multi-selection, set a marker that selection exists
      const dummyElement: LabelElement = {
        type: 'rect',
        id: 'multi-select-marker',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
      this.selected.set(dummyElement as unknown as BaseElement);
      this.textEditorVisible.set(false);
      this.figureEditorVisible.set(false);
      this.doc.selectElement(null);
      return;
    }

    const id = this.getObjectId(object);
    const element = (this.elementRegistry().get(id) ?? null) as BaseElement | null;
    this.selected.set(element);

    // Backfill: hydrate doc.elements if the element pre-dates the
    // LabelDocumentService refactor (e.g. elements hydrated from a saved
    // template via loadPage). Without this, the central document's
    // `selection` computed returns null and the property panel renders its
    // muted placeholder instead of the element's properties.
    if (element && !this.doc.elements().has(id)) {
      this.doc.addElement(element as unknown as LabelElement);
    }

    this.textEditorVisible.set(false);
    this.figureEditorVisible.set(false);

    const type = object.type;
    if (type === 'rect' || type === 'circle' || type === 'triangle' || type === 'line') {
      this.figureEditorVisible.set(true);
    } else if (type === 'i-text' || type === 'textbox') {
      this.textEditorVisible.set(true);
    }

    // Mirror selection into the central document so doc consumers can
    // observe it. The local signals above are kept for the legacy panel
    // (until the panels migrate to read from `selection`/`selectionProperties`).
    this.doc.selectElement(id || null);
  }

  /**
   * Handles Fabric `object:modified` events. The actual Fabric → doc write
   * (with cycle guard) is delegated to {@link FabricRenderer.handleObjectModified}.
   * Here we only translate the outcome into selection-state changes:
   *
   *  - If the renderer wrote the patch, refresh selection state (the active
   *    object is the same one that was modified; its signal/panel state
   *    should reflect it).
   *  - If the renderer returned false (echo of a doc-driven update, null
   *    object, or multi-select), refresh selection state without writing.
   */
  handleFabricModification(object: any): void {
    const wrote = this.renderer.handleObjectModified(object);
    if (wrote) {
      this.handleFabricSelection(object);
      return;
    }

    if (!object) {
      this.handleFabricSelection(null);
      return;
    }

    // Echoes of doc-driven updates or multi-select: just refresh the
    // selection state without writing to the document.
    this.handleFabricSelection(this.renderer.getCanvas()?.getActiveObject() ?? null);
  }

  // ---------------------------------------------------------------------
  // private helpers
  // ---------------------------------------------------------------------

  private getObjectId(object: any): string {
    return this.renderer.getObjectId(object);
  }

  /**
   * Read-only access to the legacy element registry. The registry lives on
   * the renderer (Phase 6 will replace this with `doc.elements()`).
   */
  private elementRegistry(): Map<string, any> {
    return this.renderer.getElementRegistry();
  }
}