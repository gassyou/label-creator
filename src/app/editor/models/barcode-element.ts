// src/app/editor/models/barcode-element.ts
import { FabricImage, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';

export interface BarcodeElementData {
  id: string;
  type: 'barcode';
  x: number;
  y: number;
  width: number;
  height: number;
  lock?: boolean;
  format: BarcodeFormat | string;
  value?: string;
  binding?: string;
  showText?: boolean;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
  color?: string;
  [key: string]: unknown;
}

export class BarcodeElement extends BaseElement {
  declare type: 'barcode';
  format!: BarcodeFormat | string;
  value?: string;
  binding?: string;
  showText?: boolean;
  color?: string;

  constructor(data: BarcodeElementData) {
    super();
    Object.assign(this, data);
    this.type = 'barcode';
  }

  async render(ctx: RenderContext): Promise<FabricObject> {
    const dataUrl = (ctx as any).createPlaceholderDataUrl?.('BC', this.width, this.height)
      ?? `data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='${this.width}' height='${this.height}'><rect width='100%' height='100%' fill='#fff'/><text x='50%' y='50%' text-anchor='middle' dy='.3em' font-size='12' fill='#999'>BC</text></svg>`
        )}`;
    const img = await FabricImage.fromURL(dataUrl);
    img.set({
      left: this.x, top: this.y,
      width: this.width, height: this.height,
      scaleX: 1, scaleY: 1,
      originX: 'left', originY: 'top',
      hasRotatingPoint: true
    });
    (img as any).elementType = 'barcode';
    (img as any).bindingValue = this.binding ?? this.value ?? '';
    (img as any).barcodeFormat = this.format;
    (img as any).showText = this.showText ?? true;
    ctx.extendWithBarcodeProperties(img, {
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
      format: this.format, value: this.value, binding: this.binding, showText: this.showText,
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
      format: obj.barcodeFormat ?? 'CODE128',
      value: obj.bindingValue ?? '',
      binding: obj.bindingValue ?? '',
      showText: obj.showText ?? true,
      color: obj.foreground ?? obj.fill
    });
  }
}