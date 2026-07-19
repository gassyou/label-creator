/**
 * Render layer (Phase 1 of the four-layer architecture refactor).
 *
 * Owns:
 *  - The Fabric canvas lifecycle (initialization, disposal)
 *  - The doc → fabric reconciliation (applyElementsFromDoc / applyPageFromDoc)
 *  - The tri-state `syncDirection` cycle guard
 *  - Render helpers exposed via {@link RenderContext} (`randomId`, `extend`,
 *    `extendWithCustomProperties`, `createPlaceholderDataUrl`)
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
import { Canvas } from 'fabric';
import type { LabelElement } from '../models/editor.models';
import { PX_PER_MM } from '../models/label.models';
import { LabelDocumentService } from '../document/label-document.service';
import type { LabelPageSettings } from '../document/label-document';
import type { RenderContext } from '../models/element-base';

export type SyncDirection = 'idle' | 'doc-to-fabric' | 'fabric-to-doc';

@Injectable()
export class FabricRenderer {
  private readonly doc = inject(LabelDocumentService);

  private canvas: Canvas | null = null;
  private canvasElement: HTMLCanvasElement | null = null;

  readonly syncDirection = signal<SyncDirection>('idle');

  // Element registry for tracking all elements on canvas.
  // NOTE: Phase 6 deletes this in favour of `doc.elements()`.
  public elementRegistry: Map<string, any> = new Map();

  constructor() {
    // document → fabric: re-render elements when the document changes.
    // Suppressed while a fabric → doc write is in flight (echo prevention).
    effect(() => {
      const elements = this.doc.elements();
      if (this.syncDirection() === 'fabric-to-doc') return;
      untracked(() => this.applyElementsFromDoc(elements));
    });

    // document → fabric: re-render canvas (size, background) when page changes.
    effect(() => {
      const page = this.doc.page();
      if (this.syncDirection() === 'fabric-to-doc') return;
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
    this.canvas.requestRenderAll();
  }

  dispose(): void {
    this.canvas?.dispose();
    this.canvas = null;
    this.canvasElement = null;
    this.elementRegistry.clear();
  }

  getCanvas(): Canvas | null {
    return this.canvas;
  }

  getCanvasElement(): HTMLCanvasElement | null {
    return this.canvasElement;
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
   * Returns the element registry map for read/write access by element classes.
   * The returned type is narrowed to a broad `BaseElement`-like shape so
   * callers cannot assume concrete element shapes.
   */
  getElementRegistry(): Map<string, any> {
    return this.elementRegistry;
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
      this.syncDirection.set('idle');
    }
    return true;
  }

  // ============================================================
  // doc → fabric
  // ============================================================

  private applyElementsFromDoc(elements: ReadonlyMap<string, LabelElement>): void {
    if (!this.canvas) return;
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
      for (const [id, data] of elements.entries()) {
        const obj = this.elementRegistry.get(id) ? onCanvas.get(id) : null;
        if (!obj) continue;

        const anyData = data as unknown as Record<string, unknown>;
        const setObj = obj as any;
        const t = anyData['type'] as string | undefined;

        // Common: opacity, geometry, rotation
        if (anyData['opacity'] !== undefined) setObj.set('opacity', anyData['opacity']);
        if (anyData['rotation'] !== undefined) setObj.set('angle', anyData['rotation']);

        // Position — written by Fabric → doc via handleObjectModified.
        // Apply only when present in the patch (doc carries current truth).
        if (anyData['x'] !== undefined) setObj.set('left', anyData['x']);
        if (anyData['y'] !== undefined) setObj.set('top', anyData['y']);

        if (anyData['width'] !== undefined) setObj.set('width', anyData['width']);
        if (anyData['height'] !== undefined) setObj.set('height', anyData['height']);
        // After geometry changes reset scale so width/height are visual.
        if (anyData['width'] !== undefined || anyData['height'] !== undefined) {
          setObj.set('scaleX', 1);
          setObj.set('scaleY', 1);
        }

        if (t === 'text') {
          if (anyData['text'] !== undefined) setObj.set('text', anyData['text']);
          if (anyData['fontSize'] !== undefined) setObj.set('fontSize', anyData['fontSize']);
          if (anyData['fontFamily'] !== undefined)
            setObj.set('fontFamily', anyData['fontFamily']);
          if (anyData['fontWeight'] !== undefined)
            setObj.set('fontWeight', anyData['fontWeight']);
          if (anyData['fontStyle'] !== undefined)
            setObj.set('fontStyle', anyData['fontStyle']);
          if (anyData['textAlign'] !== undefined)
            setObj.set('textAlign', anyData['textAlign']);
          if (anyData['textDecoration'] !== undefined)
            setObj.set('textDecoration', anyData['textDecoration']);
          if (anyData['fill'] !== undefined) setObj.set('fill', anyData['fill']);
          else if (anyData['color'] !== undefined) setObj.set('fill', anyData['color']);
          if (anyData['stroke'] !== undefined) setObj.set('stroke', anyData['stroke']);
          if (anyData['strokeWidth'] !== undefined)
            setObj.set('strokeWidth', anyData['strokeWidth']);
        } else if (t === 'rect' || t === 'circle' || t === 'triangle' || t === 'image') {
          if (anyData['fill'] !== undefined) setObj.set('fill', anyData['fill']);
          if (anyData['stroke'] !== undefined) setObj.set('stroke', anyData['stroke']);
          if (anyData['strokeWidth'] !== undefined)
            setObj.set('strokeWidth', anyData['strokeWidth']);
        } else if (t === 'line') {
          // Line length is encoded as width/height (x2-x1, y2-y1) — push to
          // the actual Fabric line endpoint fields.
          const x1 = (obj as any).x1 ?? 0;
          const y1 = (obj as any).y1 ?? 0;
          if (anyData['width'] !== undefined || anyData['height'] !== undefined) {
            const x2 = x1 + ((anyData['width'] as number) ?? 0);
            const y2 = y1 + ((anyData['height'] as number) ?? 0);
            setObj.set({ x2, y2 });
          }
          if (anyData['stroke'] !== undefined) setObj.set('stroke', anyData['stroke']);
          if (anyData['strokeWidth'] !== undefined)
            setObj.set('strokeWidth', anyData['strokeWidth']);
        } else if (t === 'barcode' || t === 'qrcode') {
          // Image-backed elements. Width/height/opacity handled above.
          // Image regeneration for value/format/etc. is left for follow-up.
        }

        // Refresh coords so the next render uses the new state.
        if (typeof (obj as any).setCoords === 'function') {
          (obj as any).setCoords();
        }
      }

      canvas.requestRenderAll();
    } finally {
      this.syncDirection.set('idle');
    }
  }

  private applyPageFromDoc(page: LabelPageSettings): void {
    if (!this.canvas) return;
    this.syncDirection.set('doc-to-fabric');
    try {
      // Update canvas dimensions (px) and background color/image. Mirrors
      // the legacy logic in editor.ts and editor-canvas.service.ts
      // applyCanvasFill / resizeCanvas / setCanvasBackground methods.
      const wPx = Math.round(page.widthMm * PX_PER_MM);
      const hPx = Math.round(page.heightMm * PX_PER_MM);
      this.canvas.setDimensions({ width: wPx, height: hPx });
      if (page.backgroundColor) {
        this.canvas.backgroundColor = page.backgroundColor;
      } else {
        this.canvas.backgroundColor = '';
      }
      this.canvas.requestRenderAll();
    } finally {
      this.syncDirection.set('idle');
    }
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
    // Assign properties directly to the object
    Object.assign(obj, props);

    // Override toObject to include custom properties in serialization
    const originalToObject = obj.toObject;
    obj.toObject = function (this: any) {
      const result = originalToObject.call(this);
      return {
        ...result,
        elementType: this.elementType,
        bindingValue: this.bindingValue,
        errorCorrectionLevel: this.errorCorrectionLevel,
        foregroundColor: this.foregroundColor,
        backgroundColor: this.backgroundColor,
        barcodeFormat: this.barcodeFormat,
        showText: this.showText,
      };
    };
  }

  /**
   * Generates a small gray placeholder PNG data URL used as the initial image
   * for barcode/qrcode elements before any binding value is rendered. Exposed
   * via RenderContext so elements can call it during render().
   */
  createPlaceholderDataUrl(text: string, w: number, h: number): string {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#999';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(text, w / 2, h / 2);
    }
    return canvas.toDataURL('image/png');
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
