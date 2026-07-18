// src/app/editor/commands/clear-canvas.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';

export class ClearCanvasCommand implements EditorCommand {
  readonly name = 'clear-canvas';

  execute(ctx: EditorCanvasService): void {
    ctx.clearCanvasInternal();
  }

  undo(_ctx: EditorCanvasService): void { /* snapshot restores canvas state */ }
}