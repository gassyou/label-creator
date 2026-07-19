// src/app/editor/commands/add-qrcode.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';
import { QRCodeElement } from '../models/qrcode-element';
import type { LabelElement } from '../models/editor.models';

export class AddQRCodeCommand implements EditorCommand {
  readonly name = 'add-qrcode';
  element: QRCodeElement | null = null;

  constructor(private readonly bindingValue?: string) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    if (!ctx.canvas) throw new Error('Canvas not initialized');

    this.element = new QRCodeElement({
      type: 'qrcode',
      id: ctx.randomId(),
      x: 24, y: 24, width: 100, height: 100,
      value: this.bindingValue ?? '',
      binding: this.bindingValue,
      errorCorrectionLevel: 'M',
      foregroundColor: '#000000',
      backgroundColor: '#ffffff'
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.doc.addElement(this.element as LabelElement);
    ctx.canvas.add(obj);
    ctx.selectItemAfterAdded(obj);
  }

  undo(_ctx: EditorCanvasService): void { this.element = null; }
}