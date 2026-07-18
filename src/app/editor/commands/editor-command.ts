// src/app/editor/commands/editor-command.ts
// Type-only import to avoid a runtime cycle between the service and commands.
import type { EditorCanvasService } from '../editor-canvas.service';

export interface EditorCommand {
  readonly name: string;
  execute(ctx: EditorCanvasService): void | Promise<void>;
  undo(ctx: EditorCanvasService): void;
}
