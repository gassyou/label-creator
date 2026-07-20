/**
 * Operations service (Phase 4 of the four-layer architecture refactor).
 *
 * Owns the geometric / structural operations the editor exposes to the user:
 *  - Element creation commands (`addText`, `addShape`, `addQRCode`, `addBarcode`)
 *    — each method instantiates the corresponding `*Command` and dispatches
 *    it through `UndoRedoService.execute(ctx)`.
 *  - Structural ops on the current selection (`deleteSelected`, `cloneSelected`,
 *    `copySelected`, `pasteClipboard`).
 *  - Multi-selection alignment (`alignSelectedObjects`, `distributeSelectedObjects`).
 *  - Z-order ops (`bringSelectionToFront`, `sendSelectionToBack`).
 *
 * Also builds the {@link EditorCommandContext} used by every EditorCommand.
 * The context is a narrow, read-only view over the underlying services —
 * commands depend on it instead of the legacy `EditorCanvasService`
 * facade (which has been removed).
 *
 * Does NOT own:
 *  - Selection state: that's `SelectionService`.
 *  - Canvas lifecycle / doc → fabric reconciliation: that's `FabricRenderer`.
 *  - Snapshot stack / undo redo: lives on `UndoRedoService`.
 */
import { Injectable, inject } from '@angular/core';
import { ActiveSelection } from 'fabric';
import { FabricRenderer } from '../render/fabric-renderer';
import { LabelDocumentService } from '../document/label-document.service';
import { SelectionService } from './selection.service';
import { UndoRedoService } from './undo-redo.service';
import { AddTextCommand } from '../commands/add-text.command';
import { AddShapeCommand } from '../commands/add-shape.command';
import { AddQRCodeCommand } from '../commands/add-qrcode.command';
import { AddBarcodeCommand } from '../commands/add-barcode.command';
import { DeleteSelectedCommand } from '../commands/delete-selected.command';
import type {
  TextElement,
  QRCodeElement,
  BarcodeElement,
  LabelElement,
} from '../models/editor.models';
import type { BaseElement } from '../models/element-base';
import type { EditorCommandContext } from './editor-command-context';

@Injectable()
export class OperationsService {
  private readonly renderer = inject(FabricRenderer);
  private readonly doc = inject(LabelDocumentService);
  private readonly selection = inject(SelectionService);
  private readonly undoRedo = inject(UndoRedoService);

  /**
   * Builds the {@link EditorCommandContext} commands operate on. Built
   * fresh per command (cheap) so it always reflects the current
   * canvas / doc state.
   */
  private buildContext(): EditorCommandContext {
    return {
      canvas: this.renderer.getCanvas(),
      getObjectId: (obj) => this.renderer.getObjectId(obj as never),
      randomId: () => this.renderer.randomId(),
      getRenderContext: () => this.renderer.getRenderContext(),
      addElement: (el: LabelElement) => this.doc.addElement(el),
      canvasAdd: (obj) => this.renderer.getCanvas()?.add(obj as never),
      selectItemAfterAdded: (obj) => this.selectItemAfterAdded(obj),
      clearActiveSelection: () => this.clearActiveSelection(),
      removeElementById: (id) => this.doc.removeElement(id),
      clearAllElements: () => this.clearAllElements(),
      touchRevision: () => this.renderer.touchRevision(),
    };
  }

  // ============================================================
  // Element Creation Commands
  // ============================================================

  async addText(content: string): Promise<TextElement> {
    const cmd = new AddTextCommand(content);
    await this.undoRedo.execute(cmd, this.buildContext());
    return cmd.element!;
  }

  async addShape(
    shapeType: 'square' | 'triangle' | 'circle' | 'line',
  ): Promise<BaseElement> {
    const cmd = new AddShapeCommand(shapeType);
    await this.undoRedo.execute(cmd, this.buildContext());
    return cmd.element!;
  }

