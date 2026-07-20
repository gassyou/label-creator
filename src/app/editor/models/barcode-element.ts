// src/app/editor/models/barcode-element.ts
import { FabricImage, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';
import { buildPlaceholderDataUrl } from './placeholder-svg';

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'CODE39';

export interface BarcodeElementData {
  id: string;
  type: 'barcode';
  x: number;
  y: number;
  width: number;
  height: number;
  lock?: boolean;
  barcodeFormat?: BarcodeFormat | string;
  bindingValue?: string;
  showText?: boolean;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
  color?: string;
  [key: string]: unknown;
}

export class BarcodeElement extends BaseElement {
  declare type: 'barcode';
  barcodeFormat?: BarcodeFormat | string;
  value?: string;
  bindingValue?: string;
  showText?: boolean;
  color?: string;

  constructor(data: BarcodeElementData) {
    super();
    Object.assign(this, data);
    this.type = 'barcode';
  }

  async render(ctx: RenderContext): Promise<FabricObject> {
    const dataUrl = buildPlaceholderDataUrl('BC', this.width, this.height);
    const img = await FabricImage.fromURL(dataUrl);

    // Fabric 默认会保持原图宽高比。让 placeholder 永远填满整个框（允许拉伸）。
    img.set({
      left: this.x, top: this.y,
      originX: 'left', originY: 'top',
      hasRotatingPoint: true
    });
    img.scaleToWidth(this.width);
    img.scaleToHeight(this.height);
    (img as any).elementType = 'barcode';
    (img as any).bindingValue = this.bindingValue ?? '';
    (img as any).barcodeFormat = this.barcodeFormat;
    (img as any).showText = this.showText ?? true;
    ctx.extendWithCustomProperties(img, {
      elementType: 'barcode',
      bindingValue: (img as any).bindingValue,
      barcodeFormat: (img as any).barcodeFormat,
      showText: (img as any).showText
    });
    ctx.extend(img, this.id);
    return img as unknown as FabricObject;
  }

  toJSON(): BarcodeElementData {
    return {
      id: this.id, type: 'barcode' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      barcodeFormat: this.barcodeFormat, bindingValue: this.bindingValue, showText: this.showText,
      color: this.color
    };
  }

  static fromJSON(data: BarcodeElementData): BarcodeElement { return new BarcodeElement(data); }

  static fromFabricObject(obj: any, id: string): BarcodeElement {
    return new BarcodeElement({
      id,
      type: 'barcode',
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      barcodeFormat: obj.barcodeFormat ?? 'CODE128',
      bindingValue: obj.bindingValue ?? '',
      showText: obj.showText ?? true,
      color: obj.foreground ?? obj.fill
    });
  }
}
