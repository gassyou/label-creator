// ============================================================
// Core Element System - 标签设计器核心元素模型
// 用于描述标签模板中的各种元素（文本、图形、条码、二维码等）
// 这些是业务语义化的数据，可用于模板存储和批量打印
// ============================================================

/**
 * 元素类型枚举
 * 定义设计器支持的所有元素类型
 */
export type ElementType =
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'text'
  | 'barcode'
  | 'qrcode'
  | 'image'
  | 'table';

/**
 * 基础元素接口
 * 所有元素类型的基类，包含位置、尺寸、变换等通用属性
 */
export interface BaseElement {
  /** 元素唯一标识符 */
  id: string;
  /** 元素类型 */
  type: ElementType;
  /** X坐标（相对于画布） */
  x: number;
  /** Y坐标（相对于画布） */
  y: number;
  /** 元素宽度 */
  width: number;
  /** 元素高度 */
  height: number;
  /** 旋转角度（度） */
  rotation?: number;
  /** 是否可见 */
  visible?: boolean;
  /** 是否锁定（锁定后不可编辑） */
  lock?: boolean;
  /** Z轴顺序 */
  zIndex?: number;
  /** 不透明度（0-1） */
  opacity?: number;
}

// ============================================================
// Shape Elements - 形状元素
// ============================================================

/** 矩形元素 */
export interface RectElement extends BaseElement {
  type: 'rect';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** 圆角半径 */
  radius?: number;
}

/** 圆形元素 */
export interface CircleElement extends BaseElement {
  type: 'circle';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

/** 三角形元素 */
export interface TriangleElement extends BaseElement {
  type: 'triangle';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

/** 线条元素 */
export interface LineElement extends BaseElement {
  type: 'line';
  /** 起点X坐标 */
  x1: number;
  /** 起点Y坐标 */
  y1: number;
  /** 终点X坐标 */
  x2: number;
  /** 终点Y坐标 */
  y2: number;
  stroke: string;
  strokeWidth: number;
}

// ============================================================
// Content Elements - 内容元素
// ============================================================

/** 文本元素
 * 用于显示静态文本或动态绑定的业务数据
 * binding 属性支持 ${fieldName} 语法进行数据绑定
 */
export interface TextElement extends BaseElement {
  type: 'text';
  /** 显示的文本内容，支持 ${fieldName} 绑定语法 */
  text?: string;
  /** 数据绑定字段名，如 'name'、'price' */
  binding?: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: string;
  align?: 'left' | 'center' | 'right';
  color?: string;
  lineHeight?: number;
  charSpacing?: number;
  textDecoration?: string;
  fontStyle?: string;
}

/** 条码元素
 * 支持 CODE128、EAN13、CODE39 等格式
 * value 支持绑定语法 ${fieldName}
 */
export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  /** 条码格式 */
  format: 'CODE128' | 'EAN13' | 'CODE39';
  /** 条码值，支持 ${fieldName} 绑定语法 */
  value?: string;
  /** 数据绑定字段名 */
  binding?: string;
  /** 是否显示条码文本 */
  showText?: boolean;
}

/** 二维码元素
 * 用于生成二维码
 * value 支持绑定语法 ${fieldName}
 */
export interface QRCodeElement extends BaseElement {
  type: 'qrcode';
  /** 二维码内容，支持 ${fieldName} 绑定语法 */
  value?: string;
  /** 数据绑定字段名 */
  binding?: string;
  /** 纠错级别 L/M/Q/H */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  foregroundColor?: string;
  backgroundColor?: string;
}

/** 图片元素
 * 用于在标签中显示图片
 */
export interface ImageElement extends BaseElement {
  type: 'image';
  /** 图片URL或base64编码 */
  src?: string;
  /** 数据绑定字段名 */
  binding?: string;
}

// ============================================================
// Table Element - 表格元素
// ============================================================

/** 表格列定义 */
export interface TableColumn {
  /** 列标题 */
  title: string;
  /** 对应数据字段名 */
  field: string;
  /** 列宽度 */
  width: number;
  align?: 'left' | 'center' | 'right';
  /** 格式化器函数名 */
  formatter?: string;
}

/** 表格表头样式 */
export interface TableHeader {
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  fontWeight?: string;
}

/** 表格边框样式 */
export interface TableBorder {
  style?: 'solid' | 'dashed';
  width?: number;
  color?: string;
}

/** 表格元素
 * 用于在标签中显示动态数据表格
 * dataSource 指定数据源字段名，如 'items'
 */
export interface TableElement extends BaseElement {
  type: 'table';
  /** 数据源字段名，如 'items' */
  dataSource: string;
  columns: TableColumn[];
  rowHeight?: number;
  header?: TableHeader;
  border?: TableBorder;
}

/**
 * 联合类型：所有支持的元素类型
 */
export type LabelElement =
  | RectElement
  | CircleElement
  | TriangleElement
  | LineElement
  | TextElement
  | BarcodeElement
  | QRCodeElement
  | ImageElement
  | TableElement;

/** 运行时元素
 * 批量打印时，数据绑定后的元素实例
 * value 字段已解析为实际数据
 */
export interface RuntimeElement extends BaseElement {
  type: ElementType;
  value: string | string[] | number[][];
}

// ============================================================
// Template Model - 标签模板模型
// ============================================================

/**
 * 标签模板
 * 描述单个标签的结构，包含尺寸和元素列表
 * 一个标签模板可以放置在页面布局的多个位置上
 */
export interface LabelTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: string;
  /** 元素列表 */
  elements: LabelElement[];
}

