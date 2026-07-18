// src/app/editor/commands/add-text.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';
import { TextElement } from '../models/text-element';
import { DEFAULT_SELECTION_STATE } from '../models/editor.models';

export class AddTextCommand implements EditorCommand {
  readonly name = 'add-text';
  element: TextElement | null = null;

  constructor(private readonly content: string) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    if (!ctx.canvas) throw new Error('Canvas not initialized');

    this.element = new TextElement({
      type: 'text',
      id: ctx.randomId(),
      x: 24, y: 24,
      width: 200,
      text: this.content,
      fontSize: DEFAULT_SELECTION_STATE.fontSize,
      fontFamily: DEFAULT_SELECTION_STATE.fontFamily,
      color: '#111827'
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.elementRegistry.set(this.element.id, this.element);
    ctx.canvas.add(obj);
    ctx.selectItemAfterAdded(obj);
  }

  undo(_ctx: EditorCanvasService): void { this.element = null; }
}