import { Circle, FabricImage, IText, Rect, Triangle } from 'fabric';

export type EditorTool = 'select' | 'text' | 'square' | 'circle' | 'triangle';

export type CanvasEntity = Rect | Circle | Triangle | IText | FabricImage;

export interface EditorCanvasState {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage: string;
}

export interface EditorSelectionState {
  id: string;
  opacity: number;
  fill: string;
  fontSize: number;
  lineHeight: number;
  charSpacing: number;
  fontWeight: string;
  fontStyle: string;
  textAlign: string;
  fontFamily: string;
  textDecoration: string;
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
}

export interface EditorDocumentState {
  activePageId: string;
  pages: EditorPage[];
}

export const PX_PER_MM = 96 / 25.4;

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
  opacity: 100,
  fill: '#000000',
  fontSize: 40,
  lineHeight: 1.16,
  charSpacing: 0,
  fontWeight: '',
  fontStyle: '',
  textAlign: 'left',
  fontFamily: 'Helvetica',
  textDecoration: ''
};

export function millimetersToPixels(sizeMm: number): number {
  return Math.round(sizeMm * PX_PER_MM);
}

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
