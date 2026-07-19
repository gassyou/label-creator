/**
 * 打印设置
 */
export interface PrintSetting {
  paperSize: 'A4' | 'A5' | 'letter' | 'custom';
  orientation: 'portrait' | 'landscape';
  customPaperWidth?: number;   // 当 paperSize 为 'custom' 时使用
  customPaperHeight?: number;
  marginTop: number;           // 页边距 mm，默认 0
  marginBottom: number;         // 页边距 mm，默认 0
  marginLeft: number;          // 页边距 mm，默认 0
  marginRight: number;         // 页边距 mm，默认 0
  gapX: number;                // 行内标签间距 mm，默认 0
  gapY: number;                // 列间标签间距 mm，默认 0
}

/**
 * 默认打印设置
 */
export const DEFAULT_PRINT_SETTING: PrintSetting = {
  paperSize: 'A4',
  orientation: 'portrait',
  customPaperWidth: 210,
  customPaperHeight: 297,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
  gapX: 0,
  gapY: 0
};

/**
 * 标签数据
 * 用于存储和生成 PDF，尺寸单位为毫米
 */
export interface Label {
  id: string;
  width: number;               // 标签宽度 mm
  height: number;              // 标签高度 mm
  backgroundColor: string;
  backgroundImage?: string;
  canvasJson: string;          // Fabric.js 画布数据
}


/**
 * 标签模板
 */
export interface LabelTemplate {
  id?: string;
  name: string;
  label: Label;
  printSetting: PrintSetting;
  thumbnail?: string;          // 200x200 base64 缩略图
  createdAt?: string;
  updatedAt?: string;
}


/**
 * 标签尺寸预设
 */
export interface PageSizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

/**
 * 页面尺寸预设列表
 */
export const PAGE_SIZE_PRESETS: ReadonlyArray<PageSizePreset> = [
  { id: 'a4-portrait', name: 'A4 Portrait', widthMm: 210, heightMm: 297 },
  { id: 'a4-landscape', name: 'A4 Landscape', widthMm: 297, heightMm: 210 },
  { id: 'a5-portrait', name: 'A5 Portrait', widthMm: 148, heightMm: 210 },
  { id: 'a5-landscape', name: 'A5 Landscape', widthMm: 210, heightMm: 148 },
  { id: 'letter-portrait', name: 'Letter Portrait', widthMm: 216, heightMm: 279 },
  { id: 'letter-landscape', name: 'Letter Landscape', widthMm: 279, heightMm: 216 },
  { id: 'custom', name: 'Custom Size', widthMm: 100, heightMm: 100 }
];

/**
 * 获取预设的纸张尺寸（mm）
 */
export function getPaperSize(
  paperSize: string,
  orientation: 'portrait' | 'landscape',
  customWidth?: number,
  customHeight?: number
): { width: number; height: number } {
  if (paperSize === 'custom' && customWidth && customHeight) {
    return { width: customWidth, height: customHeight };
  }
  const preset = PAGE_SIZE_PRESETS.find(p => p.id === `${paperSize}-${orientation}`);
  return preset
    ? { width: preset.widthMm, height: preset.heightMm }
    : { width: 210, height: 297 }; // fallback A4
}

/**
 * 毫米转换为像素 (96 DPI / 25.4mm)
 *
 * 设计画布统一用 px 单位，物理尺寸用 mm。
 * 96 DPI 是显示器/打印机的标准 DPI。
 *
 * 例：210 mm 标签 → 210 × 96 / 25.4 ≈ 793 px 画布。
 * 这与 jsPDF 在 unit='px' 下的 1:1 像素渲染一致，
 * 所以设计阶段的画布 px 数可以 1:1 直接写到 PDF 里，
 * jsPDF.format: [mmWidth, mmHeight] 控制物理输出尺寸。
 */
export const PX_PER_MM = 96 / 25.4;

export function millimetersToPixels(sizeMm: number): number {
  return Math.round(sizeMm * PX_PER_MM);
}

export function pixelsToMillimeters(sizePx: number): number {
  return Math.round((sizePx / PX_PER_MM) * 100) / 100;
}
