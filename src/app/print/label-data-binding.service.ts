import { Injectable } from '@angular/core';
import { Label } from '../editor/models/label.models';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

/**
 * 业务数据（键值对）
 */
export type BindingData = Record<string, string | number>;

/**
 * 标签数据绑定结果
 */
export interface BindingResult {
  /**
   * 绑定后的标签副本
   */
  label: Label;
  /**
   * 未匹配到数据字段的占位符列表
   */
  unboundPlaceholders: string[];
}

/**
 * 标签数据绑定服务
 * 将 Label 中 canvasJson 的 ${} 占位符替换为业务数据
 * 将 barcode/qrcode 元素替换为实际生成的图片
 */
@Injectable({ providedIn: 'root' })
export class LabelDataBindingService {
  /**
   * 执行数据绑定
   * @param label 标签模板
   * @param data 业务数据键值对
   */
  async bind(label: Label, data: BindingData): Promise<BindingResult> {
    if (!label.canvasJson) {
      return { label, unboundPlaceholders: [] };
    }

    const unbound: string[] = [];
    let parsed: any;

    try {
      parsed = JSON.parse(label.canvasJson);
    } catch {
      console.error('Failed to parse canvasJson');
      return { label, unboundPlaceholders: [] };
    }

    const objects = parsed.objects || [];
    const updatedObjects: any[] = [];

    for (const obj of objects) {
      // 文本元素：替换 ${...} 占位符
      if (obj.type === 'text' || obj.type === 'Textbox') {
        updatedObjects.push(this.bindTextObject(obj, data, unbound));
      }
      // 图片元素（barcode / qrcode）：替换为生成的图片
      else if (obj.type?.toLowerCase() === 'image' && obj.elementType) {
        const bound = await this.bindImageObjectAsync(obj, data, unbound);
        updatedObjects.push(bound);
      }
      else {
        updatedObjects.push(obj);
      }
    }

    parsed.objects = updatedObjects;
    const boundCanvasJson = JSON.stringify(parsed);

    const boundLabel: Label = {
      ...label,
      canvasJson: boundCanvasJson
    };

    return { label: boundLabel, unboundPlaceholders: unbound };
  }

  /**
   * 绑定文本对象中的 ${} 占位符
   */
  private bindTextObject(obj: any, data: BindingData, unbound: string[]): any {
    const text = obj.text || '';
    const bound = text.replace(/\$\{([^}]+)\}/g, (match: string, key: string) => {
      const trimmedKey = key.trim();
      if (trimmedKey in data) {
        return String(data[trimmedKey]);
      }
      if (!unbound.includes(trimmedKey)) {
        unbound.push(trimmedKey);
      }
      return match;
    });
    return { ...obj, text: bound };
  }

  /**
   * 绑定图片对象（barcode / qrcode）
   * 根据元素的宽高（mm）生成对应尺寸的 SVG/条形码
   */
  private async bindImageObjectAsync(obj: any, data: BindingData, unbound: string[]): Promise<any> {
    const elementType = obj.elementType;

    if (!elementType) return obj;

    // 获取绑定值
    const bindingValue = obj.bindingValue || '';
    const resolvedValue = this.resolveBindingValue(bindingValue, data, unbound);

    // Canvas JSON 中的 width/height 是像素值，不需要转换
    // 直接使用像素值来生成对应大小的图片
    const widthPx = obj.width || 100;
    const heightPx = obj.height || 50;

    if (elementType === 'barcode') {
      const format = obj.barcodeFormat || 'CODE128';
      const showText = obj.showText ?? true;
      const color = obj.foregroundColor || '#000000';

      const dataUrl = generateBarcodeSVG(
        resolvedValue,
        format,
        heightPx,
        showText,
        color
      );

      return { ...obj, src: dataUrl };
    }

    if (elementType === 'qrcode') {
      if (!resolvedValue) {
        return obj;
      }

      const size = Math.min(widthPx, heightPx);
      const dataUrl = await generateQRCodeSVG(resolvedValue, size);

      return { ...obj, src: dataUrl, scaleX: 1, scaleY: 1 };
    }

    return obj;
  }

  /**
   * 解析绑定值中的 ${...} 占位符
   */
  private resolveBindingValue(
    bindingValue: string,
    data: BindingData,
    unbound: string[]
  ): string {
    if (!bindingValue) return '';

    const resolved = bindingValue.replace(/\$\{([^}]+)\}/g, (match: string, key: string) => {
      const trimmedKey = key.trim();
      if (trimmedKey in data) {
        return String(data[trimmedKey]);
      }
      if (!unbound.includes(trimmedKey)) {
        unbound.push(trimmedKey);
      }
      return match;
    });

    return resolved;
  }
}

/**
 * 生成带颜色的自定义条形码（SVG）
 */
function generateBarcodeSVG(
  value: string,
  format: string,
  height: number,
  showText: boolean,
  color: string
): string {
  if (!value) {
    return createPlaceholder(value, 'BC', 80);
  }
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    (JsBarcode as any)(svg, value, {
      format: format,
      width: 1,
      height: height,
      displayValue: showText,
      fontColor: color,
      margin: 2
    });
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    return 'data:image/svg+xml;base64,' + btoa(svgString);
  } catch (e) {
    console.error('Barcode SVG generation failed:', e);
    return createPlaceholder(value, 'BC', 80);
  }
}

/**
 * 生成 QR 码（SVG base64）
 */
async function generateQRCodeSVG(
  value: string,
  size: number
): Promise<string> {
  if (!value) {
    return createPlaceholder(value, 'QR', size);
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    await (QRCode as any).toCanvas(canvas, value, {
      width: size,
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' }
    });
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('QR code generation failed:', e);
    return createPlaceholder(value, 'QR', size);
  }
}

/**
 * 生成占位图片
 */
function createPlaceholder(text: string, type: string, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(size, 80);
  canvas.height = Math.max(Math.round(size * 0.5), 40);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(type + ': ' + text.substring(0, 10), canvas.width / 2, canvas.height / 2 + 4);
  }
  return canvas.toDataURL('image/png');
}