  async addQRCode(bindingValue?: string): Promise<QRCodeElement> {
    const cmd = new AddQRCodeCommand(bindingValue);
    await this.undoRedo.execute(cmd, this.buildContext());
    return cmd.element!;
  }

  async addBarcode(
    format: BarcodeElement['format'],
    bindingValue?: string,
  ): Promise<BarcodeElement> {
    const cmd = new AddBarcodeCommand(format, bindingValue);
    await this.undoRedo.execute(cmd, this.buildContext());
    return cmd.element!;
  }

  // ============================================================
  // Structural operations on the current selection
  // ============================================================

  async deleteSelected(): Promise<void> {
    await this.undoRedo.execute(new DeleteSelectedCommand(), this.buildContext());
  }

  /** In-memory clipboard for copy/paste. */
  private clipboard: any[] = [];

  /**
   * Duplicates the currently active object on the canvas, offset by (+20, +20),
   * and selects the clone.
   */
  cloneSelected(): void {
    const canvas = this.renderer.getCanvas();
    const activeObject = canvas?.getActiveObject();
    if (!canvas || !activeObject) {
      return;
    }

    activeObject.clone().then((clone) => {
      clone.set({
        left: (clone.left ?? 0) + 20,
        top: (clone.top ?? 0) + 20,
      });
      this.renderer.extend(clone as any, this.renderer.randomId());
      canvas.add(clone);
      this.selectItemAfterAdded(clone as any);
    });
  }

  /**
   * Copies all active objects into the in-memory clipboard. Pastes happen via
   * {@link pasteClipboard}.
   */
  copySelected(): void {
    const canvas = this.renderer.getCanvas();
    const activeObjects = canvas?.getActiveObjects();
    if (!canvas || !activeObjects || activeObjects.length === 0) {
      return;
    }

    this.clipboard = [];
    Promise.all(activeObjects.map((obj) => obj.clone())).then((clones) => {
      this.clipboard = clones;
    });
  }

  /**
   * Pastes the contents of the in-memory clipboard onto the canvas, offset
   * by (+20, +20) so the user can see the new objects. Pushes an undo
   * snapshot first so the paste is undoable.
   */
  pasteClipboard(): void {
    const canvas = this.renderer.getCanvas();
    if (!canvas || this.clipboard.length === 0) {
      return;
    }

    this.undoRedo.pushSnapshotSync();
    const newObjects: any[] = [];

    this.clipboard.forEach((clone) => {
      clone.set({
        left: (clone.left ?? 0) + 20,
        top: (clone.top ?? 0) + 20,
      });
      this.renderer.extend(clone, this.renderer.randomId());
      canvas.add(clone);
      newObjects.push(clone);
    });

    if (newObjects.length === 1) {
      canvas.setActiveObject(newObjects[0]);
    } else if (newObjects.length > 1) {
      const selection = new ActiveSelection(newObjects, { canvas });
      canvas.setActiveObject(selection);
    }
    canvas.requestRenderAll();
    this.renderer.touchRevision();
  }

  // ============================================================
  // Multi-selection alignment
  //
  // The alignment geometry is computed inline (no separate sub-service);
  // OperationsService is the natural home for "what happens when the user
  // presses the align-left button."
  // ============================================================