// ============================================================
// Layout Model - 布局模型
// ============================================================

/**
 * 页面布局
 * 描述纸张格式和标签排列方式
 * 例如：A4 纸 2x2 排列，每页放4张标签
 */
export interface PageLayout {
  id: string;
  /** 纸张尺寸 */
  paper: 'A4' | 'A5' | 'letter' | 'thermal' | 'continuous';
  orientation: 'portrait' | 'landscape';
  /** 行数（一页中标签的行数） */
  rows: number;
  /** 列数（一页中标签的列数） */
  columns: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  gapX: number;
  gapY: number;
}

// ============================================================
// Document Model - 完整文档模型
// ============================================================

/**
 * 资源资产
 * 用于存储图片、字体等外部资源
 */
export interface ResourceAsset {
  id: string;
  type: 'image' | 'font';
  name: string;
  url: string;
}

/**
 * 标签页面
 * 编辑器中的单个页面，可包含 Fabric.js 画布数据
 *
 * canvasJson: Fabric 运行时数据，用于编辑时渲染
 * elements: 语义化元素数据，用于批量打印时绑定
 *
 * 两者可选其一：编辑时用 canvasJson，批量打印时用 elements
 */
export interface LabelPage {
  id: string;
  name: string;
  /** 页面尺寸预设ID，如 'a4-portrait'、'label-100x150' */
  presetId?: string;
  templateId?: string;
  layoutId?: string;
  widthMm: number;
  heightMm: number;
  backgroundColor: string;
  backgroundImage?: string;
  /** Fabric 画布 JSON 数据，编辑时使用 */
  canvasJson?: string;
  /** 语义化元素列表，批量打印时使用 */
  elements?: LabelElement[];
  /** 编辑器运行时画布状态，包含像素尺寸和背景设置，不持久化 */
  canvasState?: EditorCanvasState;
}

/**
 * 标签文档
 * 包含完整的模板设计信息
 * 用于持久化存储，可在将来迁移到服务端
 */
export interface LabelDocument {
  id: string;
  name: string;
  version: string;
  layouts: PageLayout[];
  templates: LabelTemplate[];
  pages: LabelPage[];
  resources: ResourceAsset[];
}

/**
 * 标签实例
 * 批量打印时，将业务数据绑定到模板后生成的实例
 */
export interface LabelInstance {
  id: string;
  templateId: string;
  recordId: string;
  resolvedElements: RuntimeElement[];
}

// ============================================================
// Editor Runtime State - 编辑器运行时状态
// 这些类型仅在编辑器内部使用，不进行持久化
// ============================================================

