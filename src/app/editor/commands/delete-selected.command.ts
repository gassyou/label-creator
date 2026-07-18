// src/app/editor/commands/delete-selected.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';

export class DeleteSelectedCommand implements EditorCommand {
  readonly name = 'delete-selected';

  execute(ctx: EditorCanvasService): void {
    ctx.deleteSelectedInternal();
  }

  undo(_ctx: EditorCanvasService): void { /* snapshot restores canvas state */ }
}