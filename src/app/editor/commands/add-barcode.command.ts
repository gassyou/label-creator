// src/app/editor/commands/add-barcode.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCommandContext } from '../editor/editor-command-context';
import { BarcodeElement, type BarcodeFormat } from '../models/barcode-element';
import type { LabelElement } from '../models/editor.models';

export class AddBarcodeCommand implements EditorCommand {
  readonly name = 'add-barcode';
  element: BarcodeElement | null = null;

  constructor(
    private readonly barcodeFormat: BarcodeFormat | string = 'CODE128',
    private readonly bindingValue?: string
  ) {}

  async execute(ctx: EditorCommandContext): Promise<void> {
    if (!ctx.canvas) throw new Error('Canvas not initialized');

    this.element = new BarcodeElement({
      type: 'barcode',
      id: ctx.randomId(),
      x: 24, y: 24, width: 200, height: 80,
      barcodeFormat: this.barcodeFormat,
      bindingValue: this.bindingValue,
      showText: true
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.addElement(this.element as LabelElement);
    ctx.canvasAdd(obj);
    ctx.selectItemAfterAdded(obj);
    ctx.touchRevision();
  }

  undo(_ctx: EditorCommandContext): void { this.element = null; }
}
