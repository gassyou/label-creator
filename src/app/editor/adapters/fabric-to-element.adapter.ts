import { FabricObject, FabricImage, IText, Rect, Circle, Triangle, Line } from 'fabric';
import { ElementAdapter, AdapterRegistry } from './element-adapter.interface';
import {
  ElementType,
  LabelElement,
  TextElement,
  RectElement,
  CircleElement,
  TriangleElement,
  LineElement,
  BarcodeElement,
  QRCodeElement,
  ImageElement
} from '../models/editor.models';

/**
 * 获取元素的公共属性
 */
function getBaseProperties(fabricObject: FabricObject) {
  return {
    id: fabricObject.id || '',
    x: fabricObject.left ?? 0,
    y: fabricObject.top ?? 0,
    width: (fabricObject.width ?? 100) * (fabricObject.scaleX ?? 1),
    height: (fabricObject.height ?? 100) * (fabricObject.scaleY ?? 1),
    rotation: fabricObject.angle ?? 0,
    visible: fabricObject.visible ?? true,
    lock: fabricObject.lockMovementX && fabricObject.lockMovementY,
    opacity: (fabricObject.opacity ?? 1) * 100,
    zIndex: 0
  };
}

// ============== Text Adapter ==============
export class TextAdapter implements ElementAdapter<TextElement> {
  readonly elementType: ElementType = 'text';

  toElement(fabricObject: FabricObject): TextElement {
    const text = fabricObject as IText;
    return {
      ...getBaseProperties(fabricObject),
      type: 'text',
      text: text.text ?? '',
      fontSize: text.fontSize ?? 16,
      fontFamily: text.fontFamily ?? 'Arial',
      fontWeight: text.fontWeight as string ?? '',
      fontStyle: text.fontStyle as string | undefined,
      textAlign: text.textAlign as string | undefined,
      textDecoration: '',
      lineHeight: text.lineHeight,
      charSpacing: text.charSpacing,
      color: String(text.fill ?? '#000000'),
      fill: String(text.fill ?? '#000000')
    };
  }

  toFabric(element: TextElement): IText {
    const text = new IText(element.text ?? 'Text', {
      left: element.x,
      top: element.y,
      fontSize: element.fontSize,
      fontFamily: element.fontFamily,
      fontWeight: element.fontWeight || undefined,
      fontStyle: (element.fontStyle || undefined) as any,
      textAlign: (element.textAlign || 'left') as any,
      lineHeight: element.lineHeight,
      charSpacing: element.charSpacing,
      fill: element.color || element.fill || '#000000'
    });

    text.id = element.id;
    text.scaleX = element.width / (text.width || 100);
    text.scaleY = element.height / (text.height || 50);
    text.angle = element.rotation ?? 0;
    text.opacity = (element.opacity ?? 100) / 100;
    text.visible = element.visible ?? true;

    return text as any;
  }

  matches(fabricObject: FabricObject): boolean {
    return fabricObject.type === 'i-text' || fabricObject.type === 'textbox';
  }
}

// ============== Rect Adapter ==============
export class RectAdapter implements ElementAdapter<RectElement> {
  readonly elementType: ElementType = 'rect';

  toElement(fabricObject: FabricObject): RectElement {
    return {
      ...getBaseProperties(fabricObject),
      type: 'rect',
      fill: String(fabricObject.fill ?? ''),
      stroke: String(fabricObject.stroke ?? ''),
      strokeWidth: fabricObject.strokeWidth ?? 0,
      radius: (fabricObject as Rect).rx ?? 0
    };
  }

  toFabric(element: RectElement): Rect {
    const rect = new Rect({
      left: element.x,
      top: element.y,
      width: element.width,
      height: element.height,
      fill: element.fill || undefined,
      stroke: element.stroke || undefined,
      strokeWidth: element.strokeWidth ?? 0,
      rx: element.radius ?? 0,
      ry: element.radius ?? 0
    });

    rect.id = element.id;
    rect.angle = element.rotation ?? 0;
    rect.opacity = (element.opacity ?? 100) / 100;
    rect.visible = element.visible ?? true;

    return rect;
  }

