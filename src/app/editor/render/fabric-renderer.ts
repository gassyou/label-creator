/**
 * Render layer (Phase 1 of the four-layer architecture refactor).
 *
 * Owns:
 *  - The Fabric canvas lifecycle (initialization, disposal)
 *  - The doc → fabric reconciliation (applyElementsFromDoc / applyPageFromDoc)
 *  - The tri-state `syncDirection` cycle guard
 *  - Render helpers exposed via {@link RenderContext} (`randomId`, `extend`,
 *    `extendWithCustomProperties`)
 *
 * Does NOT own:
 *  - Selection state (Phase 3 → SelectionService)
 *  - Geometric operations (Phase 4 → OperationsService)
 *  - Snapshot stacks (Phase 2 → UndoRedoService)
 *
 * The cycle guard was upgraded from a boolean flag to a tri-state signal:
 * `syncDirection: signal<'idle' | 'doc-to-fabric' | 'fabric-to-doc'>`. Any
 * Fabric event arriving while syncDirection !== 'idle' is an echo of an
 * in-flight sync and is suppressed. See the design spec §"Deep Dive > Cycle
 * guard: replace boolean with syncDirection" for the rationale.
 */
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Canvas, FabricImage, FabricObject } from 'fabric';
import type { LabelElement } from '../models/editor.models';
import { PX_PER_MM } from '../models/label.models';
import { LabelDocumentService } from '../document/label-document.service';
import type { LabelPageSettings } from '../document/label-document';
import type { RenderContext } from '../models/element-base';

export type SyncDirection = 'idle' | 'doc-to-fabric' | 'fabric-to-doc';

/**
 * Extra FabricImage fields that the editor attaches for qrcode / barcode /
 * image elements. Registering them on the FabricImage class makes
 * `fabric.toJSON()` include them automatically (otherwise the override
 * pattern we relied on was unreliable across fabric.js versions, and on
 * save+load `elementType` was silently dropped — which made `loadPage`
 * rebuild the element as a plain `image`).
 */
const FABRIC_IMAGE_CUSTOM_PROPS = [
  'elementType',
  'bindingValue',
  'barcodeFormat',
  'showText',
  'errorCorrectionLevel',
  'foregroundColor',
  'backgroundColor',
] as const;
(FabricImage as unknown as { customProperties: readonly string[] }).customProperties = [
  ...((FabricImage as unknown as { customProperties?: readonly string[] }).customProperties ?? []),
  ...FABRIC_IMAGE_CUSTOM_PROPS,
];

/**
 * Callbacks the renderer fires when Fabric raises canvas events.
 * `EditorCanvasService` (or any editor-layer facade) supplies these when
 * calling {@link FabricRenderer.initialize} so the renderer owns the
 * canvas lifecycle end-to-end: construction, event wiring, interaction
 * mode, and requestRenderAll — without leaking Fabric-instance-specific
 * references to callers.
 */
export interface FabricEditorEvents {
  onSelectionCreated?: (obj: FabricObject | null) => void;
  onSelectionUpdated?: (obj: FabricObject | null) => void;
  onSelectionCleared?: () => void;
  onObjectAdded?: () => void;
  onObjectModified?: (obj: FabricObject | null) => void;
  onObjectRemoved?: () => void;
  onTextChanged?: (obj: FabricObject | null) => void;
}

@Injectable()
export class FabricRenderer {
  private readonly doc = inject(LabelDocumentService);

  private canvas: Canvas | null = null;
  private canvasElement: HTMLCanvasElement | null = null;

  readonly syncDirection = signal<SyncDirection>('idle');

  /**
   * Canvas revision counter — bumped by {@link touchRevision} when the
   * Fabric canvas changes (object added, geometry modified, etc.).
   * Consumed by the editor template (`isDirty`), the JSON preview, and
   * the `EditorCommandContext` so the Add, Delete, and Clear commands
   * can notify downstream signals after they mutate the canvas.
   *
   * The legacy EditorCanvasService owned this signal; it now lives here
   * because the renderer is the natural single source of truth for
   * "the canvas changed."
   */
  readonly revision = signal(0);

