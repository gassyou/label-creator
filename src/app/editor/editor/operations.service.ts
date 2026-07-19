/**
 * Operations service (Phase 4 of the four-layer architecture refactor).
 *
 * Owns the geometric / structural operations the editor exposes to the user:
 *  - Element creation commands (`addText`, `addShape`, `addQRCode`, `addBarcode`,
 *    `addImage`) — each method instantiates the corresponding `*Command` and
 *    dispatches it through `EditorCanvasService.execute()` so the standard
 *    undo/redo bookkeeping happens.
 *  - Structural ops on the current selection (`deleteSelected`, `clearCanvas`,
 *    `cloneSelected`).
 *  - Multi-selection alignment (`alignLeft`, `alignCenter`, `alignRight`,
 *    `alignTop`, `alignMiddle`, `alignBottom`).
 *  - Z-order ops (`bringSelectionToFront`, `sendSelectionToBack`).
 *
 * Does NOT own:
 *  - Selection state: that's `SelectionService`.
 *  - Canvas lifecycle / doc → fabric reconciliation: that's `FabricRenderer`.
 *  - Snapshot stack / undo redo: still lives on `EditorCanvasService`
 *    (next refactor move: UndoRedoService).
 *
 * Commands are dispatched through `EditorCanvasService.execute(cmd)` so the
 * undo/redo machinery (pushUndoSnapshot, redoStack clearing, error rollback)
 * stays in one place. This service is a thin orchestrator.
 */
import { Injectable, inject } from '@angular/core';
import { EditorCanvasService } from '../editor-canvas.service';
import { FabricRenderer } from '../render/fabric-renderer';
import { LabelDocumentService } from '../document/label-document.service';
import { AddTextCommand } from '../commands/add-text.command';
import { AddShapeCommand } from '../commands/add-shape.command';
import { AddQRCodeCommand } from '../commands/add-qrcode.command';
import { AddBarcodeCommand } from '../commands/add-barcode.command';
import { AddImageCommand } from '../commands/add-image.command';
import { DeleteSelectedCommand } from '../commands/delete-selected.command';
import { ClearCanvasCommand } from '../commands/clear-canvas.command';
import type {
  TextElement,
  QRCodeElement,
  BarcodeElement,
  ImageElement,
} from '../models/editor.models';
import type { BaseElement } from '../models/element-base';

@Injectable()
export class OperationsService {
  private readonly editorCanvasService = inject(EditorCanvasService);
  private readonly renderer = inject(FabricRenderer);
  private readonly doc = inject(LabelDocumentService);

  // ============================================================
  // Element Creation Commands
  // ============================================================

  async addText(content: string): Promise<TextElement> {
    const cmd = new AddTextCommand(content);
    await this.editorCanvasService.execute(cmd);
    return cmd.element!;
  }

  async addShape(
    shapeType: 'square' | 'triangle' | 'circle' | 'line',
  ): Promise<BaseElement> {
    const cmd = new AddShapeCommand(shapeType);
    await this.editorCanvasService.execute(cmd);
    return cmd.element!;
  }

  async addQRCode(bindingValue?: string): Promise<QRCodeElement> {
    const cmd = new AddQRCodeCommand(bindingValue);
    await this.editorCanvasService.execute(cmd);
    return cmd.element!;
  }

  async addBarcode(
    format: BarcodeElement['format'],
    bindingValue?: string,
  ): Promise<BarcodeElement> {
    const cmd = new AddBarcodeCommand(format, bindingValue);
    await this.editorCanvasService.execute(cmd);
    return cmd.element!;
  }

  async addImage(url: string): Promise<ImageElement | null> {
    if (!url) return null;
    const cmd = new AddImageCommand(url);
    await this.editorCanvasService.execute(cmd);
    return cmd.element!;
  }

  // ============================================================
  // Structural operations on the current selection
  // ============================================================

  async deleteSelected(): Promise<void> {
    await this.editorCanvasService.execute(new DeleteSelectedCommand());
  }

  async clearCanvas(): Promise<void> {
    await this.editorCanvasService.execute(new ClearCanvasCommand());
  }

  // ============================================================
  // Multi-selection alignment
  //
  // The actual geometric calculation is performed by
  // `EditorCanvasService.alignSelectedObjects`; this service exposes
  // semantic wrappers (`alignLeft`, `alignCenter`, `alignRight`,
  // `alignTop`, `alignMiddle`, `alignBottom`) so the public API matches
  // the user-facing toolbar buttons.
  // ============================================================

  alignLeft(): void {
    this.editorCanvasService.alignSelectedObjects('left');
  }

  alignCenter(): void {
    this.editorCanvasService.alignSelectedObjects('center');
  }

  alignRight(): void {
    this.editorCanvasService.alignSelectedObjects('right');
  }

  alignTop(): void {
    this.editorCanvasService.alignSelectedObjects('top');
  }

  alignMiddle(): void {
    this.editorCanvasService.alignSelectedObjects('middle');
  }

  alignBottom(): void {
    this.editorCanvasService.alignSelectedObjects('bottom');
  }

  // ============================================================
  // Z-order operations
  // ============================================================

  bringSelectionToFront(): void {
    const activeObjects = this.renderer.getCanvas()?.getActiveObjects() ?? [];
    if (!this.renderer.getCanvas() || !activeObjects.length) {
      return;
    }

    activeObjects.forEach((object) =>
      this.renderer.getCanvas()?.bringObjectToFront(object),
    );
    this.renderer.getCanvas()?.requestRenderAll();
  }

  sendSelectionToBack(): void {
    const activeObjects = this.renderer.getCanvas()?.getActiveObjects() ?? [];
    if (!this.renderer.getCanvas() || !activeObjects.length) {
      return;
    }

    activeObjects.forEach((object) =>
      this.renderer.getCanvas()?.sendObjectToBack(object),
    );
    this.renderer.getCanvas()?.requestRenderAll();
  }
}