  matches(fabricObject: FabricObject): boolean {
    return fabricObject.type === 'rect';
  }
}

// ============== Circle Adapter ==============
export class CircleAdapter implements ElementAdapter<CircleElement> {
  readonly elementType: ElementType = 'circle';

  toElement(fabricObject: FabricObject): CircleElement {
    return {
      ...getBaseProperties(fabricObject),
      type: 'circle',
      fill: String(fabricObject.fill ?? ''),
      stroke: String(fabricObject.stroke ?? ''),
      strokeWidth: fabricObject.strokeWidth ?? 0
    };
  }

  toFabric(element: CircleElement): Circle {
    const circle = new Circle({
      left: element.x,
      top: element.y,
      radius: Math.min(element.width, element.height) / 2,
      fill: element.fill || undefined,
      stroke: element.stroke || undefined,
      strokeWidth: element.strokeWidth ?? 0
    });

    circle.id = element.id;
    circle.angle = element.rotation ?? 0;
    circle.opacity = (element.opacity ?? 100) / 100;
    circle.visible = element.visible ?? true;

    return circle;
  }

  matches(fabricObject: FabricObject): boolean {
    return fabricObject.type === 'circle';
  }
}

// ============== Triangle Adapter ==============
export class TriangleAdapter implements ElementAdapter<TriangleElement> {
  readonly elementType: ElementType = 'triangle';

  toElement(fabricObject: FabricObject): TriangleElement {
    return {
      ...getBaseProperties(fabricObject),
      type: 'triangle',
      fill: String(fabricObject.fill ?? ''),
      stroke: String(fabricObject.stroke ?? ''),
      strokeWidth: fabricObject.strokeWidth ?? 0
    };
  }

  toFabric(element: TriangleElement): Triangle {
    const triangle = new Triangle({
      left: element.x,
      top: element.y,
      width: element.width,
      height: element.height,
      fill: element.fill || undefined,
      stroke: element.stroke || undefined,
      strokeWidth: element.strokeWidth ?? 0
    });

    triangle.id = element.id;
    triangle.angle = element.rotation ?? 0;
    triangle.opacity = (element.opacity ?? 100) / 100;
    triangle.visible = element.visible ?? true;

    return triangle;
  }

  matches(fabricObject: FabricObject): boolean {
    return fabricObject.type === 'triangle';
  }
}

// ============== Line Adapter ==============
export class LineAdapter implements ElementAdapter<LineElement> {
  readonly elementType: ElementType = 'line';

  toElement(fabricObject: FabricObject): LineElement {
    return {
      ...getBaseProperties(fabricObject),
      type: 'line',
      stroke: String(fabricObject.stroke ?? '#000000'),
      strokeWidth: fabricObject.strokeWidth ?? 1
    };
  }

  toFabric(element: LineElement): Line {
    const line = new Line(
      [element.x, element.y, element.x + element.width, element.y],
      {
        stroke: element.stroke,
        strokeWidth: element.strokeWidth ?? 1
      }
    );

    line.id = element.id;
    line.angle = element.rotation ?? 0;
    line.opacity = (element.opacity ?? 100) / 100;
    line.visible = element.visible ?? true;

    return line;
  }

  matches(fabricObject: FabricObject): boolean {
    return fabricObject.type === 'line';
  }
}

// ============== Barcode Adapter ==============
export class BarcodeAdapter implements ElementAdapter<BarcodeElement> {
  readonly elementType: ElementType = 'barcode';

  toElement(fabricObject: FabricObject): BarcodeElement {
    const img = fabricObject as FabricImage;
    return {
      ...getBaseProperties(fabricObject),
      type: 'barcode',
      format: img.barcodeFormat ?? 'CODE128',
      value: img.bindingValue ?? '',
      binding: img.bindingValue ?? '',
      showText: img.showText ?? true,
      color: img.foregroundColor ?? '#000000'
    };
  }