  /** While true, calls to {@link touchRevision} are suppressed. Set by
   *  undo/redo during snapshot restore so the resulting doc → fabric
   *  reconciliation doesn't bump the dirty marker. */
  private hydrating = false;

  /** Current interaction mode (false = select/edit, true = drawing). */
  private drawingMode = false;

  /**
   * Returns the image's natural pixel size from a Fabric object, falling
   * back across Fabric API versions. Used to derive scaleX/Y so that
   * `width * scaleX == targetVisualWidth` holds regardless of how many
   * times `set('width', …)` was called before (each call drifts
   * `obj.width` away from the natural pixel size, which makes
   * `scaleToWidth` compute the wrong scale).
   */
  private readNaturalSize(obj: any): { naturalW: number; naturalH: number } {
    const fromOriginal =
      typeof obj.getOriginalSize === 'function' ? obj.getOriginalSize() : null;
    if (fromOriginal && fromOriginal.width > 0 && fromOriginal.height > 0) {
      return { naturalW: fromOriginal.width, naturalH: fromOriginal.height };
    }
    const el = obj._element as HTMLImageElement | HTMLCanvasElement | undefined;
    if (el && (el as any).naturalWidth > 0 && (el as any).naturalHeight > 0) {
      return {
        naturalW: (el as any).naturalWidth,
        naturalH: (el as any).naturalHeight,
      };
    }
    // Last resort: trust current width/height. Caller guards against <= 0.
    return { naturalW: obj.width ?? 0, naturalH: obj.height ?? 0 };
  }

  constructor() {
    // document → fabric: re-render elements when the document changes.
    // Suppressed while a fabric → doc write is in flight (echo prevention).
    //
    // PHASE 20 FIX: `syncDirection` is read inside `untracked(...)` so this
    // effect does NOT register it as a dependency. The previous code read
    // `syncDirection()` directly, which made the effect re-run every time the
    // body (or the trailing microtask) flipped the guard back to 'idle'.
    // Combined with the `queueMicrotask(() => syncDirection.set('idle'))` reset
    // inside `applyElementsFromDoc`/`applyPageFromDoc`, the two effects fired
    // in lockstep forever — Angular detected a signal that was read inside an
    // effect and written again during/after the same effect, surfacing as
    // NG0103 ("endless change notifications").
    effect(() => {
      const elements = this.doc.elements();
      const guard = untracked(() => this.syncDirection());
      if (guard === 'fabric-to-doc') return;
      untracked(() => this.applyElementsFromDoc(elements));
    });

    // document → fabric: re-render canvas (size, background) when page changes.
    // Same PHASE 20 FIX as above: read `syncDirection` inside `untracked`.
    effect(() => {
      const page = this.doc.page();
      const guard = untracked(() => this.syncDirection());
      if (guard === 'fabric-to-doc') return;
      untracked(() => this.applyPageFromDoc(page));
    });
  }

  initialize(
    element: HTMLCanvasElement,
    canvasState: {
      width: number;
      height: number;
      backgroundColor: string;
      backgroundImage?: string;
    },
    events?: FabricEditorEvents,
  ): void {
    this.canvas?.dispose();
    this.canvasElement = element;
    this.canvas = new Canvas(element, {
      hoverCursor: 'pointer',
      selection: true,
      selectionBorderColor: '#2563eb',
      isDrawingMode: false,
    });

    this.canvas.setDimensions({
      width: canvasState.width,
      height: canvasState.height,
    });
    this.canvas.backgroundColor = canvasState.backgroundColor;

    this.wireEditorEvents(events);
    this.applyInteractionMode();
    this.canvas.requestRenderAll();
  }

  dispose(): void {
    // Drop event listeners before disposing the underlying canvas.
    this.unwireEditorEvents();
    this.canvas?.dispose();
    this.canvas = null;
    this.canvasElement = null;
  }

