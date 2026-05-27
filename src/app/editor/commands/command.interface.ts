import { Canvas, FabricObject } from 'fabric';

/**
 * Canvas Command Interface
 * 命令模式：封装画布操作，支持 undo/redo
 */
export interface CanvasCommand {
  /** 命令名称，用于撤销/重做提示 */
  readonly name: string;

  /** 执行命令 */
  execute(): void;

  /** 撤销命令 */
  undo(): void;

  /** 重做命令（通常与 execute 相同） */
  redo(): void;
}

/**
 * 命令工厂接口
 */
export interface CommandFactory {
  createAddCommand(
    canvas: Canvas,
    fabricObject: FabricObject,
    elementId: string
  ): CanvasCommand;

  createRemoveCommand(
    canvas: Canvas,
    fabricObjects: FabricObject[]
  ): CanvasCommand;

  createStyleChangeCommand(
    object: FabricObject,
    property: string,
    oldValue: any,
    newValue: any
  ): CanvasCommand;

  createPropertyChangeCommand(
    object: FabricObject,
    properties: Record<string, any>,
    oldProperties: Record<string, any>
  ): CanvasCommand;
}