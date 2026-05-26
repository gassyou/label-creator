// ============================================================
// Re-export all types from template.models.ts
// ============================================================
export * from './template.models';

// ============================================================
// Editor Canvas State - Section 40 (Canvas Runtime)
// ============================================================
export interface EditorCanvasState {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage?: string;
}

export const DEFAULT_CANVAS_STATE: EditorCanvasState = {
  width: 794,
  height: 1123,
  backgroundColor: '#ffffff'
};

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
// Canvas State Factory
// ============================================================
import { millimetersToPixels } from './template.models';

const PX_PER_MM = 96 / 25.4;

export function createCanvasState(widthMm: number, heightMm: number): EditorCanvasState {
  return {
    width: millimetersToPixels(widthMm),
    height: millimetersToPixels(heightMm),
    backgroundColor: '#ffffff'
  };
}

// ============================================================
// Page Size Presets
// ============================================================
export interface PageSizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export function getPresetById(presetId: string): PageSizePreset | undefined {
  const presets: PageSizePreset[] = [
    { id: 'a4-portrait', name: 'A4 Portrait', widthMm: 210, heightMm: 297 },
    { id: 'a4-landscape', name: 'A4 Landscape', widthMm: 297, heightMm: 210 },
    { id: 'a5-portrait', name: 'A5 Portrait', widthMm: 148, heightMm: 210 },
    { id: 'a5-landscape', name: 'A5 Landscape', widthMm: 210, heightMm: 148 },
    { id: 'letter-portrait', name: 'Letter Portrait', widthMm: 216, heightMm: 279 },
    { id: 'letter-landscape', name: 'Letter Landscape', widthMm: 279, heightMm: 216 },
    { id: 'custom', name: 'Custom Size', widthMm: 100, heightMm: 100 }
  ];
  return presets.find(p => p.id === presetId);
}

// ============================================================
// Utility Functions (kept from original label.models.ts)
// ============================================================

export { PX_PER_MM, millimetersToPixels, pixelsToMillimeters } from './template.models';