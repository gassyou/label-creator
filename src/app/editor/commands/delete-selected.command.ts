// src/app/editor/commands/delete-selected.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCommandContext } from '../editor/editor-command-context';

export class DeleteSelectedCommand implements EditorCommand {
  readonly name = 'delete-selected';

  execute(ctx: EditorCommandContext): void {
    if (!ctx.canvas) return;
    const canvas = ctx.canvas;
    const activeObjects = canvas.getActiveObjects();
    if (!activeObjects.length) return;

    canvas.discardActiveObject();
    for (const obj of activeObjects) {
      // Use the renderer's getObjectId via the context helper.
      const id = ctx.getObjectId(obj as never);
      if (id) {
        ctx.removeElementById(id);
      }
      canvas.remove(obj);
    }
    canvas.requestRenderAll();
    ctx.clearActiveSelection();
    ctx.touchRevision();
  }

  undo(_ctx: EditorCommandContext): void { /* snapshot restores canvas state */ }
}
