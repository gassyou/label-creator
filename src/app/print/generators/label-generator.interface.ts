import { Label } from '../../editor/models/label.models';

/**
 * 标签生成器接口
 * 统一抽象不同格式的标签生成逻辑
 */
export interface LabelGenerator {
  /**
   * 生成器名称
   */
  readonly name: string;

  /**
   * 生成标签
   * @param labels 标签数组
   * @param options 生成选项
   */
  generate(labels: Label[], options?: GenerateOptions): Promise<Blob | string>;

  /**
   * 生成单个标签
   * @param label 标签数据
   * @param options 生成选项
   */
  generateSingle(label: Label, options?: GenerateOptions): Promise<Blob | string>;
}

/**
 * 生成选项
 */
export interface GenerateOptions {
  /**
   * 输出文件名（不含扩展名）
   */
  fileName?: string;

  /**
   * 缩放比例，默认 2
   */
  multiplier?: number;
}

/**
 * PDF 生成选项
 */
export interface PdfGenerateOptions extends GenerateOptions {
  /**
   * 页面方向：portrait | landscape | 'auto'
   * auto 根据标签尺寸自动判断
   */
  orientation?: 'portrait' | 'landscape' | 'auto';
}

/**
 * PNG 生成选项
 */
export interface PngGenerateOptions extends GenerateOptions {
  /**
   * 是否返回 base64 字符串，默认 false（返回 Blob）
   */
  asDataUrl?: boolean;

  /**
   * 是否生成缩略图模式
   * 为 true 时，图片会等比缩放到 maxDimension 限制的尺寸内，保证文件小且有一定质量
   */
  thumbnail?: boolean;

  /**
   * 缩略图最大尺寸，默认 200
   */
  thumbnailMaxDimension?: number;
}

/**
 * SVG 生成选项
 */
export interface SvgGenerateOptions extends GenerateOptions {
  /**
   * 是否返回字符串，默认 false（返回 Blob）
   */
  asString?: boolean;
}

/**
 * 生成器类型
 */
export type GeneratorType = 'pdf' | 'png' | 'svg';
