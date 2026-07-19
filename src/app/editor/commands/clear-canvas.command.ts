// src/app/editor/commands/clear-canvas.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCommandContext } from '../editor/editor-command-context';

export class ClearCanvasCommand implements EditorCommand {
  readonly name = 'clear-canvas';

  execute(ctx: EditorCommandContext): void {
    if (!ctx.canvas) return;
    const canvas = ctx.canvas;
    const objects = canvas.getObjects().slice();
    for (const obj of objects) canvas.remove(obj);
    // Mirror the wipe into the central document.
    ctx.clearAllElements();
    ctx.clearActiveSelection();
    ctx.touchRevision();
  }

  undo(_ctx: EditorCommandContext): void { /* snapshot restores canvas state */ }
}
