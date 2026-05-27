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