  /**
   * Sets the interaction mode (drawing vs select) and applies it to the
   * Fabric canvas. The facade previously owned this; it's a Fabric-instance
   * concern so it lives here now. The optional `onEnterDrawing` lets the
   * facade clear its selection-state signals on entry to drawing mode
   * (the selection clear side-effect is NOT a Fabric concern).
   */
  setDrawingMode(enabled: boolean, onEnterDrawing?: () => void): boolean {
    const changed = this.drawingMode !== enabled;
    this.drawingMode = enabled;
    this.applyInteractionMode();
    if (enabled && changed && onEnterDrawing) onEnterDrawing();
    return changed;
  }

  private applyInteractionMode(): void {
    if (!this.canvas) return;

    this.canvas.isDrawingMode = this.drawingMode;
    this.canvas.selection = !this.drawingMode;
    this.canvas.skipTargetFind = this.drawingMode;
    this.canvas.defaultCursor = this.drawingMode ? 'crosshair' : 'default';
    this.canvas.hoverCursor = this.drawingMode ? 'crosshair' : 'move';

    this.canvas.forEachObject((object) => {
      object.set({
        selectable: !this.drawingMode,
        evented: !this.drawingMode,
      });
    });

    if (this.drawingMode) {
      this.canvas.discardActiveObject();
    }
  }

  /**
   * Bound handler stash: pairs of (eventName, handler) used to detach
   * the exact same function reference on dispose — required because
   * modern Fabric deprecated the no-arg `canvas.off()` overload.
   */
  private wiredHandlers: Array<[string, (...args: unknown[]) => void]> = [];

  /**
   * Tracks the last background-image data URL pushed to the canvas. Used
   * by `applyPageFromDoc` to skip reloading the same image on every doc
   * tick (FabricImage.fromURL is async and would otherwise churn).
   * Empty string means "no background image applied".
   */
  private lastAppliedBgImage = '';

  private unwireEditorEvents(): void {
    if (!this.canvas || this.wiredHandlers.length === 0) return;
    for (const [eventName, handler] of this.wiredHandlers) {
      this.canvas.off(eventName as never, handler as never);
    }
    this.wiredHandlers = [];
  }

  private wireEditorEvents(events?: FabricEditorEvents): void {
    if (!this.canvas || !events) return;
    const canvas = this.canvas;

    const add = (
      eventName: string,
      handler: (...args: unknown[]) => void,
    ): void => {
      canvas.on(eventName as never, handler as never);
      this.wiredHandlers.push([eventName, handler]);
    };

    if (events.onSelectionCreated) {
      add('selection:created', () =>
        events.onSelectionCreated!(canvas.getActiveObject() ?? null),
      );
    }
    if (events.onSelectionUpdated) {
      add('selection:updated', () =>
        events.onSelectionUpdated!(canvas.getActiveObject() ?? null),
      );
    }
    if (events.onSelectionCleared) {
      add('selection:cleared', () => events.onSelectionCleared!());
    }
    if (events.onObjectAdded) {
      add('object:added', () => events.onObjectAdded!());
    }
    if (events.onObjectModified) {
      add('object:modified', () =>
        events.onObjectModified!(canvas.getActiveObject() ?? null),
      );
    }
    if (events.onObjectRemoved) {
      add('object:removed', () => events.onObjectRemoved!());
    }
    if (events.onTextChanged) {
      add('text:changed', () =>
        events.onTextChanged!(canvas.getActiveObject() ?? null),
      );
    }
  }

  getCanvas(): Canvas | null {
    return this.canvas;
  }

  getCanvasElement(): HTMLCanvasElement | null {
    return this.canvasElement;
  }

  /**
   * Sets the hydrating flag. While true, {@link touchRevision} is
   * suppressed. Called by UndoRedoService before/after `loadFromJSON`
   * so snapshot restore doesn't mark the editor dirty.
   */
  setHydrating(value: boolean): void {
    this.hydrating = value;
  }

  /**
   * Bumps the revision counter. No-op while {@link hydrating} is true.
   * Replaces `EditorCanvasService.touchRevision()`.
   *
   * Also requests a canvas re-render so any in-flight Fabric mutation
   * (e.g. an add-shape command that called `canvasAdd` without a paired
   * `requestRenderAll`) is guaranteed to paint. Cheap when nothing changed
   * (Fabric coalesces), and the safety net when downstream consumers
   * (e.g. `applyElementsFromDoc`) didn't reach their own `requestRenderAll`.
   */
  touchRevision(): void {
    if (this.hydrating) return;
    this.revision.update((v) => v + 1);
    try {
      this.canvas?.requestRenderAll();
    } catch (err) {
      console.warn('[FabricRenderer] touchRevision requestRenderAll failed:', err);
    }
  }

