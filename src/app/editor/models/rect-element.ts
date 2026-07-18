// src/app/editor/models/rect-element.ts
import { Rect, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface RectElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class RectElement extends BaseElement {
  declare type: 'rect';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;

  constructor(data: RectElementData) {
    super();
    Object.assign(this, data);
    this.type = 'rect';
  }

  render(ctx: RenderContext): FabricObject {
    const rect = new Rect({
      left: this.x,
      top: this.y,
      width: this.width,
      height: this.height,
      fill: this.fill ?? '#000000',
      stroke: this.stroke || undefined,
      strokeWidth: this.strokeWidth || 0,
      rx: this.radius ?? 0,
      ry: this.radius ?? 0,
      originX: 'left',
      originY: 'top',
      hasRotatingPoint: true
    });
    ctx.extend(rect, this.id);
    return rect;
  }

  toJSON(): RectElementData {
    return {
      id: this.id, type: 'rect' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      fill: this.fill, stroke: this.stroke, strokeWidth: this.strokeWidth, radius: this.radius
    };
  }

  static fromJSON(data: RectElementData): RectElement { return new RectElement(data); }

  static fromFabricObject(obj: any, id: string): RectElement {
    return new RectElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      fill: obj.fill ?? '#000000',
      stroke: obj.stroke ?? '',
      strokeWidth: obj.strokeWidth ?? 0,
      radius: obj.rx ?? 0
    });
  }
}