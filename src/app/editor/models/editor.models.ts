// ============================================================
// Editor Selection State - Section 41 (Selection Runtime)
// ============================================================
export type EditorSelectionState = {
  id?: string;
  type?: 'shape' | 'text' | 'barcode' | 'qrcode' | 'line' | 'image';
  opacity: number;
  width?: number;
  height?: number;
  length?: number;
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
  originY?: string;
};

export const DEFAULT_SELECTION_STATE: EditorSelectionState = {
  opacity: 100,
  fill: '',
  stroke: '',
  strokeWidth: 0,
  color: '#000000',
  fontFamily: 'Liberation Sans',
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

// ============================================================
// Element data-shape re-exports (Task 7: replace interfaces with
// re-exports of the new element *Data interfaces).
//
// The previous `interface XxxElement extends BaseElement` declarations
// have been removed. Code that previously imported `TextElement`,
// `RectElement`, etc. as a data shape now gets the matching *Data
// interface from the corresponding element module. We use the *Data
// interfaces (not the concrete classes) so that inline object
// literals — e.g. the canvas-service element builders — satisfy the
// type structurally without requiring render()/toJSON() methods.
// The concrete classes still live in their own modules and can be
// imported directly when an instance is needed.
// ============================================================
import type { RectElement as RectElementClass } from './rect-element';
import type { CircleElement as CircleElementClass } from './circle-element';
import type { TriangleElement as TriangleElementClass } from './triangle-element';
import type { LineElement as LineElementClass } from './line-element';
import type { TextElement as TextElementClass } from './text-element';
import type { BarcodeElement as BarcodeElementClass } from './barcode-element';
import type { QRCodeElement as QRCodeElementClass } from './qrcode-element';
import type { ImageElement as ImageElementClass } from './image-element';
import type { RectElementData } from './rect-element';
import type { CircleElementData } from './circle-element';
import type { TriangleElementData } from './triangle-element';
import type { LineElementData } from './line-element';
import type { TextElementData } from './text-element';
import type { BarcodeElementData } from './barcode-element';
import type { QRCodeElementData } from './qrcode-element';
import type { ImageElementData } from './image-element';

// `XxxElement` is the legacy name used throughout the codebase for a
// per-element data shape (and sometimes a class instance). We define it
// here as a union of the concrete class type and its *Data shape so
// that:
//   - inline object literals (canvas-service builders) satisfy it via
//     the *Data branch
//   - `new XxxElement({...})` instances satisfy it via the class branch
export type RectElement = RectElementClass | RectElementData;
export type CircleElement = CircleElementClass | CircleElementData;
export type TriangleElement = TriangleElementClass | TriangleElementData;
export type LineElement = LineElementClass | LineElementData;
export type TextElement = TextElementClass | TextElementData;
export type BarcodeElement = BarcodeElementClass | BarcodeElementData;
export type QRCodeElement = QRCodeElementClass | QRCodeElementData;
export type ImageElement = ImageElementClass | ImageElementData;

// Keep the explicit union so downstream code referring to LabelElement
// still works.
export type LabelElement =
  | RectElement
  | CircleElement
  | TriangleElement
  | LineElement
  | TextElement
  | BarcodeElement
  | QRCodeElement
  | ImageElement;
