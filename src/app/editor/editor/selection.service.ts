/**
 * Selection service (Phase 3 of the four-layer architecture refactor).
 *
 * Owns the Fabric-event → selection-state half of the editor:
 *  - The `hasSelection` / `hasMultiSelection` signals consumed by the
 *    toolbar buttons.
 *  - The computed proxies `selection` / `selectionProperties` from
 *    {@link LabelDocumentService} consumed by the properties panel.
 *  - The two Fabric event handlers:
 *      - {@link handleFabricSelection} — Fabric selection:* / text:changed
 *      - {@link handleFabricModification} — Fabric object:modified
 *
 * Does NOT own:
 *  - Canvas lifecycle or Fabric → geometry: that's `FabricRenderer`.
 *  - Cycle guard (`syncDirection`): that's `FabricRenderer` — read here as
 *    a flag to skip echoes of doc-driven updates.
 *
 * Canvas event listener wiring (`canvas.on('selection:*', ...)` etc.) stays
 * on the editor shell, which forwards the active Fabric object into this
 * service via `initializeCanvas`.
 */
import { Injectable, inject, signal } from '@angular/core';
import { FabricRenderer } from '../render/fabric-renderer';
import { LabelDocumentService } from '../document/label-document.service';

/** Sentinel id used to mark a Fabric ActiveSelection so `reconcileDocFromCanvas`
 *  skips it (multi-select has no backing doc element). Shared via this constant
 *  so the writer (`handleFabricSelection`) and reader (`reconcileDocFromCanvas`)
 *  agree without a string-literal duplication. */
export const MULTI_SELECT_MARKER_ID = 'multi-select-marker';

@Injectable()
export class SelectionService {
  private readonly renderer = inject(FabricRenderer);
  private readonly doc = inject(LabelDocumentService);

  // ---------------------------------------------------------------------
  // Public read API
  // ---------------------------------------------------------------------

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
  // Fabric event handlers — wired by the editor shell on initializeCanvas
  // ---------------------------------------------------------------------

  /**
   * Handles Fabric `selection:created`, `selection:updated`, `selection:cleared`,
   * and `text:changed` events. Mirrors selection into:
   *  - the toolbar's `hasSelection` / `hasMultiSelection` flags, and
   *  - the central `LabelDocumentService.selectionId` consumed by the
   *    properties panel via `selection` / `selectionProperties`.
   *
   * For text objects, also persists the new text back to the doc on every
   * keystroke so the doc ↔ fabric reconciliation doesn't overwrite the
   * user's input back to the placeholder ('Text') on the next effect run.
   */
  handleFabricSelection(object: any): void {
    if (!object) {
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
      // Multi-selection: keep the selection signals true but don't pin a
      // single doc element as "selected" — the property panel renders the
      // empty state until the user collapses to a single selection.
      this.hasSelection.set(true);
      this.hasMultiSelection.set(true);
      this.doc.selectElement(null);
      return;
    }

    const id = this.getObjectId(object);
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

    // Mirror selection into the central document so doc consumers can
    // observe it.
    this.doc.selectElement(id || null);

    // Fabric's `text:changed` fires on every keystroke. Persist the new
    // text into the central document so the doc ↔ fabric reconciliation
    // doesn't overwrite the user's input back to the placeholder ('Text')
    // on the next effect run. Only write when the value actually changed
    // (avoids re-triggering the doc → fabric effect on no-op edits) and
    // skip if the doc already carries the same value. The cycle guard on
    // applyElementsFromDoc prevents the echoed effect from looping.
    const type = object.type;
    if ((type === 'i-text' || type === 'textbox') && id) {
      const nextText = typeof object.text === 'string' ? object.text : '';
      const cur = this.doc.elements().get(id) as any;
      if (cur && cur.text !== nextText) {
        this.doc.updateElement(id, { text: nextText } as any);
      }
    }
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