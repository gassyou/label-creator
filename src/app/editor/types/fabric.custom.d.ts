import { FabricObject, FabricImage, IText, Rect, Circle, Triangle, Line } from 'fabric';

/**
 * Fabric.js 自定义类型扩展
 * 解决 barcode/qrcode 等元素使用 as any 的问题
 */

declare module 'fabric' {
  /**
   * 所有 Fabric 对象的基础扩展
   */
  interface FabricObject {
    /** 元素 ID */
    id?: string;
  }

  /**
   * 文本对象扩展
   */
  interface IText {
    id?: string;
  }

  /**
   * 矩形扩展
   */
  interface Rect {
    id?: string;
  }

  /**
   * 圆形扩展
   */
  interface Circle {
    id?: string;
  }

  /**
   * 三角形扩展
   */
  interface Triangle {
    id?: string;
  }

  /**
   * 线条扩展
   */
  interface Line {
    id?: string;
  }

  /**
   * 图片扩展（用于 barcode/qrcode/image）
   */
  interface FabricImage {
    /** 元素类型：barcode, qrcode, image */
    elementType?: string;

    /** 数据绑定表达式，如 ${fieldName} */
    bindingValue?: string;

    /** 条码格式：CODE128, EAN13, CODE39 等 */
    barcodeFormat?: string;

    /** 是否显示文本 */
    showText?: boolean;

    /** 错误纠正级别：L, M, Q, H */
    errorCorrectionLevel?: string;

    /** 前景色 */
    foregroundColor?: string;

    /** 背景色 */
    backgroundColor?: string;
  }
}