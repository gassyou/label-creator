// src/app/editor/commands/add-barcode.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';
import { BarcodeElement, type BarcodeFormat } from '../models/barcode-element';

export class AddBarcodeCommand implements EditorCommand {
  readonly name = 'add-barcode';
  element: BarcodeElement | null = null;

  constructor(
    private readonly format: BarcodeFormat | string,
    private readonly bindingValue?: string
  ) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    if (!ctx.canvas) throw new Error('Canvas not initialized');

    this.element = new BarcodeElement({
      type: 'barcode',
      id: ctx.randomId(),
      x: 24, y: 24, width: 200, height: 80,
      format: this.format,
      value: this.bindingValue ?? '',
      binding: this.bindingValue,
      showText: true
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.elementRegistry.set(this.element.id, this.element);
    ctx.canvas.add(obj);
    ctx.selectItemAfterAdded(obj);
  }

  undo(_ctx: EditorCanvasService): void { this.element = null; }
}