/**
 * Canvas 画布状态
 * 用于初始化和调整画布尺寸
 */
export interface EditorCanvasState {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage: string;
}

/**
 * 当前选中元素的属性状态
 * 用于右侧属性面板显示和编辑
 */
export interface EditorSelectionState {
  id: string;
  type: 'text' | 'shape' | 'barcode' | 'qrcode' | 'image' | 'table' | 'line';
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  lineHeight: number;
  charSpacing: number;
  fontWeight: string;
  fontStyle: string;
  textAlign: string;
  fontFamily: string;
  textDecoration: string;
  /** 文本内容 */
  text?: string;
  color?: string;
  /** 数据绑定字段 */
  binding?: string;
  /** 条码格式 */
  barcodeFormat?: 'CODE128' | 'EAN13' | 'CODE39';
  showText?: boolean;
  /** 二维码纠错级别 */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  foregroundColor?: string;
  backgroundColor?: string;
}

/**
 * 编辑器状态
 * 用于编辑器组件内部管理文档状态
 * 与 LabelDocument 的区别：包含运行时数据 canvasJson
 */
export interface EditorState {
  activePageId: string;
  pages: LabelPage[];
  layouts?: PageLayout[];
  templates?: LabelTemplate[];
}

/**
 * 页面尺寸预设
 * 提供常用的页面尺寸选项
 */
export interface PageSizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

/** 编辑器工具类型 */
export type EditorTool = 'select' | 'text' | 'square' | 'circle' | 'triangle' | 'line' | 'qrcode' | 'barcode';

// ============================================================
// Constants & Utilities
// ============================================================

/** 像素与毫米的转换系数 (96 DPI / 25.4mm) */
export const PX_PER_MM = 96 / 25.4;

/**
 * 毫米转换为像素
 */
export function millimetersToPixels(sizeMm: number): number {
  return Math.round(sizeMm * PX_PER_MM);
}

/**
 * 像素转换为毫米
 */
export function pixelsToMillimeters(sizePx: number): number {
  return Math.round((sizePx / PX_PER_MM) * 100) / 100;
}

/** 页面尺寸预设列表 */
export const PAGE_SIZE_PRESETS: ReadonlyArray<PageSizePreset> = [
  { id: 'a4-portrait', name: 'A4 Portrait', widthMm: 210, heightMm: 297 },
  { id: 'a4-landscape', name: 'A4 Landscape', widthMm: 297, heightMm: 210 },
  { id: 'label-100x150', name: 'Label 100 x 150 mm', widthMm: 100, heightMm: 150 },
  { id: 'label-70x40', name: 'Label 70 x 40 mm', widthMm: 70, heightMm: 40 },
  { id: 'custom', name: 'Custom Size', widthMm: 100, heightMm: 100 }
];

/** 默认画布状态 */
export const DEFAULT_CANVAS_STATE: EditorCanvasState = {
  width: millimetersToPixels(210),
  height: millimetersToPixels(297),
  backgroundColor: '#ffffff',
  backgroundImage: ''
};

/** 默认选中状态 */
export const DEFAULT_SELECTION_STATE: EditorSelectionState = {
  id: '',
  type: 'shape',
  opacity: 100,
  fill: '#000000',
  stroke: '',
  strokeWidth: 0,
  fontSize: 40,
  lineHeight: 1.16,
  charSpacing: 0,
  fontWeight: '',
  fontStyle: '',
  textAlign: 'left',
  fontFamily: 'Helvetica',
  textDecoration: '',
  color: '#000000',
  binding: '',
  showText: true
};

// ============================================================
// Factory Functions
// ============================================================

/**
 * 创建基础元素
 */
