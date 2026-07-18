// src/app/editor/models/element-factory.ts
import { BaseElement } from './element-base';
import { TextElement, type TextElementData } from './text-element';
import { RectElement, type RectElementData } from './rect-element';
import { CircleElement, type CircleElementData } from './circle-element';
import { TriangleElement, type TriangleElementData } from './triangle-element';
import { LineElement, type LineElementData } from './line-element';
import { QRCodeElement, type QRCodeElementData } from './qrcode-element';
import { BarcodeElement, type BarcodeElementData } from './barcode-element';
import { ImageElement, type ImageElementData } from './image-element';

export const ElementFactory = {
  fromJSON(data: Record<string, unknown>): BaseElement {
    const t = data['type'] as string;
    switch (t) {
      case 'text':    return TextElement.fromJSON(data as TextElementData);
      case 'rect':    return RectElement.fromJSON(data as RectElementData);
      case 'circle':  return CircleElement.fromJSON(data as CircleElementData);
      case 'triangle':return TriangleElement.fromJSON(data as TriangleElementData);
      case 'line':    return LineElement.fromJSON(data as LineElementData);
      case 'qrcode':  return QRCodeElement.fromJSON(data as QRCodeElementData);
      case 'barcode': return BarcodeElement.fromJSON(data as BarcodeElementData);
      case 'image':   return ImageElement.fromJSON(data as ImageElementData);
      default: throw new Error(`Unknown element type: ${t}`);
    }
  },
  fromFabricObject(obj: any, id: string): BaseElement {
    const t = obj.elementType as string;
    switch (t) {
      case 'text':    return TextElement.fromFabricObject(obj, id);
      case 'shape':
      case 'rect':    return RectElement.fromFabricObject(obj, id);
      case 'circle':  return CircleElement.fromFabricObject(obj, id);
      case 'triangle':return TriangleElement.fromFabricObject(obj, id);
      case 'line':    return LineElement.fromFabricObject(obj, id);
      case 'qrcode':  return QRCodeElement.fromFabricObject(obj, id);
      case 'barcode': return BarcodeElement.fromFabricObject(obj, id);
      case 'image':   return ImageElement.fromFabricObject(obj, id);
      default: throw new Error(`Unknown element type on Fabric object: ${t}`);
    }
  }
};