  /**
   * Returns the Fabric canvas's serializable JSON projection (plain
   * object). Returns null when the canvas is not initialized. Replaces
   * `EditorCanvasService.toCanvasJson()`.
   */
  toCanvasJson(): Record<string, unknown> | null {
    if (!this.canvas) return null;
    return this.canvas.toJSON() as unknown as Record<string, unknown>;
  }

  /**
   * Selects and activates a Fabric object. Used by element render() and
   * the clone helper so the user sees immediate selection feedback.
   * Replaces `EditorCanvasService.selectItemAfterAdded()`. The optional
   * `onSelected` callback lets the caller drive the editor-layer selection
   * signals (cleared/created) without the renderer needing to depend on
   * SelectionService directly.
   */
  selectItemAfterAdded(obj: unknown, onSelected?: (obj: unknown) => void): void {
    if (!this.canvas) return;
    this.canvas.discardActiveObject();
    this.canvas.setActiveObject(obj as never);
    this.canvas.requestRenderAll();
    if (onSelected) onSelected(obj);
  }

  /**
   * Builds a narrow RenderContext that element render() methods can use to
   * create Fabric objects, attach ids, and register custom serialization
   * properties — without exposing the rest of the renderer.
   */
  getRenderContext(): RenderContext {
    if (!this.canvas) throw new Error('Canvas not initialized');
    return {
      canvas: this.canvas,
      extend: (obj, id) => this.extend(obj, id),
      extendWithCustomProperties: (obj, props) => this.extendWithCustomProperties(obj, props),
      randomId: () => this.randomId(),
    };
  }

  /**
   * Fabric `object:modified` handler entry point. Writes the new geometry back
   * to the central document while holding the cycle guard. Returns true if the
   * write was performed (caller can short-circuit on false).
   */
  handleObjectModified(object: any): boolean {
    // Echoes of doc-driven updates must not re-enter the document.
    if (this.syncDirection() !== 'idle') {
      return false;
    }

    if (!object) return false;

    // Multi-select: skip per-element write; handled by selection.
    if (object.type?.toLowerCase() === 'activeselection') {
      return false;
    }

    const id = this.getObjectId(object);
    if (!id) return false;

    const visualWidth = (object.width ?? 0) * (object.scaleX ?? 1);
    const visualHeight = (object.height ?? 0) * (object.scaleY ?? 1);
    const patch: Partial<LabelElement> = {
      x: object.left ?? 0,
      y: object.top ?? 0,
      width: visualWidth,
      height: visualHeight,
    } as Partial<LabelElement>;
    const anyObj = object as any;
    if (anyObj.angle !== undefined) (patch as any).rotation = anyObj.angle;
    if (anyObj.opacity !== undefined) (patch as any).opacity = anyObj.opacity;
    if (anyObj.scaleX !== undefined) (patch as any).scaleX = anyObj.scaleX;
    if (anyObj.scaleY !== undefined) (patch as any).scaleY = anyObj.scaleY;

    this.syncDirection.set('fabric-to-doc');
    try {
      this.doc.updateElement(id, patch);
    } finally {
      // Keep the fabric → doc guard active through queued Fabric events so
      // they cannot echo this document write back into the document effect.
      queueMicrotask(() => this.syncDirection.set('idle'));
    }
    return true;
  }

  // ============================================================
  // doc → fabric
  // ============================================================

