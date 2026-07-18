// src/app/editor/models/image-element.ts
import { FabricImage, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface ImageElementData {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  lock?: boolean;
  src?: string;
  binding?: string;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
  [key: string]: unknown;
}

export class ImageElement extends BaseElement {
  declare type: 'image';
  src?: string;
  binding?: string;

  constructor(data: ImageElementData) {
    super();
    Object.assign(this, data);
    this.type = 'image';
    this.width ??= 220;
    this.height ??= 220;
  }

  async render(ctx: RenderContext): Promise<FabricObject> {
    const src = this.src ?? '';
    const img = await FabricImage.fromURL(src);
    img.set({
      left: this.x, top: this.y,
      originX: 'left', originY: 'top',
      padding: 10, cornerSize: 10,
      hasRotatingPoint: true, angle: this.rotation ?? 0
    });
    if (this.width) img.scaleToWidth(this.width);
    if (this.height) img.scaleToHeight(this.height);
    ctx.extend(img, this.id);
    return img as unknown as FabricObject;
  }

  toJSON(): ImageElementData {
    return {
      id: this.id, type: 'image' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      src: this.src, binding: this.binding
    };
  }

  static fromJSON(data: ImageElementData): ImageElement { return new ImageElement(data); }

  static fromFabricObject(obj: any, id: string): ImageElement {
    return new ImageElement({
      id,
      type: 'image',
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      src: obj.getSrc?.() ?? obj._element?.src ?? ''
    });
  }
}