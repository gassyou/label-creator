import { Circle, FabricImage, IText, Rect, Triangle } from 'fabric';
import {
  BaseElement,
  BarcodeElement,
  CircleElement,
  createBaseElement,
  createRectElement,
  createTextElement,
  createQRCodeElement,
  createBarcodeElement,
  createTableElement,
  ElementType,
  ImageElement,
  LabelElement,
  LabelTemplate,
  LineElement,
  millimetersToPixels,
  PageLayout,
  PX_PER_MM,
  QRCodeElement,
  RectElement,
  TableElement,
  TemplateDocument,
  TextElement,
  TriangleElement
} from './models/label.models';

export { PX_PER_MM, millimetersToPixels };
export type EditorTool = 'select' | 'text' | 'square' | 'circle' | 'triangle' | 'line' | 'qrcode' | 'barcode';

export type CanvasEntity = Rect | Circle | Triangle | IText | FabricImage;

// ============================================================
// Re-export from label.models for backward compatibility
// ============================================================
export {
  createBaseElement,
  createRectElement,
  createTextElement,
  createQRCodeElement,
  createBarcodeElement,
  createTableElement
};

export type {
  BaseElement,
  BarcodeElement,
  CircleElement,
  ElementType,
  ImageElement,
  LabelElement,
  LabelTemplate,
  LineElement,
  PageLayout,
  QRCodeElement,
  RectElement,
  TableElement,
  TemplateDocument,
  TextElement,
  TriangleElement
};

// ============================================================
// Editor-Specific State (kept from original for editor component)
// ============================================================

export interface EditorCanvasState {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage: string;
}

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
  // Text-specific
  text?: string;
  color?: string;
  binding?: string;
  // Barcode-specific
  barcodeFormat?: 'CODE128' | 'EAN13' | 'CODE39';
  showText?: boolean;
  // QR code-specific
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  foregroundColor?: string;
  backgroundColor?: string;
}

export interface PageSizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export interface EditorPage {
  id: string;
  name: string;
  presetId: string;
  widthMm: number;
  heightMm: number;
  canvasState: EditorCanvasState;
  canvasJson: string;
  templateId?: string;
  layoutId?: string;
}

export interface EditorDocumentState {
  activePageId: string;
  pages: EditorPage[];
  layouts?: PageLayout[];
  templates?: LabelTemplate[];
}

export const PAGE_SIZE_PRESETS: ReadonlyArray<PageSizePreset> = [
  { id: 'a4-portrait', name: 'A4 Portrait', widthMm: 210, heightMm: 297 },
  { id: 'a4-landscape', name: 'A4 Landscape', widthMm: 297, heightMm: 210 },
  { id: 'label-100x150', name: 'Label 100 x 150 mm', widthMm: 100, heightMm: 150 },
  { id: 'label-70x40', name: 'Label 70 x 40 mm', widthMm: 70, heightMm: 40 },
  { id: 'custom', name: 'Custom Size', widthMm: 100, heightMm: 100 }
];

export const DEFAULT_CANVAS_STATE: EditorCanvasState = {
  width: millimetersToPixels(210),
  height: millimetersToPixels(297),
  backgroundColor: '#ffffff',
  backgroundImage: ''
};

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

export function createCanvasState(widthMm: number, heightMm: number): EditorCanvasState {
  return {
    width: millimetersToPixels(widthMm),
    height: millimetersToPixels(heightMm),
    backgroundColor: DEFAULT_CANVAS_STATE.backgroundColor,
    backgroundImage: DEFAULT_CANVAS_STATE.backgroundImage
  };
}

export function getPresetById(presetId: string): PageSizePreset {
  return PAGE_SIZE_PRESETS.find((preset) => preset.id === presetId) ?? PAGE_SIZE_PRESETS[0];
}

export function createEditorPage(index: number, presetId = 'a4-portrait'): EditorPage {
  const preset = getPresetById(presetId);

  return {
    id: `page-${Date.now()}-${index}`,
    name: `Page ${index}`,
    presetId: preset.id,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    canvasState: createCanvasState(preset.widthMm, preset.heightMm),
    canvasJson: ''
  };
}

// ============================================================
// Template Creation Helpers (Section 8-9)
// ============================================================

export function createLabelTemplateDocument(name: string): TemplateDocument {
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

// ============================================================
// Element Factory Helpers
// ============================================================

export function createEditorRect(
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: string,
  stroke?: string,
  strokeWidth?: number,
  radius?: number
): RectElement {
  return createRectElement(x, y, width, height, fill, stroke, strokeWidth, radius);
}

export function createEditorText(
  x: number,
  y: number,
  width: number,
  height: number,
  text: string = 'Text',
  fontSize: number = 16,
  fontFamily: string = 'Helvetica'
): TextElement {
  return createTextElement(x, y, width, height, text, fontSize, fontFamily);
}

export function createEditorQRCode(
  x: number,
  y: number,
  size: number,
  value?: string
): QRCodeElement {
  return createQRCodeElement(x, y, size, value);
}

export function createEditorBarcode(
  x: number,
  y: number,
  width: number,
  height: number,
  format: BarcodeElement['format'],
  value?: string
): BarcodeElement {
  return createBarcodeElement(x, y, width, height, format, value);
}

export function createEditorLine(
  x: number,
  y: number,
  x2: number,
  y2: number,
  stroke: string = '#000000',
  strokeWidth: number = 1
): LineElement {
  const element = createBaseElement('line', x, y, Math.abs(x2 - x), Math.abs(y2 - y)) as LineElement;
  element.x1 = x;
  element.y1 = y;
  element.x2 = x2;
  element.y2 = y2;
  element.stroke = stroke;
  element.strokeWidth = strokeWidth;
  return element;
}

export function createEditorCircle(
  x: number,
  y: number,
  radius: number,
  fill?: string,
  stroke?: string,
  strokeWidth?: number
): CircleElement {
  const element = createBaseElement('circle', x, y, radius * 2, radius * 2) as CircleElement;
  element.fill = fill;
  element.stroke = stroke;
  element.strokeWidth = strokeWidth;
  return element;
}

export function createEditorTriangle(
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: string,
  stroke?: string,
  strokeWidth?: number
): TriangleElement {
  const element = createBaseElement('triangle', x, y, width, height) as TriangleElement;
  element.fill = fill;
  element.stroke = stroke;
  element.strokeWidth = strokeWidth;
  return element;
}