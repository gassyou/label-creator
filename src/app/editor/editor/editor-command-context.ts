// src/app/editor/editor/editor-command-context.ts
import type { FabricRenderer } from '../render/fabric-renderer';

/**
 * Surface that the Add, Delete, and Clear commands operate on. Built
 * once per command execution by the editor layer (OperationsService
 * builds it from its injected dependencies). Replaces the legacy
 * EditorCanvasService facade so commands depend only on what they
 * actually use.
 *
 * The shape mirrors the surface the seven commands (add-text, add-shape,
 * add-qrcode, add-barcode, add-image, delete-selected, clear-canvas)
 * historically pulled off EditorCanvasService — narrowed to exactly the
 * fields those commands need. Geometric / structural ops (alignment,
 * z-order, clipboard) live on OperationsService and do not flow through
 * this context.
 */
export interface EditorCommandContext {
  // ----- canvas read -----

  /** The Fabric canvas instance. May be null if the canvas is not yet
   *  initialized; commands guard against null themselves. */
  readonly canvas: ReturnType<FabricRenderer['getCanvas']>;

  /** Reads the id attached to a Fabric object via `FabricRenderer.extend`.
   *  Returns '' if the object has no id. */
  readonly getObjectId: (obj: unknown) => string;

  // ----- element creation (used by Add* commands) -----

  /** Generates a unique id for a new element. */
  readonly randomId: () => string;

  /** Renders an element via the render context (randomId, extend, etc.). */
  readonly getRenderContext: () => ReturnType<FabricRenderer['getRenderContext']>;

  /** Adds the new element to the central document. */
  readonly addElement: (el: import('../models/editor.models').LabelElement) => void;

  /** Adds an object to the Fabric canvas. Shorthand for `canvas.add(obj)`. */
  readonly canvasAdd: (obj: unknown) => void;

  // ----- selection -----

  /** Selects the freshly-added Fabric object so the user sees immediate
   *  selection feedback. Mirrors the legacy `selectItemAfterAdded`. */
  readonly selectItemAfterAdded: (obj: unknown) => void;

  /** Clears the active selection on the Fabric canvas and the editor-
   *  layer selection signals. Used by delete/clear commands to drop the
   *  stale selection after removing the selected objects. */
  readonly clearActiveSelection: () => void;

  // ----- element removal (used by delete/clear commands) -----

  /** Removes a single element by id from the central document. */
  readonly removeElementById: (id: string) => void;

  /** Clears every element from the central document. */
  readonly clearAllElements: () => void;

  // ----- revision -----

  /** Touch the canvas revision signal — notifies JSON preview, dirty
   *  marker, etc. that the canvas changed. Suppressed while undo/redo
   *  hydrating. Mirrors `EditorCanvasService.touchRevision()`. */
  readonly touchRevision: () => void;
}
