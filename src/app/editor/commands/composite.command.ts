import { CanvasCommand } from './command.interface';

/**
 * 组合命令 - 将多个命令组合为一个
 */
export class CompositeCommand implements CanvasCommand {
  readonly name: string;

  constructor(
    private commands: CanvasCommand[],
    description?: string
  ) {
    this.name = description || `Batch (${commands.length} operations)`;
  }

  execute(): void {
    for (const command of this.commands) {
      command.execute();
    }
  }

  undo(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  redo(): void {
    for (const command of this.commands) {
      command.redo();
    }
  }
}

/**
 * 空命令（无操作）
 */
export class NoOpCommand implements CanvasCommand {
  readonly name = 'No Operation';

  execute(): void {
    // No-op
  }

  undo(): void {
    // No-op
  }

  redo(): void {
    // No-op
  }
}