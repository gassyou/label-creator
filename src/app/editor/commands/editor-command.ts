// src/app/editor/commands/editor-command.ts
// Type-only import to keep this layer cycle-free.
import type { EditorCommandContext } from '../editor/editor-command-context';

export interface EditorCommand {
  readonly name: string;
  execute(ctx: EditorCommandContext): void | Promise<void>;
  undo(ctx: EditorCommandContext): void;
}
