// src/app/editor/commands/add-image.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';
import { ImageElement } from '../models/image-element';
import type { LabelElement } from '../models/editor.models';

export class AddImageCommand implements EditorCommand {
  readonly name = 'add-image';
  element: ImageElement | null = null;

  constructor(private readonly url: string) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    if (!ctx.canvas || !this.url) throw new Error('Canvas not initialized or URL missing');

    this.element = new ImageElement({
      type: 'image',
      id: ctx.randomId(),
      x: 24, y: 24, width: 220, height: 220,
      src: this.url
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.doc.addElement(this.element as LabelElement);
    ctx.canvas.add(obj);
    ctx.selectItemAfterAdded(obj);
  }

  undo(_ctx: EditorCanvasService): void { this.element = null; }
}