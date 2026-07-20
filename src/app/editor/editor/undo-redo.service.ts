/**
 * Undo/Redo service (Phase 7 of the four-layer architecture refactor).
 *
 * Owns the snapshot stacks and the command execution wrapper that powers
 * editor undo/redo. Previously lived as private state and methods on
 * `EditorCanvasService`; that facade has now been removed and the
 * editor-layer (OperationsService) builds an `EditorCommandContext`
 * directly and passes it into `execute`.
 *
 * The service is intentionally narrow: a stack of atomic {@link EditorSnapshot}s,
 * the push/redo wrapper, and the apply-snapshot machinery that keeps the
 * doc ↔ Fabric round-trip coherent (Phase 2 undo fix).
 *
 * Cycle-guard contract:
 *   `applyEditorSnapshot` spans the entire `loadFromJSON` call with
 *   `syncDirection = 'doc-to-fabric'` so the `object:added` events Fabric
 *   fires during reconstruction don't write back to the doc. Reset to
 *   `'idle'` BEFORE any user-observable side effects.
 *
 * Public surface:
 *   - `execute(cmd, ctx, onError?)`: pushes a snapshot, clears redo, runs
 *     the command with the supplied context, updates the can-undo /
 *     can-redo signals. Pops the snapshot and re-throws if the command
 *     fails.
 *   - `undo()` / `redo()`: full snapshot restore with cycle guard.
 *   - `canUndo` / `canRedo` signals consumed by topbar UI.
 *   - `reset()` clears both stacks (used on canvas re-init).
 *   - `pushSnapshotSync()` for non-command mutations (paste/clipboard).
 */
import { Injectable, inject, signal } from '@angular/core';
import type { Canvas } from 'fabric';
import { LabelDocumentService, type LabelDocumentSnapshot } from '../document';
import { ElementFactory } from '../models/element-factory';
import { type LabelElement } from '../models/editor.models';
import { FabricRenderer } from '../render/fabric-renderer';
import type { EditorCommand } from '../commands/editor-command';
import type { EditorCommandContext } from './editor-command-context';
import { MULTI_SELECT_MARKER_ID } from './selection.service';

/**
 * A single undo/redo snapshot. Bundles the Fabric canvas JSON with an
 * atomic {@link LabelDocumentSnapshot} so undo/redo can restore both
 * layers coherently. Replaces the old `string` (canvas-JSON-only)
 * snapshot type that caused the historical undo bug.
 */
export interface EditorSnapshot {
  canvasJson: string;
  docSnapshot: LabelDocumentSnapshot;
}

@Injectable()
export class UndoRedoService {
  private readonly renderer = inject(FabricRenderer);
  private readonly doc = inject(LabelDocumentService);

  /** Can undo signal — consumed by topbar UI. */
  readonly canUndo = signal(false);

  /** Can redo signal — consumed by topbar UI. */
  readonly canRedo = signal(false);

  private undoStack: EditorSnapshot[] = [];
  private redoStack: EditorSnapshot[] = [];
  private maxUndoLevels = 50;

  /** Canvas instance; null until the editor initializes Fabric. */
  private canvas: Canvas | null = null;

  /**
   * Tracks the current Fabric canvas. Called from the editor's
   * `ngAfterViewInit` (after `FabricRenderer.initialize`) and `ngOnDestroy`.
   */
  setCanvas(canvas: Canvas | null): void {
    this.canvas = canvas;
  }

  // ---------------------------------------------------------------
  // Public command / undo API
  // ---------------------------------------------------------------

