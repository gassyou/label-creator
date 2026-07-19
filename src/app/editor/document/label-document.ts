// src/app/editor/document/label-document.ts
import type { LabelElement } from '../models/editor.models';

/**
 * Runtime page-level settings.
 *
 * `widthMm` / `heightMm` are the physical label dimensions in millimetres.
 * `backgroundColor` empty string or undefined means "no fill". `backgroundImage`
 * is a data URL produced by the upload flow.
 */
export interface LabelPageSettings {
  widthMm: number;
  heightMm: number;
  backgroundColor?: string;
  backgroundImage?: string;
}

/** Default page settings: A4 portrait at 96 DPI (210 × 297 mm). */
export const DEFAULT_PAGE_SETTINGS: LabelPageSettings = {
  widthMm: 210,
  heightMm: 297,
};

/**
 * The runtime editing document. Immutable from outside `LabelDocumentService`.
 *
 * `elements` is keyed by element id so we can mutate one element without
 * rebuilding the whole list. Consumers narrow via the element's `type`
 * discriminator (`'rect' | 'text' | 'barcode' | …`).
 */
export interface LabelDocument {
  page: LabelPageSettings;
  elements: ReadonlyMap<string, LabelElement>;
  selectionId: string | null;
}
