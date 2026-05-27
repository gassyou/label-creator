import { FabricObject } from 'fabric';
import { CanvasCommand } from './command.interface';

/**
 * 样式变更命令
 */
export class StyleChangeCommand implements CanvasCommand {
  readonly name: string;
  private targetObject: FabricObject;

  constructor(
    object: FabricObject,
    private property: string,
    private oldValue: any,
    private newValue: any,
    private displayName?: string
  ) {
    this.name = displayName || `Change ${property}`;
    this.targetObject = object;
  }

  execute(): void {
    this.targetObject.set(this.property as any, this.newValue);
    this.targetObject.canvas?.requestRenderAll();
  }

  undo(): void {
    this.targetObject.set(this.property as any, this.oldValue);
    this.targetObject.canvas?.requestRenderAll();
  }

  redo(): void {
    this.execute();
  }
}

/**
 * 批量样式变更命令
 */
export class BatchStyleChangeCommand implements CanvasCommand {
  readonly name: string;

  constructor(
    private commands: StyleChangeCommand[]
  ) {
    this.name = commands.length > 1
      ? `Change ${commands.length} styles`
      : commands[0]?.name || 'Style change';
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  redo(): void {
    for (const cmd of this.commands) {
      cmd.redo();
    }
  }
}