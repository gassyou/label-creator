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

      // QR dataURL 的 width 必须等于 obj.width（不是 obj.width × scaleX），
      // fabric 渲染 image 元素时用 element.naturalWidth × obj.scaleX 计算视觉宽度。
      // 如果 size 用 widthPx (= obj.width × scaleX)，fabric 会把 QR 渲染成
      //   naturalWidth × scaleX = obj.width × scaleX × scaleX，
      // 比用户设计意图大 scaleX 倍，超出画布被裁。
      const size = Math.min(obj.width || 100, obj.height || 50);
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
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('preserveAspectRatio', 'none');
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    return 'data:image/svg+xml;base64,' + btoa(svgString);
  } catch (e) {
    console.error('Barcode SVG generation failed:', e);
    throw e;
  }
}

/**
 * 生成 QR 码（SVG dataURL）。
 *
 * 注意：不能用 qrcode 库的 `toString({ type: 'svg' })`，因为它硬编码用
 * `stroke` 渲染模块（每个黑色模块只画一条水平线、靠 stroke 视觉错觉呈现方块）。
 * 浏览器渲染时 stroke 正常 → 看到完整二维码，但 svg2pdf / pdfkit-svg
 * 在处理内嵌 SVG 时对 path stroke 渲染不可靠，stroke 会丢失，
 * 结果 PDF 里的二维码只剩一排排水平短线。
 *
 * 这里改用 `QRCode.create()` 拿到模块数组，自己用 `<rect fill>` 画每个黑色模块：
 * - 填充用 fill，svg2pdf 完整支持。
 * - viewBox 用 0 0 size size，宽高也是 size，坐标系一致，
 *   svg2pdf 直接 1:1 渲染，不会缩放错位。
 *
 * @param size 视觉正方形边长（px），同时作为 viewBox 与 width/height 单位。
 */
async function generateQRCodeSVG(
  value: string,
  size: number
): Promise<string> {
  try {
    const qr = (QRCode as any).create(value, { errorCorrectionLevel: 'M' });
    const moduleSize = qr.modules.size as number;
    const data: ArrayLike<number> = qr.modules.data;
    const margin = 1; // 与原 qrcode 库 margin: 1 行为一致
    const total = moduleSize + margin * 2;
    // viewBox 单位 = 像素（让 svg2pdf 不需要做 viewBox 缩放）
    const cellPx = size / total;

    const rects: string[] = [];
    // 背景：白色矩形铺满（与 qrcode 库输出一致）
    rects.push(`<rect x="0" y="0" width="${size}" height="${size}" fill="#ffffff"/>`);

    for (let row = 0; row < moduleSize; row++) {
      for (let col = 0; col < moduleSize; col++) {
        if (data[row * moduleSize + col]) {
          const x = (col + margin) * cellPx;
          const y = (row + margin) * cellPx;
          rects.push(
            `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${cellPx.toFixed(3)}" height="${cellPx.toFixed(3)}" fill="#000000"/>`
          );
        }
      }
    }

    const svgString =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
      `viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
      rects.join('') +
      `</svg>`;

    return 'data:image/svg+xml;base64,' + btoa(svgString);
  } catch (e) {
    console.error('QR code generation failed:', e);
    throw e;
  }
}
