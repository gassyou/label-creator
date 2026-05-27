import { Canvas, FabricObject } from 'fabric';
import { CanvasCommand } from './command.interface';

/**
 * 删除元素命令
 */
export class RemoveElementCommand implements CanvasCommand {
  readonly name: string;
  private removedObjects: Array<{
    object: FabricObject;
    canvas: Canvas;
    index: number;
  }> = [];

  constructor(
    private canvas: Canvas,
    private objects: FabricObject[]
  ) {
    this.name = `Remove ${objects.length} element${objects.length > 1 ? 's' : ''}`;
  }

  execute(): void {
    // Store objects with their indices before removal
    const objectsOnCanvas = this.canvas.getObjects();
    this.removedObjects = this.objects.map((obj) => {
      const index = objectsOnCanvas.indexOf(obj);
      return { object: obj, canvas: this.canvas, index };
    });

    // Remove all objects
    for (const obj of this.objects) {
      this.canvas.remove(obj);
    }
    this.canvas.requestRenderAll();
  }

  undo(): void {
    // Restore objects in reverse order (to maintain indices)
    for (let i = this.removedObjects.length - 1; i >= 0; i--) {
      const { object, canvas, index } = this.removedObjects[i];
      canvas.insertAt(index, object, false);
    }
    this.canvas.requestRenderAll();
    this.removedObjects = [];
  }

  redo(): void {
    this.execute();
  }
}