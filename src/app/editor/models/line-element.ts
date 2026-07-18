// src/app/editor/models/line-element.ts
import { Line, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface LineElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class LineElement extends BaseElement {
  declare type: 'line';
  stroke!: string;
  strokeWidth!: number;

  constructor(data: LineElementData) {
    super();
    Object.assign(this, data);
    this.type = 'line';
  }

  render(ctx: RenderContext): FabricObject {
    const line = new Line([this.x, this.y, this.x + this.width, this.y + this.height], {
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      originX: 'left', originY: 'top',
      hasRotatingPoint: true
    });
    ctx.extend(line, this.id);
    return line;
  }

  toJSON(): LineElementData {
    return {
      id: this.id, type: 'line' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      stroke: this.stroke, strokeWidth: this.strokeWidth
    };
  }

  static fromJSON(data: LineElementData): LineElement { return new LineElement(data); }

  static fromFabricObject(obj: any, id: string): LineElement {
    return new LineElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: ((obj.x2 ?? 0) - (obj.x1 ?? 0)) || obj.width || 100,
      height: ((obj.y2 ?? 0) - (obj.y1 ?? 0)) || obj.height || 0,
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      stroke: obj.stroke ?? '#000000',
      strokeWidth: obj.strokeWidth ?? 1
    });
  }
}