  alignSelectedObjects(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    const canvas = this.renderer.getCanvas();
    const objects = canvas?.getActiveObjects();
    if (!canvas || !objects || objects.length === 0) return;

    // Get canvas dimensions for page-based alignment
    const canvasWidth = canvas.width ?? 0;
    const canvasHeight = canvas.height ?? 0;

    // Normalize all objects to have originX='left' and originY='top'
    // while preserving their visual position
    objects.forEach((obj) => {
      const currentLeft = obj.left ?? 0;
      const currentTop = obj.top ?? 0;
      const width = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const height = (obj.height ?? 0) * (obj.scaleY ?? 1);

      // Calculate visual left/top based on current origin
      const visualLeft =
        obj.originX === 'center'
          ? currentLeft - width / 2
          : obj.originX === 'right'
            ? currentLeft - width
            : currentLeft;
      const visualTop =
        obj.originY === 'center'
          ? currentTop - height / 2
          : obj.originY === 'bottom'
            ? currentTop - height
            : currentTop;

      obj.set({
        originX: 'left',
        originY: 'top',
        left: visualLeft,
        top: visualTop,
      });
      obj.setCoords();
    });

    // Calculate actual bounds for each object
    const objectData = objects.map((obj) => {
      const left = obj.left ?? 0;
      const top = obj.top ?? 0;
      const width = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const height = (obj.height ?? 0) * (obj.scaleY ?? 1);
      return { obj, left, top, width, height };
    });

    // Calculate bounding extremes from selected objects
    const minLeft = Math.min(...objectData.map((d) => d.left));
    const maxRight = Math.max(...objectData.map((d) => d.left + d.width));
    const minTop = Math.min(...objectData.map((d) => d.top));
    const maxBottom = Math.max(...objectData.map((d) => d.top + d.height));

    // Calculate target bounds - use canvas/page for alignment reference
    let targetLeft: number, targetRight: number, targetTop: number, targetBottom: number;
    let targetCenterX: number, targetCenterY: number;

    if (objects.length === 1) {
      // Single selection: align to canvas/page
      targetLeft = 0;
      targetRight = canvasWidth;
      targetTop = 0;
      targetBottom = canvasHeight;
      targetCenterX = canvasWidth / 2;
      targetCenterY = canvasHeight / 2;
    } else {
      // Multi-selection: align to bounding box of selected objects
      targetLeft = minLeft;
      targetRight = maxRight;
      targetTop = minTop;
      targetBottom = maxBottom;
      targetCenterX = (minLeft + maxRight) / 2;
      targetCenterY = (minTop + maxBottom) / 2;
    }

    // Calculate new positions
    const newPositions: Map<any, { left?: number; top?: number }> = new Map();
    for (const data of objectData) {
      const newPos: { left?: number; top?: number } = {};
      switch (direction) {
        case 'left':
          newPos.left = targetLeft;
          break;
        case 'center':
          newPos.left = targetCenterX - data.width / 2;
          break;
        case 'right':
          newPos.left = targetRight - data.width;
          break;
        case 'top':
          newPos.top = targetTop;
          break;
        case 'middle':
          newPos.top = targetCenterY - data.height / 2;
          break;
        case 'bottom':
          newPos.top = targetBottom - data.height;
          break;
      }
      newPositions.set(data.obj, newPos);
    }

    // Apply all position changes at once
    for (const data of objectData) {
      const newPos = newPositions.get(data.obj);
      if (newPos) {
        data.obj.set(newPos);
      }
    }

    // Update coordinates and render
    objects.forEach((obj) => obj.setCoords());
    canvas.requestRenderAll();
    this.renderer.touchRevision();
  }