  /**
   * Wraps an {@link EditorCommand} in the standard undo bookkeeping:
   *
   *   1. Push a snapshot of the current canvas + doc state onto `undoStack`.
   *   2. Clear the redo stack (any prior redo branch is invalidated by a
   *      new edit, per classic undo/redo semantics).
   *   3. Run `cmd.execute(ctx)`.
   *   4. On success, update `canUndo` / `canRedo`.
   *   5. On failure, pop the snapshot (so the failed command doesn't add
   *      a phantom undoable entry) and re-throw to the caller.
   *
   * `onError` runs before the re-throw so the caller can show a toast or
   * log without losing the original error.
   */
  execute<T = void>(
    cmd: EditorCommand,
    ctx: EditorCommandContext,
    onError?: (err: unknown) => void,
  ): Promise<T> {
    this.pushUndoSnapshot();
    this.redoStack.length = 0;
    this.syncSignals();
    return Promise.resolve()
      .then(() => cmd.execute(ctx) as T | Promise<T>)
      .then(
        (v) => v as T,
        (err) => {
          this.undoStack.pop();
          this.syncSignals();
          if (onError) onError(err);
          throw err;
        },
      );
  }

  /**
   * Pop a snapshot from `undoStack`, capture the current state, and apply
   * the snapshot. The captured current state is pushed onto `redoStack`
   * in a `finally` so the swap is always reversible.
   */
  undo(): Promise<void> {
    if (this.undoStack.length === 0 || !this.canvas) return Promise.resolve();
    const current = this.takeSnapshot();
    const target = this.undoStack.pop()!;
    return this.applyEditorSnapshot(target).finally(() => {
      this.canvas?.requestRenderAll();
      this.redoStack.push(current);
      this.syncSignals();
    });
  }

  /**
   * Pop a snapshot from `redoStack`, capture the current state, and apply
   * the snapshot. The captured current state is pushed onto `undoStack`
   * in a `finally` so the swap is always reversible.
   */
  redo(): Promise<void> {
    if (this.redoStack.length === 0 || !this.canvas) return Promise.resolve();
    const current = this.takeSnapshot();
    const target = this.redoStack.pop()!;
    return this.applyEditorSnapshot(target).finally(() => {
      this.canvas?.requestRenderAll();
      this.undoStack.push(current);
      this.syncSignals();
    });
  }

  /** Clear both stacks (e.g. on canvas re-init / template load). */
  reset(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.syncSignals();
  }

  /**
   * Synchronously push a snapshot onto `undoStack` and clear the redo
   * stack. Used by paste/clipboard ops (and any other op that mutates
   * the canvas without going through the {@link execute} wrapper). The
   * {@link execute} path uses an async wrapper because commands may be
   * async; this direct path matches the legacy `saveUndoState` semantics.
   */
  pushSnapshotSync(): void {
    this.pushUndoSnapshot();
    this.redoStack.length = 0;
    this.syncSignals();
  }

  // ---------------------------------------------------------------
  // Private helpers (snapshot bookkeeping + cycle-guard restore)
  // ---------------------------------------------------------------

  /**
   * Builds a 2-field {@link EditorSnapshot} from the live canvas + doc.
   * Called from `pushUndoSnapshot` (before each command) and from
   * `undo`/`redo` (to capture the current pre-swap state so redo/undo
   * remain reversible).
   */
  private takeSnapshot(): EditorSnapshot {
    const canvasJson = this.canvas ? JSON.stringify(this.canvas.toJSON()) : '';
    return {
      canvasJson,
      docSnapshot: this.doc.snapshot(),
    };
  }

  private pushUndoSnapshot(): void {
    if (!this.canvas) return;
    this.undoStack.push(this.takeSnapshot());
    if (this.undoStack.length > this.maxUndoLevels) this.undoStack.shift();
    this.syncSignals();
  }