  private applyElementsFromDoc(elements: ReadonlyMap<string, LabelElement>): void {
    if (!this.canvas) return;
    // Defensive: when the editor is mid-load (loadFromJSON rebuild) or
    // mid-command (undo/redo), the doc ↔ Fabric effect must not reapply
    // fields to Fabric. Command paths (Add*, loadPage) already mutate
    // Fabric directly; double-applying risks rejecting empty/invalid colors
    // with the Fabric.js "#rrggbb" console error and aborting the rest of
    // the loop (including the final `requestRenderAll`), which leaves the
    // canvas in a stale state.
    if (this.hydrating) return;
    this.syncDirection.set('doc-to-fabric');
    try {
      const canvas = this.canvas;

      // Build an id → FabricObject map from what is currently on the canvas.
      const onCanvas = new Map<string, any>();
      canvas.getObjects().forEach((obj) => {
        const id = this.getObjectId(obj);
        if (id) onCanvas.set(id, obj);
      });

      // For each element in the document, push the doc's fields onto the
      // matching Fabric object. Fabric objects use `set({...})` for proper
      // change events. We deliberately skip fields that require image
      // regeneration (barcode.text / barcodeFormat / showText, qrcode.text /
      // errorCorrectionLevel / foregroundColor / backgroundColor) — that
      // needs a follow-up that re-issues the QR/barcode image. We DO push
      // the fields Fabric `set()` understands natively.
      //
      // Document elements that are not on the canvas: leave them alone (new
      // elements still come through Add*Command). Canvas objects that are
      // not in the document: leave them alone (deletion still goes through
      // DeleteSelectedCommand).
      let anyChanged = false;
      for (const [id, data] of elements.entries()) {
        const obj = onCanvas.get(id);
        if (!obj) continue;

        const anyData = data as unknown as Record<string, unknown>;
        const setObj = obj as any;
        const t = anyData['type'] as string | undefined;

        // Track whether any setter on this object actually changed a value.
        // Used at the end to decide whether `requestRenderAll` is needed.
        let objChanged = false;
        const track = (key: string, value: unknown): void => {
          if (setObj.get(key) !== value) {
            setObj.set(key, value);
            objChanged = true;
          }
        };

        // Common: opacity, geometry, rotation
        if (anyData['opacity'] !== undefined) track('opacity', anyData['opacity']);
        if (anyData['rotation'] !== undefined) track('angle', anyData['rotation']);

        // Position — written by Fabric → doc via handleObjectModified.
        // Apply only when present in the patch (doc carries current truth).
        if (anyData['x'] !== undefined) track('left', anyData['x']);
        if (anyData['y'] !== undefined) track('top', anyData['y']);

        if (anyData['width'] !== undefined) track('width', anyData['width']);
        if (anyData['height'] !== undefined) track('height', anyData['height']);
        // After geometry changes reset scale so width/height are visual.
        if (anyData['width'] !== undefined || anyData['height'] !== undefined) {
          // Image-backed elements (image / qrcode / barcode): Fabric's
          // FabricImage renders as `width * scaleX`. Resetting scale to 1
          // would leave the placeholder stretched/cropped because
          // `set('width', …)` mutates the underlying pixel width without
          // resampling. Re-derive scale from the image's natural size so
          // the rendered size matches the doc width/height exactly.
          if (t === 'image' || t === 'qrcode' || t === 'barcode') {
            // Fabric renders FabricImage as `width * scaleX`. After repeated
            // set('width', …) calls the field no longer matches the image's
            // natural pixel size, so scaleToWidth(target) returns the wrong
            // scaleX (= target / drifted_width). Compute scale from the
            // image's natural size directly and reset width/height back to
            // natural so the relationship `width * scaleX == target` holds
            // on every call (idempotent for repeated resize to the same
            // dimensions).
            const { naturalW, naturalH } = this.readNaturalSize(obj);
            if (anyData['width'] !== undefined && naturalW > 0) {
              const target = anyData['width'] as number;
              track('width', naturalW);
              track('scaleX', target / naturalW);
            }
            if (anyData['height'] !== undefined && naturalH > 0) {
              const target = anyData['height'] as number;
              track('height', naturalH);
              track('scaleY', target / naturalH);
            }
          } else {
            track('scaleX', 1);
            track('scaleY', 1);
          }
        }

        if (t === 'text') {
          // textAlign is line-level only (no per-char overlay), so updating
          // it via `set('textAlign', ...)` is sufficient — no need to touch
          // the styles[] array.
          if (anyData['textAlign'] !== undefined)
            track('textAlign', anyData['textAlign']);

          // PHASE 21 FIX: font / decoration / color properties are NOT just
          // object-level — Fabric.js Text stores per-character overrides in
          // its `styles[]` array (a 2D table of per-grapheme style overlays).
          // At render time, `getCompleteStyleDeclaration(line, char)` spreads
          // the outer properties FIRST and then merges the per-char style on
          // top, so a stale per-char entry (e.g. `fontSize: 22` from when
          // the element was first added) silently overrides a freshly-set
          // outer `fontSize: 15`. The property panel was reporting the new
          // value because the doc state had been updated, but the canvas
          // kept showing the old one. To make outer-level changes "win",
          // after `set(prop, value)` we mirror the same value into every
          // per-char style in [0, text.length), then call Fabric's
          // `cleanStyle(prop)` to drop redundant per-char entries (it deletes
          // a per-char entry only when ALL chars share the same value AND
          // it equals the outer — which is exactly what we just produced).
          //
          // Without this, font size, font family, font weight, font style,
          // underline / overline / linethrough, fill, stroke, and strokeWidth
          // are all read-only on the canvas for any element that has a
          // non-empty `styles[]` overlay (which is the common case after
          // loadFromJSON — Fabric seeds the overlay during initDimensions).
          //
          // Order matters: apply `text` FIRST (if present) so the styles
          // array length matches the final text length before we overlay
          // the style-affecting properties.
          if (anyData['text'] !== undefined) track('text', anyData['text']);

          const textLen =
            typeof setObj.text === 'string' ? setObj.text.length : 0;
          const overlayProp = (prop: string, value: unknown): void => {
            track(prop, value);
            if (textLen > 0 && typeof setObj.setSelectionStyles === 'function') {
              setObj.setSelectionStyles({ [prop]: value }, 0, textLen);
            }
            if (typeof setObj.cleanStyle === 'function') {
              setObj.cleanStyle(prop);
            }
          };

          if (anyData['fontSize'] !== undefined)
            overlayProp('fontSize', anyData['fontSize']);
          if (anyData['fontFamily'] !== undefined)
            overlayProp('fontFamily', anyData['fontFamily']);
          if (anyData['fontWeight'] !== undefined)
            overlayProp('fontWeight', anyData['fontWeight']);
          if (anyData['fontStyle'] !== undefined)
            overlayProp('fontStyle', anyData['fontStyle']);
          // textDecoration is the only doc-level decoration field (a string
          // like 'underline', 'overline', 'linethrough', or any combination
          // separated by spaces). Fabric exposes it as THREE booleans at
          // the per-char level — `underline`, `overline`, `linethrough` —
          // so we have to translate. Empty string means "no decoration" —
          // clear all three flags at the per-char level too.
          if (anyData['textDecoration'] !== undefined) {
            const deco = String(anyData['textDecoration'] ?? '');
            track('textDecoration', deco);
            if (textLen > 0 && typeof setObj.setSelectionStyles === 'function') {
              setObj.setSelectionStyles(
                {
                  underline: deco.includes('underline'),
                  overline: deco.includes('overline'),
                  linethrough: deco.includes('linethrough'),
                },
                0,
                textLen,
              );
            }
            if (typeof setObj.cleanStyle === 'function') {
              setObj.cleanStyle('underline');
              setObj.cleanStyle('overline');
              setObj.cleanStyle('linethrough');
            }
          }
          // Empty string fill/stroke is the "None" signal from the properties
          // panel — fabric accepts `set('fill', '')` (treated as falsy = no
          // fill). The earlier length>0 guard would swallow that signal and
          // leave the element's old color on screen. Only skip when the
          // value is missing or non-string so a stray number/null patch
          // doesn't reach Fabric's "fill/stroke must be a color" assertion.
          const textFill = anyData['fill'] ?? anyData['color'];
          if (typeof textFill === 'string') overlayProp('fill', textFill);
          if (typeof anyData['stroke'] === 'string')
            overlayProp('stroke', anyData['stroke']);
          if (anyData['strokeWidth'] !== undefined)
            overlayProp('strokeWidth', anyData['strokeWidth']);
        } else if (t === 'rect' || t === 'circle' || t === 'triangle' || t === 'image') {
          if (typeof anyData['fill'] === 'string') track('fill', anyData['fill']);
          if (typeof anyData['stroke'] === 'string')
            track('stroke', anyData['stroke']);
          if (anyData['strokeWidth'] !== undefined)
            track('strokeWidth', anyData['strokeWidth']);
        } else if (t === 'line') {
          // Line length is encoded as width/height (x2-x1, y2-y1) — push to
          // the actual Fabric line endpoint fields. Bulk set is kept as-is
          // (no per-field getter comparison available in a single Fabric
          // call); geometry is already idempotent on the doc side because
          // handleObjectModified writes the same x/y/width/height values
          // back that this effect reads, so unchanged geometry won't trigger
          // object:modified downstream of `set({x2,y2})` either.
          const x1 = (obj as any).x1 ?? 0;
          const y1 = (obj as any).y1 ?? 0;
          if (anyData['width'] !== undefined || anyData['height'] !== undefined) {
            const x2 = x1 + ((anyData['width'] as number) ?? 0);
            const y2 = y1 + ((anyData['height'] as number) ?? 0);
            if ((obj as any).x2 !== x2 || (obj as any).y2 !== y2) {
              setObj.set({ x2, y2 });
              objChanged = true;
            }
          }
          if (anyData['stroke']) track('stroke', anyData['stroke']);
          if (anyData['strokeWidth'] !== undefined)
            track('strokeWidth', anyData['strokeWidth']);
        } else if (t === 'barcode' || t === 'qrcode') {
          // Image-backed elements. Width/height/opacity handled above.
          // Push the business fields onto the Fabric object so they
          // survive serialization and any subsequent read via
          // fromFabricObject. The placeholder image isn't re-rendered
          // here — the actual QR/barcode raster is generated by
          // `LabelDataBindingService` at print/PDF time using these
          // same fields, so the on-canvas placeholder staying out of
          // sync is intentional and harmless.
          const assignCustom = (key: string): void => {
            if (anyData[key] === undefined) return;
            const next = anyData[key];
            if (obj[key] !== next) {
              obj[key] = next;
              objChanged = true;
            }
          };
          assignCustom('elementType');
          assignCustom('bindingValue');
          assignCustom('foregroundColor');
          assignCustom('backgroundColor');
          assignCustom('errorCorrectionLevel');
          assignCustom('barcodeFormat');
          assignCustom('showText');
        }

        // Refresh coords so the next render uses the new state.
        if (objChanged && typeof (obj as any).setCoords === 'function') {
          (obj as any).setCoords();
        }
        if (objChanged) anyChanged = true;
      }

      // Only request a redraw when something actually changed. A no-op effect
      // (e.g. the editor writing back identical values during a snapshot
      // restore) skips the render call entirely, avoiding one more round-trip
      // through Fabric's render scheduler.
      if (anyChanged) canvas.requestRenderAll();
    } finally {
      // Defer the reset to a microtask so any Fabric events queued during
      // the iteration (object:modified, etc.) see the guard still set and
      // skip their doc-write. Without this, the finally would clear
      // syncDirection synchronously, then queued Fabric events would fire
      // after the guard is gone and echo the doc update back into the doc,
      // re-triggering this effect forever.
      queueMicrotask(() => this.syncDirection.set('idle'));
    }
  }

