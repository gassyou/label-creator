import { Injectable, signal } from '@angular/core';
import { CanvasCommand } from './command.interface';

/**
 * 命令历史服务
 * 管理撤销/重做栈
 */
@Injectable()
export class CommandHistoryService {
  private undoStack: CanvasCommand[] = [];
  private redoStack: CanvasCommand[] = [];
  private readonly maxSize = 50;

  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly lastAction = signal<string | null>(null);

  /**
   * 执行命令并加入历史栈
   */
  execute(command: CanvasCommand): void {
    command.execute();
    this.undoStack.push(command);

    // Limit stack size
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }

    // Clear redo stack on new action
    this.redoStack = [];

    this.updateState();
  }

  /**
   * 撤销
   */
  undo(): boolean {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      this.updateState();
      return true;
    }
    return false;
  }

  /**
   * 重做
   */
  redo(): boolean {
    const command = this.redoStack.pop();
    if (command) {
      command.redo();
      this.undoStack.push(command);
      this.updateState();
      return true;
    }
    return false;
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.updateState();
  }

  /**
   * 是否可以撤销
   */
  canUndoNow(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * 是否可以重做
   */
  canRedoNow(): boolean {
    return this.redoStack.length > 0;
  }

  private updateState(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.lastAction.set(
      this.undoStack.length > 0
        ? this.undoStack[this.undoStack.length - 1].name
        : null
    );
  }
}