  /**
   * Applies an {@link EditorSnapshot} to the canvas + doc in the order
   * that keeps the cycle guard intact:
   *
   *   1. Restore the doc FIRST (atomic 3-signal batch via `doc.restore()`).
   *      The Fabric effect sees the new element map and would normally
   *      re-apply it to the canvas — but...
   *   2. Flip `syncDirection` to `doc-to-fabric` BEFORE `loadFromJSON` so
   *      that all `object:added` events fired during the load are swallowed
   *      by the cycle guard (none of them write back to the doc).
   *   3. `loadFromJSON` runs the full Fabric rebuild (which emits
   *      `object:added` for every reconstructed object — all suppressed).
   *   4. Reset `syncDirection` to `idle`. A defensive
   *      `reconcileDocFromCanvas()` runs immediately after; in normal
   *      operation it is a no-op because the renderer's id-preserving
   *      `extend` chain keeps object ids stable across `loadFromJSON`.
   *
   * Returns the Promise from `loadFromJSON`; the caller wraps it in a
   * `finally` to ensure signals are always restored even if Fabric throws.
   */
  private applyEditorSnapshot(target: EditorSnapshot): Promise<void> {
    if (!this.canvas) return Promise.resolve();
    // 1. Restore the doc first. This sets page/elements/selectionId
    //    atomically; downstream effects see the new doc state on their
    //    next microtask (after the syncDirection flip below).
    this.doc.restore(target.docSnapshot);

    // 2+3. Span `loadFromJSON` with the cycle guard so `object:added`
    // events from Fabric's object reconstruction don't write back to the
    // doc (the historical undo bug).
    this.renderer.syncDirection.set('doc-to-fabric');
    try {
      return this.canvas.loadFromJSON(target.canvasJson).then(() => {
        // 4. Reset guard before any user-observable side effects.
        this.renderer.syncDirection.set('idle');
        this.canvas?.discardActiveObject();
        // Defensive: only fires if Fabric regenerated ids despite our
        // `extend` chain (it shouldn't — this is the last-resort branch).
        this.reconcileDocFromCanvas();
      });
    } catch (err) {
      // Safety net: ensure guard is reset even if loadFromJSON throws.
      this.renderer.syncDirection.set('idle');
      throw err;
    }
  }

  /**
   * Last-resort reconciliation between `doc.elements` and the canvas's
   * current object ids. Runs after every undo/redo to guarantee that any
   * edge case where Fabric regenerated ids is caught before the user sees
   * a stale property panel.
   *
   * In normal operation this is a no-op: the renderer's `extend` chain
   * preserves ids across `loadFromJSON`, so canvas ids match doc ids.
   * If a future refactor breaks that chain, this method makes the
   * divergence non-fatal by removing doc-only ids and synthesizing
   * elements for canvas-only ids (via {@link ElementFactory.fromFabricObject}).
   */
  private reconcileDocFromCanvas(): void {
    if (!this.canvas) return;

    const canvasIds = new Set<string>();
    let multiSelectMarkerSeen = false;
    this.canvas.forEachObject((obj) => {
      const id = this.getObjectId(obj);
      if (!id) return;
      if (id === MULTI_SELECT_MARKER_ID) {
        multiSelectMarkerSeen = true;
        return;
      }
      canvasIds.add(id);
    });

    const docIds = new Set(this.doc.elements().keys());

    // Drop doc-only entries (canvas restored but doc didn't — should not
    // happen because we restored doc first, but defends against race).
    for (const id of docIds) {
      if (!canvasIds.has(id)) {
        this.doc.removeElement(id);
      }
    }

    // Add canvas-only entries (Fabric generated something the doc doesn't
    // know about — last-resort materialization).
    if (canvasIds.size > 0) {
      const canvasObjects = this.canvas.getObjects();
      for (const id of canvasIds) {
        if (docIds.has(id)) continue;
        const obj = canvasObjects.find((o) => this.getObjectId(o) === id);
        if (obj) {
          const element = ElementFactory.fromFabricObject(obj, id);
          if (element) {
            this.doc.addElement(element as unknown as LabelElement);
          }
        }
      }
    }

    // Suppress unused-variable lint without changing semantics.
    void multiSelectMarkerSeen;
  }

  private getObjectId(object: any): string {
    return this.renderer.getObjectId(object);
  }

  private syncSignals(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }
}