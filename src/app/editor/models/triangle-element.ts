// src/app/editor/models/triangle-element.ts
import { Triangle, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface TriangleElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class TriangleElement extends BaseElement {
  declare type: 'triangle';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;

  constructor(data: TriangleElementData) {
    super();
    Object.assign(this, data);
    this.type = 'triangle';
  }

  render(ctx: RenderContext): FabricObject {
    const t = new Triangle({
      left: this.x, top: this.y,
      width: this.width, height: this.height,
      fill: this.fill ?? '#000000',
      stroke: this.stroke || undefined,
      strokeWidth: this.strokeWidth || 0,
      originX: 'left', originY: 'top',
      hasRotatingPoint: true
    });
    ctx.extend(t, this.id);
    return t;
  }

  toJSON(): TriangleElementData {
    return {
      id: this.id, type: 'triangle' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      fill: this.fill, stroke: this.stroke, strokeWidth: this.strokeWidth
    };
  }

  static fromJSON(data: TriangleElementData): TriangleElement { return new TriangleElement(data); }

  static fromFabricObject(obj: any, id: string): TriangleElement {
    return new TriangleElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      fill: obj.fill ?? '#000000',
      stroke: obj.stroke ?? '',
      strokeWidth: obj.strokeWidth ?? 0
    });
  }
}