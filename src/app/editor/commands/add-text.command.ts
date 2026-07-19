// src/app/editor/commands/add-text.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCommandContext } from '../editor/editor-command-context';
import { TextElement } from '../models/text-element';
import { DEFAULT_SELECTION_STATE, type LabelElement } from '../models/editor.models';

export class AddTextCommand implements EditorCommand {
  readonly name = 'add-text';
  element: TextElement | null = null;

  constructor(private readonly content: string) {}

  async execute(ctx: EditorCommandContext): Promise<void> {
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
    ctx.addElement(this.element as LabelElement);
    ctx.canvasAdd(obj);
    ctx.selectItemAfterAdded(obj);
    ctx.touchRevision();
  }

  undo(_ctx: EditorCommandContext): void { this.element = null; }
}