  private applyPageFromDoc(page: LabelPageSettings): void {
    if (!this.canvas) return;
    // Defensive: skip when mid-load / mid-command. See applyElementsFromDoc
    // for rationale. loadPage handles its own background color/image
    // assignment with the `|| '#ffffff'` fallback; we don't want to
    // overwrite that with an empty string during the same load.
    if (this.hydrating) return;
    this.syncDirection.set('doc-to-fabric');
    try {
      // Update canvas dimensions (px) and background color/image. Mirrors
      // the legacy logic in editor.ts and editor-canvas.service.ts
      // applyCanvasFill / resizeCanvas / setCanvasBackground methods.
      const wPx = Math.round(page.widthMm * PX_PER_MM);
      const hPx = Math.round(page.heightMm * PX_PER_MM);
      this.canvas.setDimensions({ width: wPx, height: hPx });
      // Fabric.js rejects empty-string `backgroundColor` with
      // 'does not conform to the required format. The format is "#rrggbb"'.
      // Empty string is NOT nullish, so `??` does not catch it; defend
      // explicitly so the editor doesn't spam the console and the
      // requestRenderAll below doesn't bail.
      this.canvas.backgroundColor = page.backgroundColor || '#ffffff';
      // Background image — `applyBackgroundImage` loads via
      // FabricImage.fromURL which is async, so we fire-and-forget here.
      // Cache the last applied URL to avoid reloading the same image on
      // every page signal tick.
      const nextBgImage = page.backgroundImage || '';
      if (nextBgImage !== this.lastAppliedBgImage) {
        this.lastAppliedBgImage = nextBgImage;
        void this.applyBackgroundImage(nextBgImage || undefined);
      }
      this.canvas.requestRenderAll();
    } finally {
      // Defer the reset to a microtask so any Fabric events queued during
      // the iteration (object:modified, etc.) see the guard still set and
      // skip their doc-write. Without this, the finally would clear
      // syncDirection synchronously, then queued Fabric events would fire
      // after the guard is gone and echo the doc update back into the doc,
      // re-triggering this effect forever.
      queueMicrotask(() => this.syncDirection.set('idle'));
    }
  }

