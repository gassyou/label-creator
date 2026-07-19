// src/app/editor/commands/add-qrcode.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCommandContext } from '../editor/editor-command-context';
import { QRCodeElement } from '../models/qrcode-element';
import type { LabelElement } from '../models/editor.models';

export class AddQRCodeCommand implements EditorCommand {
  readonly name = 'add-qrcode';
  element: QRCodeElement | null = null;

  constructor(private readonly bindingValue?: string) {}

  async execute(ctx: EditorCommandContext): Promise<void> {
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
    ctx.addElement(this.element as LabelElement);
    ctx.canvasAdd(obj);
    ctx.selectItemAfterAdded(obj);
    ctx.touchRevision();
  }

  undo(_ctx: EditorCommandContext): void { this.element = null; }
}
