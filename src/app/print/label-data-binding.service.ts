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
   * 按 FabricImage 框的视觉尺寸（px = width × scaleX, height × scaleY）
   * 生成对应尺寸的 SVG/PNG，保证生成的图比例 = 框比例，
   * 填进 PDF 时不被拉伸。
   */
  private async bindImageObjectAsync(obj: any, data: BindingData, unbound: string[]): Promise<any> {
    const elementType = obj.elementType;

    if (!elementType) return obj;

    // 获取绑定值
    const bindingValue = obj.bindingValue || '';
    const resolvedValue = this.resolveBindingValue(bindingValue, data, unbound);

    // 关键：使用 FabricImage 框的视觉尺寸（width × scaleX, height × scaleY），
    // 而不是 obj.width/height（obj 内部逻辑尺寸，可能因拖动而偏离真实比例）。
    // 用视觉尺寸生成条形码/QR，生成的图比例 = 框比例，填进框时不被拉伸。
    const widthPx = Math.round((obj.width || 100) * (obj.scaleX || 1));
    const heightPx = Math.round((obj.height || 50) * (obj.scaleY || 1));

    if (elementType === 'barcode') {
      const format = obj.barcodeFormat || 'CODE128';
      const showText = obj.showText ?? true;
      const color = obj.foregroundColor || '#000000';

      // 把视觉宽传给 generateBarcodeSVG，用于重写 SVG viewBox 比例
      const dataUrl = generateBarcodeSVG(
        resolvedValue,
        format,
        heightPx,
        showText,
        color,
        widthPx
      );

      return { ...obj, src: dataUrl };
    }

    if (elementType === 'qrcode') {
      if (!resolvedValue) {
        return obj;
      }

      // QR 用视觉尺寸的最大边作为正方形边长
      const size = Math.max(widthPx, heightPx);
      const dataUrl = await generateQRCodeSVG(resolvedValue, size);

      return { ...obj, src: dataUrl };
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
 * 生成条形码 SVG。
 *
 * JsBarcode 输出的 SVG viewBox 宽度由 value 字符数决定（总条宽 + margin），
 * 与目标视觉宽度无关。这里生成后改写 viewBox 让它等于目标尺寸（width × height），
 * 配合 preserveAspectRatio="none" 使条形码按比例绘制，填进 PDF 框时不被拉伸。
 *
 * @param width 视觉宽度（px），用于重写 SVG viewBox
 * @param height 视觉高度（px），传给 JsBarcode 控制条高
 */
function generateBarcodeSVG(
  value: string,
  format: string,
  height: number,
  showText: boolean,
  color: string,
  width?: number
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

    // 重写 viewBox/width/height：让 SVG 坐标系比例 = 视觉尺寸比例，
    // 条形码填进 PDF 框时不被拉伸。
    if (width && width > 0 && height > 0) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('preserveAspectRatio', 'none');
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    return 'data:image/svg+xml;base64,' + btoa(svgString);
  } catch (e) {
    console.error('Barcode SVG generation failed:', e);
    return createPlaceholder(value, 'BC', 80);
  }
}

/**
 * 生成 QR 码（SVG dataURL）。
 *
 * qrcode 库 `toString({type: 'svg'})` 输出的 SVG viewBox 由模块数决定，
 * 与目标视觉尺寸无关。这里生成后改写 viewBox 让它等于目标尺寸，
 * 配合 preserveAspectRatio="none" 让 svg2pdf 按目标尺寸 1:1 渲染，
 * QR 码不被拉伸。
 *
 * @param size 视觉正方形边长（px）
 */
async function generateQRCodeSVG(
  value: string,
  size: number
): Promise<string> {
  if (!value) {
    return createPlaceholder(value, 'QR', size);
  }
  try {
    // 用 toCanvas 生成 PNG dataURL，与编辑器画布 (editor-canvas.service.ts) 路径保持一致。
    // 之前用 toString({type:'svg'}) 会让 viewBox 与 path 坐标系不一致，
    // 出现 QR 码只占 27% 区域的 bug。
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    (QRCode as any).toCanvas(canvas, value, { width: size, margin: 1 });
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
