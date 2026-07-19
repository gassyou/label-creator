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
 *    templates hydrated from older save formats may carry Fabric objects that
 *    have no doc entry yet.
 *
 * Canvas event listener wiring (`canvas.on('selection:*', ...)` etc.) stays
 * on `EditorCanvasService.initialize()` — that wiring forwards the active
 * Fabric object into this service.
 */
import { Injectable, inject, signal } from '@angular/core';
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

  /**
   * Signal — true if any Fabric object is currently active on the canvas.
   * Drives the toolbar's selection-dependent buttons.
   */
  readonly hasSelection = signal(false);

  /**
   * Signal — true if more than one Fabric object is currently active.
   * Drives the multi-selection alignment / distribute toolbar cluster.
   */
  readonly hasMultiSelection = signal(false);

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
      this.hasSelection.set(false);
      this.hasMultiSelection.set(false);
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
      this.hasSelection.set(true);
      this.hasMultiSelection.set(true);
      this.doc.selectElement(null);
      return;
    }

    const id = this.getObjectId(object);
    const element = (this.doc.elements().get(id) ?? null) as BaseElement | null;
    this.selected.set(element);
    this.hasSelection.set(true);
    this.hasMultiSelection.set(false);

    // NOTE: doc.elements() backfill was REMOVED (Phase 18). All elements
    // are now backfilled correctly upstream by `loadPage` (Phase 11) and by
    // `Add*Command` (Phase 6). Backfilling here caused a write→effect→fabric
    // →object:modified→handleFabricSelection→backfill→write loop that
    // manifested as NG0103. If a Fabric object somehow exists without a
    // doc entry (defensive), the central document's `selection` computed
    // returns null and the property panel renders its muted placeholder —
    // acceptable for a pathological case.

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
    // Phase 18 fix: we previously re-entered `handleFabricSelection` here,
    // which mutated `selected` / `hasSelection` signals and re-evaluated
    // every consumer of those signals on every Fabric `object:modified`
    // event. Combined with the doc-driven `applyElementsFromDoc` effect
    // (which causes Fabric to fire `object:modified` echoes when its
    // `set(...)` calls change geometry), this produced NG0103 because
    // each renderer's write queued another full selection re-resolution.
    //
    // The write itself (`handleObjectModified`) is the only thing that
    // needs to happen here — selection state is already in sync (Fabric's
    // active object is unchanged across the modify). The doc write will
    // emit a doc → fabric effect that is itself guarded by `syncDirection`,
    // so we do not need to redo selection work.
    this.renderer.handleObjectModified(object);
  }

  // ---------------------------------------------------------------------
  // private helpers
  // ---------------------------------------------------------------------

  private getObjectId(object: any): string {
    return this.renderer.getObjectId(object);
  }
}