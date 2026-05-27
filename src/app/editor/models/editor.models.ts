// ============================================================
// Editor Selection State - Section 41 (Selection Runtime)
// ============================================================
export type EditorSelectionState = {
  id?: string;
  type?: 'shape' | 'text' | 'barcode' | 'qrcode' | 'line' | 'image';
  opacity: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  color?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  textDecoration?: string;
  lineHeight?: number;
  charSpacing?: number;
  binding?: string;
  barcodeFormat?: string;
  showText?: boolean;
  errorCorrectionLevel?: string;
  foregroundColor?: string;
  backgroundColor?: string;
};

export const DEFAULT_SELECTION_STATE: EditorSelectionState = {
  opacity: 100,
  fill: '',
  stroke: '',
  strokeWidth: 0,
  color: '#000000',
  fontFamily: 'Arial',
  fontSize: 16,
  textAlign: 'left',
  textDecoration: ''
};

// ============================================================
// Editor Tool Types
// ============================================================
export type EditorTool = 'select' | 'text' | 'square' | 'circle' | 'triangle' | 'line' | 'qrcode' | 'barcode';

// ============================================================
// Element Types - Section 10-16 (Canvas Runtime)
// ============================================================
export type ElementType =
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'text'
  | 'barcode'
  | 'qrcode'
  | 'image';

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
  stroke: string;
  strokeWidth: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text?: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  textDecoration?: string;
  lineHeight?: number;
  charSpacing?: number;
  color?: string;
  fill?: string;
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  format: string;
  value?: string;
  binding?: string;
  showText?: boolean;
  color?: string;
}

export interface QRCodeElement extends BaseElement {
  type: 'qrcode';
  value?: string;
  binding?: string;
  errorCorrectionLevel?: string;
  foregroundColor?: string;
  backgroundColor?: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src?: string;
  binding?: string;
}

export type LabelElement =
  | RectElement
  | CircleElement
  | TriangleElement
  | LineElement
  | TextElement
  | BarcodeElement
  | QRCodeElement
  | ImageElement;
