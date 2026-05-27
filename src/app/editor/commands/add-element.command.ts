import { Canvas, FabricObject } from 'fabric';
import { CanvasCommand } from './command.interface';

/**
 * 添加元素命令
 */
export class AddElementCommand implements CanvasCommand {
  readonly name: string;

  constructor(
    private canvas: Canvas,
    private fabricObject: FabricObject,
    private elementId: string,
    private elementType: string
  ) {
    this.name = `Add ${elementType}`;
  }

  execute(): void {
    this.canvas.add(this.fabricObject);
    this.canvas.requestRenderAll();
  }

  undo(): void {
    this.canvas.remove(this.fabricObject);
    this.canvas.requestRenderAll();
  }

  redo(): void {
    this.execute();
  }

  /**
   * 获取添加的对象
   */
  getObject(): FabricObject {
    return this.fabricObject;
  }
}

/**
 * 批量添加元素命令
 */
export class BatchAddCommand implements CanvasCommand {
  readonly name: string;
  private addedObjects: FabricObject[] = [];

  constructor(
    private canvas: Canvas,
    private objects: Array<{ fabricObject: FabricObject; elementId: string; elementType: string }>
  ) {
    this.name = `Add ${objects.length} elements`;
  }

  execute(): void {
    for (const item of this.objects) {
      this.canvas.add(item.fabricObject);
      this.addedObjects.push(item.fabricObject);
    }
    this.canvas.requestRenderAll();
  }

  undo(): void {
    for (const obj of this.addedObjects) {
      this.canvas.remove(obj);
    }
    this.addedObjects = [];
    this.canvas.requestRenderAll();
  }

  redo(): void {
    this.execute();
  }
}