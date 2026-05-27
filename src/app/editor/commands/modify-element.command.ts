import { FabricObject } from 'fabric';
import { CanvasCommand } from './command.interface';

/**
 * 属性修改命令
 */
export class ModifyElementCommand implements CanvasCommand {
  readonly name: string;
  private targetObject: FabricObject;

  constructor(
    private object: FabricObject,
    private properties: Record<string, any>,
    private oldProperties: Record<string, any>,
    description = 'Modify'
  ) {
    this.name = description;
    this.targetObject = object;
  }

  execute(): void {
    this.targetObject.set(this.properties);
    this.targetObject.canvas?.requestRenderAll();
  }

  undo(): void {
    this.targetObject.set(this.oldProperties);
    this.targetObject.canvas?.requestRenderAll();
  }

  redo(): void {
    this.execute();
  }
}

/**
 * 批量属性修改命令
 */
export class BatchModifyCommand implements CanvasCommand {
  readonly name: string;

  constructor(
    private commands: ModifyElementCommand[]
  ) {
    this.name = `Modify ${commands.length} elements`;
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    // Undo in reverse order
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