  /**
   * Loads a background image (data URL) and tiles it across the Fabric
   * canvas via a repeating Pattern. Mirrors `EditorCanvasService`'s
   * legacy method. Async because FabricImage.fromURL resolves after the
   * image element finishes decoding.
   */
  async applyBackgroundImage(backgroundImage: string | undefined): Promise<void> {
    const canvas = this.canvas;
    if (!canvas) return;
    if (!backgroundImage) {
      // `loadPage` already set backgroundColor; clearing the pattern here
      // would erase the color. Leave backgroundColor alone — caller will
      // have set the color they want.
      this.lastAppliedBgImage = '';
      return;
    }
    const { FabricImage, Pattern } = await import('fabric');
    const image = await FabricImage.fromURL(backgroundImage);
    const pattern = new Pattern({ source: image.getElement(), repeat: 'repeat' });
    canvas.backgroundColor = pattern;
    // Record the URL we just applied so the next doc → fabric tick skips
    // reloading the same image (applyPageFromDoc consults this cache).
    this.lastAppliedBgImage = backgroundImage;
    canvas.requestRenderAll();
  }

  // ============================================================
  // Render helpers (moved from editor-canvas.service)
  // ============================================================

  /**
   * Called by element render() methods to attach element id to Fabric object.
   */
  extend(obj: any, id: string | number): void {
    const originalToObject = obj.toObject;
    obj.toObject = ((toObject) => () => ({
      ...toObject.call(obj),
      id,
    }))(originalToObject);
  }

  /**
   * Attaches custom business properties to a Fabric object and extends
   * its toObject so the custom fields survive serialization. Called by element
   * render() methods via the RenderContext. Used for barcode/qrcode elements
   * and any other element that carries business-specific custom fields.
   */
  extendWithCustomProperties(obj: any, props: Record<string, any>): void {
    // Assign properties directly to the object. Serialization to JSON is
    // handled by registering these fields on FabricImage.customProperties
    // at module load time — that lets fabric's native toObject include
    // them via pick(this, propertiesToSerialize), which is more reliable
    // than overriding `toObject` per instance (some fabric code paths read
    // from the prototype and bypass the instance override, dropping
    // `elementType` and friends from saved JSON — which then caused
    // `loadPage` to recreate qrcode/barcode as plain `image`).
    Object.assign(obj, props);
  }

  /**
   * Generates a unique element id. Exposed via RenderContext so element
   * render() methods can assign ids without depending on internals.
   */
  public randomId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Reads the element id attached via {@link extend} or loadFromJSON.
   */
  public getObjectId(object: any): string {
    try {
      const serializableObject = object as any;
      const id = serializableObject.toObject(['id']).id;
      return id ? String(id) : '';
    } catch {
      return '';
    }
  }
}
