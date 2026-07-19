// src/app/editor/commands/add-image.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCommandContext } from '../editor/editor-command-context';
import { ImageElement } from '../models/image-element';
import type { LabelElement } from '../models/editor.models';

export class AddImageCommand implements EditorCommand {
  readonly name = 'add-image';
  element: ImageElement | null = null;

  constructor(private readonly url: string) {}

  async execute(ctx: EditorCommandContext): Promise<void> {
    if (!ctx.canvas || !this.url) throw new Error('Canvas not initialized or URL missing');

    this.element = new ImageElement({
      type: 'image',
      id: ctx.randomId(),
      x: 24, y: 24, width: 220, height: 220,
      src: this.url
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.addElement(this.element as LabelElement);
    ctx.canvasAdd(obj);
    ctx.selectItemAfterAdded(obj);
    ctx.touchRevision();
  }

  undo(_ctx: EditorCommandContext): void { this.element = null; }
}