export function createBaseElement(
  type: ElementType,
  x: number,
  y: number,
  width: number,
  height: number
): BaseElement {
  return {
    id: `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    x,
    y,
    width,
    height,
    visible: true,
    lock: false,
    zIndex: 0,
    opacity: 1
  };
}

/**
 * 创建矩形元素
 */
export function createRectElement(
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: string,
  stroke?: string,
  strokeWidth?: number,
  radius?: number
): RectElement {
  const element = createBaseElement('rect', x, y, width, height) as RectElement;
  element.fill = fill;
  element.stroke = stroke;
  element.strokeWidth = strokeWidth;
  element.radius = radius;
  return element;
}

/**
 * 创建文本元素
 */
export function createTextElement(
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  fontSize: number = 16,
  fontFamily: string = 'Helvetica'
): TextElement {
  const element = createBaseElement('text', x, y, width, height) as TextElement;
  element.text = text;
  element.fontSize = fontSize;
  element.fontFamily = fontFamily;
  element.align = 'left';
  element.color = '#000000';
  return element;
}

/**
 * 创建二维码元素
 */
export function createQRCodeElement(
  x: number,
  y: number,
  size: number,
  value?: string
): QRCodeElement {
  const element = createBaseElement('qrcode', x, y, size, size) as QRCodeElement;
  element.value = value;
  element.errorCorrectionLevel = 'M';
  element.foregroundColor = '#000000';
  element.backgroundColor = '#ffffff';
  return element;
}

/**
 * 创建条码元素
 */
export function createBarcodeElement(
  x: number,
  y: number,
  width: number,
  height: number,
  format: BarcodeElement['format'],
  value?: string
): BarcodeElement {
  const element = createBaseElement('barcode', x, y, width, height) as BarcodeElement;
  element.format = format;
  element.value = value;
  element.showText = true;
  return element;
}

/**
 * 创建表格元素
 */
export function createTableElement(
  x: number,
  y: number,
  width: number,
  height: number,
  dataSource: string,
  columns: TableColumn[]
): TableElement {
  const element = createBaseElement('table', x, y, width, height) as TableElement;
  element.dataSource = dataSource;
  element.columns = columns;
  element.rowHeight = 30;
  element.header = { height: 40 };
  element.border = { style: 'solid', width: 1, color: '#000000' };
  return element;
}

/**
 * 创建标签模板
 */
export function createLabelTemplate(
  name: string,
  width: number,
  height: number,
  elements: LabelElement[] = []
): LabelTemplate {
  return {
    id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    width,
    height,
    elements
  };
}

/**
 * 创建页面布局
 */
export function createPageLayout(
  paper: PageLayout['paper'] = 'A4',
  orientation: PageLayout['orientation'] = 'portrait',
  rows: number = 1,
  columns: number = 1
): PageLayout {
  return {
    id: `layout-${Date.now()}`,
    paper,
    orientation,
    rows,
    columns,
    marginTop: 10,
    marginBottom: 10,
    marginLeft: 10,
    marginRight: 10,
    gapX: 5,
    gapY: 5
  };
}

/**
 * 创建画布状态
 */
export function createCanvasState(widthMm: number, heightMm: number): EditorCanvasState {
  return {
    width: millimetersToPixels(widthMm),
    height: millimetersToPixels(heightMm),
    backgroundColor: DEFAULT_CANVAS_STATE.backgroundColor,
    backgroundImage: DEFAULT_CANVAS_STATE.backgroundImage
  };
}

/**
 * 根据预设ID获取页面尺寸预设
 */
export function getPresetById(presetId: string): PageSizePreset {
  return PAGE_SIZE_PRESETS.find((preset) => preset.id === presetId) ?? PAGE_SIZE_PRESETS[0];
}

/**
 * 创建编辑页面
 * 用于编辑器中新建或切换页面
 */
export function createEditorPage(index: number, presetId = 'a4-portrait'): LabelPage {
  const preset = getPresetById(presetId);

  return {
    id: `page-${Date.now()}-${index}`,
    name: `Page ${index}`,
    presetId: preset.id,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    backgroundColor: '#ffffff',
    canvasJson: '',
    canvasState: createCanvasState(preset.widthMm, preset.heightMm)
  };
}

/**
 * 创建标签文档
 */
export function createLabelDocument(name: string): LabelDocument {
  return {
    id: `doc-${Date.now()}`,
    name,
    version: '1.0.0',
    layouts: [],
    templates: [],
    pages: [],
    resources: []
  };
}