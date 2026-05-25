// ============================================================
// Core Element System - Based on Design Document Section 10-16
// ============================================================

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

// Base interface for all elements - Section 11
export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  visible?: boolean;
  lock?: boolean;
  zIndex?: number;
  opacity?: number;
}

// Shape Elements - Section 12
export interface RectElement extends BaseElement {
  type: 'rect';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export interface CircleElement extends BaseElement {
  type: 'circle';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface TriangleElement extends BaseElement {
  type: 'triangle';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface LineElement extends BaseElement {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

// TextElement - Section 13
export interface TextElement extends BaseElement {
  type: 'text';
  text?: string;
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

// BarcodeElement - Section 14
export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  format: 'CODE128' | 'EAN13' | 'CODE39';
  value?: string;
  binding?: string;
  showText?: boolean;
}

// QRCodeElement - Section 15
export interface QRCodeElement extends BaseElement {
  type: 'qrcode';
  value?: string;
  binding?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  foregroundColor?: string;
  backgroundColor?: string;
}

// ImageElement
export interface ImageElement extends BaseElement {
  type: 'image';
  src?: string;
  binding?: string;
}

// TableElement - Section 28-30
export interface TableColumn {
  title: string;
  field: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  formatter?: string;
}

export interface TableHeader {
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  fontWeight?: string;
}

export interface TableBorder {
  style?: 'solid' | 'dashed';
  width?: number;
  color?: string;
}

export interface TableElement extends BaseElement {
  type: 'table';
  dataSource: string;
  columns: TableColumn[];
  rowHeight?: number;
  header?: TableHeader;
  border?: TableBorder;
}

// Union type for all elements
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

// Runtime Element - Section 21
export interface RuntimeElement extends BaseElement {
  type: ElementType;
  value: string | string[] | number[][];
}

// ============================================================
// Template Model - Section 9
// ============================================================
export interface LabelTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: string;
  elements: LabelElement[];
}

// ============================================================
// Layout Model - Section 8
// ============================================================
export interface PageLayout {
  id: string;
  paper: 'A4' | 'A5' | 'letter' | 'thermal' | 'continuous';
  orientation: 'portrait' | 'landscape';
  rows: number;
  columns: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  gapX: number;
  gapY: number;
}

// ============================================================
// Template Document - Section 7
// ============================================================
export interface TemplateDocument {
  id: string;
  name: string;
  version: string;
  layouts: PageLayout[];
  templates: LabelTemplate[];
  pages: TemplatePage[];
  resources: ResourceAsset[];
}

export interface TemplatePage {
  id: string;
  layoutId: string;
  templateId: string;
  widthMm: number;
  heightMm: number;
  backgroundColor: string;
  backgroundImage?: string;
  canvasJson?: string;
}

// ============================================================
// Label Instance - Section 22
// ============================================================
export interface LabelInstance {
  id: string;
  templateId: string;
  recordId: string;
  resolvedElements: RuntimeElement[];
}

// ============================================================
// Resource Assets
// ============================================================
export interface ResourceAsset {
  id: string;
  type: 'image' | 'font';
  name: string;
  url: string;
}

// ============================================================
// Unit Conversion - Section 37
// ============================================================
export const PX_PER_MM = 96 / 25.4;

export function millimetersToPixels(sizeMm: number): number {
  return Math.round(sizeMm * PX_PER_MM);
}

export function pixelsToMillimeters(sizePx: number): number {
  return Math.round((sizePx / PX_PER_MM) * 100) / 100;
}

// ============================================================
// Factory Functions
// ============================================================
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