// src/app/editor/models/qrcode-element.ts
import { FabricImage, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';
import { buildPlaceholderDataUrl } from './placeholder-svg';

export interface QRCodeElementData {
  id: string;
  type: 'qrcode';
  x: number;
  y: number;
  width: number;
  height: number;
  lock?: boolean;
  bindingValue?: string;
  errorCorrectionLevel?: string;
  foregroundColor?: string;
  backgroundColor?: string;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
  [key: string]: unknown;
}

export class QRCodeElement extends BaseElement {
  declare type: 'qrcode';
  bindingValue?: string;
  errorCorrectionLevel?: string;
  foregroundColor?: string;
  backgroundColor?: string;

  constructor(data: QRCodeElementData) {
    super();
    Object.assign(this, data);
    this.type = 'qrcode';
  }

  async render(ctx: RenderContext): Promise<FabricObject> {
    const dataUrl = buildPlaceholderDataUrl('QR', this.width, this.height);
    const img = await FabricImage.fromURL(dataUrl);

    // Fabric 默认会保持原图宽高比。让 placeholder 永远填满整个框（允许拉伸）。
    img.set({
      left: this.x, top: this.y,
      originX: 'left', originY: 'top',
      hasRotatingPoint: true
    });
    img.scaleToWidth(this.width);
    img.scaleToHeight(this.height);
    (img as any).elementType = 'qrcode';
    (img as any).bindingValue = this.bindingValue ?? '';
    (img as any).errorCorrectionLevel = this.errorCorrectionLevel ?? 'M';
    (img as any).foregroundColor = this.foregroundColor ?? '#000000';
    (img as any).backgroundColor = this.backgroundColor ?? '#ffffff';
    ctx.extendWithCustomProperties(img, {
      elementType: 'qrcode',
      bindingValue: (img as any).bindingValue,
      errorCorrectionLevel: (img as any).errorCorrectionLevel,
      foregroundColor: (img as any).foregroundColor,
      backgroundColor: (img as any).backgroundColor
    });
    ctx.extend(img, this.id);
    return img as unknown as FabricObject;
  }

  toJSON(): QRCodeElementData {
    return {
      id: this.id, type: 'qrcode' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      bindingValue: this.bindingValue,
      errorCorrectionLevel: this.errorCorrectionLevel,
      foregroundColor: this.foregroundColor,
      backgroundColor: this.backgroundColor
    };
  }

  static fromJSON(data: QRCodeElementData): QRCodeElement { return new QRCodeElement(data); }

  static fromFabricObject(obj: any, id: string): QRCodeElement {
    return new QRCodeElement({
      id,
      type: 'qrcode',
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      bindingValue: obj.bindingValue ?? '',
      errorCorrectionLevel: obj.errorCorrectionLevel ?? 'M',
      foregroundColor: obj.foregroundColor ?? '#000000',
      backgroundColor: obj.backgroundColor ?? '#ffffff'
    });
  }
}