  distributeSelectedObjects(direction: 'horizontal' | 'vertical'): void {
    const canvas = this.renderer.getCanvas();
    const objects = canvas?.getActiveObjects();
    if (!canvas || !objects || objects.length < 3) return;

    // Normalize all objects to originX='left' and originY='top' first
    objects.forEach((obj) => {
      const currentLeft = obj.left ?? 0;
      const currentTop = obj.top ?? 0;
      const scaleX = obj.scaleX ?? 1;
      const scaleY = obj.scaleY ?? 1;
      const width = (obj.width ?? 0) * scaleX;
      const height = (obj.height ?? 0) * scaleY;

      // Calculate visual left/top based on current origin
      const visualLeft =
        obj.originX === 'center'
          ? currentLeft - width / 2
          : obj.originX === 'right'
            ? currentLeft - width
            : currentLeft;
      const visualTop =
        obj.originY === 'center'
          ? currentTop - height / 2
          : obj.originY === 'bottom'
            ? currentTop - height
            : currentTop;

      // Set origin to left/top
      obj.set({
        originX: 'left',
        originY: 'top',
      });

      // Keep the same visual position using calculated visual values
      obj.set({
        left: visualLeft,
        top: visualTop,
      });
      obj.setCoords();
    });

    // Now get bounds after normalization
    interface ObjData {
      obj: any;
      left: number;
      top: number;
      width: number;
      height: number;
    }
    const objectData: ObjData[] = objects.map((obj) => ({
      obj,
      left: obj.left ?? 0,
      top: obj.top ?? 0,
      width: (obj.width ?? 0) * (obj.scaleX ?? 1),
      height: (obj.height ?? 0) * (obj.scaleY ?? 1),
    }));

    // Sort objects along the axis
    const sorted = [...objectData].sort((a, b) =>
      direction === 'horizontal' ? a.left - b.left : a.top - b.top,
    );

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const firstEdge = direction === 'horizontal' ? first.left : first.top;
    const lastEdge = direction === 'horizontal' ? last.left + last.width : last.top + last.height;
    const totalSpace = lastEdge - firstEdge;
    const totalSize = sorted.reduce(
      (sum, d) => (direction === 'horizontal' ? sum + d.width : sum + d.height),
      0,
    );
    const availableSpace = totalSpace - totalSize;
    const gap = availableSpace / (sorted.length - 1);

    let currentEdge = firstEdge + (direction === 'horizontal' ? first.width : first.height) + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      const data = sorted[i];
      if (direction === 'horizontal') {
        data.obj.set({ left: currentEdge });
      } else {
        data.obj.set({ top: currentEdge });
      }
      currentEdge += (direction === 'horizontal' ? data.width : data.height) + gap;
      data.obj.setCoords();
    }

    canvas.requestRenderAll();
    this.renderer.touchRevision();
  }

  // ============================================================
  // Z-order operations
  // ============================================================

  bringSelectionToFront(): void {
    const canvas = this.renderer.getCanvas();
    const activeObjects = canvas?.getActiveObjects() ?? [];
    if (!canvas || !activeObjects.length) {
      return;
    }

    activeObjects.forEach((object) => canvas.bringObjectToFront(object));
    canvas.requestRenderAll();
  }

  sendSelectionToBack(): void {
    const canvas = this.renderer.getCanvas();
    const activeObjects = canvas?.getActiveObjects() ?? [];
    if (!canvas || !activeObjects.length) {
      return;
    }

    activeObjects.forEach((object) => canvas.sendObjectToBack(object));
    canvas.requestRenderAll();
  }

  // ============================================================
  // Context helpers used by EditorCommandContext
  // ============================================================

  /**
   * Selects the freshly added object on the Fabric canvas and pushes the
   * selection into the editor-layer signals via {@link SelectionService}.
   * Replaces the legacy `EditorCanvasService.selectItemAfterAdded`.
   */
  selectItemAfterAdded(obj: unknown): void {
    const canvas = this.renderer.getCanvas();
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.setActiveObject(obj as never);
    canvas.requestRenderAll();
    this.selection.handleFabricSelection(obj);
  }

  /**
   * Clears the active selection on the Fabric canvas and pushes the
   * null selection into the editor-layer signals via {@link SelectionService}.
   * Replaces the legacy `EditorCanvasService.clearSelection` /
   * `handleSelection(null)` chain.
   */
  clearActiveSelection(): void {
    const canvas = this.renderer.getCanvas();
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    this.selection.handleFabricSelection(null);
  }

  /**
   * Wipes the central document's element registry. Used by the delete
   * and clear commands to keep `doc.elements` coherent with the Fabric
   * canvas after a multi-object wipe.
   */
  private clearAllElements(): void {
    this.doc.setElements(new Map());
  }
}