  async toFabric(element: BarcodeElement): Promise<FabricObject> {
    const { generateBarcode } = await import('../../print/barcode-generator');
    const dataUrl = generateBarcode(element.value || '${barcode}', element.format, 80);
    const img = await FabricImage.fromURL(dataUrl);

    img.set({
      left: element.x,
      top: element.y,
      scaleX: element.width / (img.width || 100),
      scaleY: element.height / (img.height || 80)
    });

    img.id = element.id;
    img.elementType = 'barcode';
    img.barcodeFormat = element.format;
    img.bindingValue = element.value;
    img.showText = element.showText;
    img.foregroundColor = element.color ?? '#000000';
    img.angle = element.rotation ?? 0;
    img.opacity = (element.opacity ?? 100) / 100;
    img.visible = element.visible ?? true;

    return img as any;
  }

  matches(fabricObject: FabricObject): boolean {
    return fabricObject.type === 'image' && (fabricObject as FabricImage).elementType === 'barcode';
  }
}

// ============== QRCode Adapter ==============
export class QRCodeAdapter implements ElementAdapter<QRCodeElement> {
  readonly elementType: ElementType = 'qrcode';

  toElement(fabricObject: FabricObject): QRCodeElement {
    const img = fabricObject as FabricImage;
    return {
      ...getBaseProperties(fabricObject),
      type: 'qrcode',
      value: img.bindingValue ?? '',
      binding: img.bindingValue ?? '',
      errorCorrectionLevel: (img.errorCorrectionLevel as QRCodeElement['errorCorrectionLevel']) ?? 'M',
      foregroundColor: img.foregroundColor ?? '#000000',
      backgroundColor: img.backgroundColor ?? '#ffffff'
    };
  }

  async toFabric(element: QRCodeElement): Promise<FabricObject> {
    const { generateQRCode } = await import('../../print/barcode-generator');
    const dataUrl = generateQRCode(element.value || '${qrcode}', 100);
    const img = await FabricImage.fromURL(dataUrl);

    img.set({
      left: element.x,
      top: element.y,
      scaleX: element.width / (img.width || 100),
      scaleY: element.height / (img.height || 100)
    });

    img.id = element.id;
    img.elementType = 'qrcode';
    img.bindingValue = element.value;
    img.errorCorrectionLevel = element.errorCorrectionLevel;
    img.foregroundColor = element.foregroundColor ?? '#000000';
    img.backgroundColor = element.backgroundColor ?? '#ffffff';
    img.angle = element.rotation ?? 0;
    img.opacity = (element.opacity ?? 100) / 100;
    img.visible = element.visible ?? true;

    return img as any;
  }

  matches(fabricObject: FabricObject): boolean {
    return fabricObject.type === 'image' && (fabricObject as FabricImage).elementType === 'qrcode';
  }
}

// ============== Image Adapter ==============
export class ImageAdapter implements ElementAdapter<ImageElement> {
  readonly elementType: ElementType = 'image';

  toElement(fabricObject: FabricObject): ImageElement {
    const img = fabricObject as FabricImage;
    return {
      ...getBaseProperties(fabricObject),
      type: 'image',
      src: img.getSrc ? img.getSrc() : '',
      binding: img.bindingValue ?? ''
    };
  }

  async toFabric(element: ImageElement): Promise<FabricObject> {
    const img = await FabricImage.fromURL(element.src || '');

    img.set({
      left: element.x,
      top: element.y,
      scaleX: element.width / (img.width || 100),
      scaleY: element.height / (img.height || 100)
    });

    img.id = element.id;
    img.elementType = 'image';
    img.bindingValue = element.binding;
    img.angle = element.rotation ?? 0;
    img.opacity = (element.opacity ?? 100) / 100;
    img.visible = element.visible ?? true;

    return img as any;
  }

  matches(fabricObject: FabricObject): boolean {
    return fabricObject.type === 'image' && !(fabricObject as FabricImage).elementType;
  }
}

/**
 * 创建默认的适配器注册表
 */
export function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(new TextAdapter());
  registry.register(new RectAdapter());
  registry.register(new CircleAdapter());
  registry.register(new TriangleAdapter());
  registry.register(new LineAdapter());
  registry.register(new BarcodeAdapter());
  registry.register(new QRCodeAdapter());
  registry.register(new ImageAdapter());
  return registry;
}