// src/app/editor/models/circle-element.ts
import { Circle, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface CircleElementData {
  id: string;
  type: 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  lock?: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
  [key: string]: unknown;
}

export class CircleElement extends BaseElement {
  declare type: 'circle';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;

  constructor(data: CircleElementData) {
    super();
    Object.assign(this, data);
    this.type = 'circle';
  }

  render(ctx: RenderContext): FabricObject {
    const radius = Math.max(this.width, this.height) / 2;
    const c = new Circle({
      left: this.x,
      top: this.y,
      radius,
      fill: this.fill ?? '#000000',
      stroke: this.stroke || undefined,
      strokeWidth: this.strokeWidth || 0,
      originX: 'left',
      originY: 'top',
      hasRotatingPoint: true
    });
    ctx.extend(c, this.id);
    return c;
  }

  toJSON(): CircleElementData {
    return {
      id: this.id, type: 'circle' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      fill: this.fill, stroke: this.stroke, strokeWidth: this.strokeWidth
    };
  }

  static fromJSON(data: CircleElementData): CircleElement { return new CircleElement(data); }

  static fromFabricObject(obj: any, id: string): CircleElement {
    return new CircleElement({
      id,
      type: 'circle',
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