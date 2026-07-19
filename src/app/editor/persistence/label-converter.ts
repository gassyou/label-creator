// src/app/editor/persistence/label-converter.ts
import { Label, LabelTemplate, PrintSetting } from '../models/label.models';
import { LabelPageSettings } from '../document/label-document';

/**
 * Pure functions that convert runtime editor state into serializable
 * persistence shapes (`Label`, `LabelTemplate`). No signals, no DI, no
 * side effects — these are the data-only conversions that any storage
 * layer (localStorage, HTTP, future IndexedDB, ...) can consume.
 *
 * Extracted from `editor.ts:buildLabelTemplate()` so the conversion
 * semantics live next to the persistence layer rather than the
 * component shell.
 */

/**
 * Builds a `Label` payload from the live page settings and the Fabric
 * canvas JSON. Page fields come from `LabelDocumentService.page()` so
 * edits made via PagePropertiesComponent (which writes only to the doc)
 * are reflected. `canvasJson` is the serialized Fabric canvas snapshot.
 */
export function buildLabel(page: LabelPageSettings, canvasJson: string): Label {
  return {
    id: `label-${Date.now()}`,
    width: page.widthMm,
    height: page.heightMm,
    backgroundColor: page.backgroundColor ?? '#ffffff',
    backgroundImage: page.backgroundImage,
    canvasJson,
  };
}

/**
 * Builds a complete `LabelTemplate` from the page settings, the canvas
 * JSON, the template id/name, and the current `PrintSetting`.
 *
 * Returns the template as a plain object — caller is responsible for
 * any further persistence (storage, download, network).
 */
export function buildLabelTemplate(
  page: LabelPageSettings,
  canvasJson: string,
  templateId: string | null,
  templateName: string,
  printSetting: PrintSetting,
): LabelTemplate {
  return {
    id: templateId || undefined,
    name: templateName,
    label: buildLabel(page, canvasJson),
    printSetting,
  };
}

/**
 * Namespace export. Mirrors the project's converter pattern (pure
 * functions grouped under a const so callers see them as a unit).
 */
export const LabelConverter = {
  buildLabel,
  buildLabelTemplate,
};