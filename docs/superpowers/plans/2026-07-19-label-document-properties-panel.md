# LabelDocument + Per-Type Properties Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `editor-properties-panel` into per-element-type sub-components and introduce `LabelDocumentService` as the runtime single source of truth, observed by both the canvas and the property panels via Angular signals + `effect`. The JSON preview pane filters by current selection.

**Architecture:** New `LabelDocument` runtime model (page settings + element Map keyed by id + selectionId). `LabelDocumentService` holds signals and exposes mutations. `EditorCanvasService` becomes a thin Fabric adapter that reads/writes the document via `effect()` and event handlers, with cycle guards. Eight new components under `properties/` replace the monolithic panel: shell + page + common + figure + line + text + barcode + qrcode + json-preview. Sub-panels inject the service directly (no input/output wiring for property edits).

**Tech Stack:** Angular 21.1, TypeScript 5.9, Fabric 7.4, ng-zorro 21, signal-based reactivity. No new dependencies. `npm test` (vitest) for unit tests where applicable; manual smoke in `npm start` for canvas-coupled integration.

**Spec:** `docs/superpowers/specs/2026-07-19-label-document-properties-panel-design.md`

## Global Constraints

- **No new dependencies.** All work uses `@angular/core` signals, `ng-zorro-antd`, and the existing `fabric` 7.4 API.
- **No wire-format change.** Persisted `Label` / `LabelTemplate` (in `models/label.models.ts`) and `LabelElement` union (in `models/editor.models.ts`) are byte-compatible with today. Runtime `LabelDocument` is serialized only when persisting.
- **Reuse, don't redefine.** Service stores elements as `LabelElement` (existing union). No new `ElementState`/`ElementKind`/`SerializableElement` types introduced; only one new page-settings type `LabelPageSettings`.
- **ElementType reuse.** Sub-component switch keys come from existing `ElementType` literal union (`'rect' | 'circle' | 'triangle' | 'line' | 'text' | 'barcode' | 'qrcode' | 'image'`).
- **Sub-panels inject the service.** No property-edit inputs/outputs between shell and sub-panels — they call `LabelDocumentService.updateElement(id, patch)` directly.
- **Cycle guard.** All Fabric-event → document writes happen inside `untracked(...)` and inside an `isApplyingFromDoc` guard window. The document → Fabric effect honors the same guard and short-circuits when set.
- **EditorSelectionState preserved.** `models/editor.models.ts:4-31` `EditorSelectionState` type and `DEFAULT_SELECTION_STATE` are not modified. `LabelDocumentService.selectionProperties` still produces this shape for downstream consumers.
- **Standalone components.** All new components are `standalone`, `ChangeDetectionStrategy.OnPush`, use signal `input()` / `output()` where they have I/O, inject services with `inject()`.
- **Migration gate.** Each task that changes user-visible behavior ends with a manual smoke check (start dev server, add an element, edit a property from panel, edit it from canvas, observe the other side update) before its commit.
- **Removal of dead wire.** `verticalAlignChanged` (currently in `editor-properties-panel.ts:57` and `editor.html:78` but no UI emits it) is removed in this refactor.

---

## File Structure

```
src/app/editor/
  document/
    label-document.ts                       # NEW: LabelDocument + LabelPageSettings types
    label-document.service.ts               # NEW: central service (signals + mutations)
    index.ts                                # NEW: barrel

  properties/
    properties-panel.component.ts           # NEW: shell with @switch router
    properties-panel.component.html         # NEW
    properties-panel.component.scss         # NEW: shared selectors (moved from editor-properties-panel.scss)
    page-properties.component.ts            # NEW: pageSize, mm W/H, bg color/image upload
    page-properties.component.html          # NEW
    common-properties.component.ts          # NEW: id + opacity
    common-properties.component.html        # NEW
    figure-properties.component.ts          # NEW: rect/circle/triangle/image (fill + stroke + size)
    figure-properties.component.html        # NEW
    line-properties.component.ts            # NEW: line (length + stroke + strokeWidth)
    line-properties.component.html          # NEW
    text-properties.component.ts            # NEW: text (color/font/family/size/style/align)
    text-properties.component.html          # NEW
    barcode-properties.component.ts         # NEW: barcode (format/value/showText)
    barcode-properties.component.html       # NEW
    qrcode-properties.component.ts          # NEW: qrcode (value/foreground/background/ecLevel)
    qrcode-properties.component.html        # NEW
    json-preview.component.ts               # NEW: filterable JSON preview
    json-preview.component.html             # NEW

  editor.ts                                 # MODIFIED: provide LabelDocumentService, drop signals
  editor.html                               # MODIFIED: <app-properties-panel> binding
  editor-properties-panel.ts                # DELETED
  editor-properties-panel.html              # DELETED
  editor-properties-panel.scss              # DELETED (contents moved into properties/...scss)
  editor-canvas.service.ts                  # MODIFIED: becomes Fabric adapter; injects LabelDocumentService
  models/label.models.ts                    # UNCHANGED
  models/editor.models.ts                   # UNCHANGED
  models/element-base.ts                    # UNCHANGED
  models/element-factory.ts                 # UNCHANGED
  models/{rect,circle,triangle,line,text,barcode,qrcode,image}-element.ts  # UNCHANGED
```

---

## Task 1: Create `LabelDocument` types

**Files:**
- Create: `src/app/editor/document/label-document.ts`

**Interfaces:**
- Produces: `LabelPageSettings` interface, `LabelDocument` interface.
- Consumes (later tasks): `LabelElement` from `../models/editor.models`.

- [ ] **Step 1: Create the file**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/editor/document/label-document.ts
git commit -m "feat(editor): add LabelDocument runtime types"
```

---

## Task 2: Create `LabelDocumentService`

**Files:**
- Create: `src/app/editor/document/label-document.service.ts`
- Create: `src/app/editor/document/index.ts`

**Interfaces:**
- Consumes: `LabelPageSettings`, `LabelDocument`, `DEFAULT_PAGE_SETTINGS` from Task 1; `LabelElement`, `EditorSelectionState`, `DEFAULT_SELECTION_STATE` from `../models/editor.models`.
- Produces: `LabelDocumentService` with signals `page`, `elements`, `selectionId`; computed `selection`, `selectionProperties`; mutations `setPageSize`, `setPageBackground`, `addElement`, `updateElement`, `removeElement`, `selectElement`; private `toProperties` mapper.

- [ ] **Step 1: Create the barrel**

```ts
// src/app/editor/document/index.ts
export * from './label-document';
export * from './label-document.service';
```

- [ ] **Step 2: Create the service**

```ts
// src/app/editor/document/label-document.service.ts
import { Injectable, computed, signal } from '@angular/core';
import {
  DEFAULT_SELECTION_STATE,
  type EditorSelectionState,
  type LabelElement,
} from '../models/editor.models';
import {
  DEFAULT_PAGE_SETTINGS,
  type LabelPageSettings,
} from './label-document';

/**
 * Runtime central model. Single source of truth for the editor's editing
 * state. Observed by both `EditorCanvasService` (Fabric adapter) and the
 * property panels via signals + `effect`.
 *
 * Mutations are coarse: `updateElement(id, patch)` shallow-merges the patch
 * into the element's data and replaces the `elements` Map with a new one.
 * Consumers' `computed`/`effect` re-run because the Map reference changes.
 */
@Injectable()
export class LabelDocumentService {
  // ----- state signals -----
  readonly page = signal<LabelPageSettings>({ ...DEFAULT_PAGE_SETTINGS });
  readonly elements = signal<ReadonlyMap<string, LabelElement>>(new Map());
  readonly selectionId = signal<string | null>(null);

  // ----- selectors -----
  readonly selection = computed<LabelElement | null>(() => {
    const id = this.selectionId();
    if (!id) return null;
    return this.elements().get(id) ?? null;
  });

  readonly selectionProperties = computed<EditorSelectionState>(() => {
    const sel = this.selection();
    return sel ? this.toProperties(sel) : { ...DEFAULT_SELECTION_STATE };
  });

  // ----- page mutations -----
  setPageSize(widthMm: number, heightMm: number): void {
    this.page.update((p) => ({ ...p, widthMm, heightMm }));
  }

  setPageBackground(color: string | null, image?: string | null): void {
    this.page.update((p) => ({
      ...p,
      backgroundColor: color ?? undefined,
      backgroundImage: image ?? undefined,
    }));
  }

  // ----- element mutations -----
  addElement(state: LabelElement): void {
    if (!state?.id) {
      throw new Error('LabelDocumentService.addElement: element must have an id');
    }
    this.elements.update((m) => {
      const next = new Map(m);
      next.set(state.id, state);
      return next;
    });
  }

  /**
   * Main write entry. Shallow-merges `patch` into the element identified by
   * `id`. No-op if the id is not present. Preserves the `id` and `type`
   * fields — callers cannot rename either via patch.
   */
  updateElement(id: string, patch: Partial<LabelElement>): void {
    this.elements.update((m) => {
      const current = m.get(id);
      if (!current) return m;
      const next = new Map(m);
      next.set(id, { ...current, ...patch, id, type: current.type } as LabelElement);
      return next;
    });
  }

  removeElement(id: string): void {
    this.elements.update((m) => {
      if (!m.has(id)) return m;
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    if (this.selectionId() === id) {
      this.selectionId.set(null);
    }
  }

  selectElement(id: string | null): void {
    this.selectionId.set(id);
  }

  // ----- internal: ElementState → EditorSelectionState projection -----
  private toProperties(s: LabelElement): EditorSelectionState {
    // ElementState is an open shape (LabelElement union members satisfy it).
    // We pluck only the fields the property panels care about.
    const anyState = s as unknown as Record<string, unknown>;
    return {
      id: anyState['id'] as string,
      type: (anyState['type'] as EditorSelectionState['type']) ?? undefined,
      opacity: Number(anyState['opacity'] ?? 1) * 100,
      width: anyState['width'] as number | undefined,
      height: anyState['height'] as number | undefined,
      length: anyState['length'] as number | undefined,
      fill: anyState['fill'] as string | undefined,
      stroke: anyState['stroke'] as string | undefined,
      strokeWidth: anyState['strokeWidth'] as number | undefined,
      color: anyState['color'] as string | undefined,
      text: anyState['text'] as string | undefined,
      fontFamily: anyState['fontFamily'] as string | undefined,
      fontSize: anyState['fontSize'] as number | undefined,
      fontWeight: anyState['fontWeight'] as string | undefined,
      fontStyle: anyState['fontStyle'] as string | undefined,
      textAlign: anyState['textAlign'] as string | undefined,
      textDecoration: anyState['textDecoration'] as string | undefined,
      barcodeFormat: anyState['barcodeFormat'] as string | undefined,
      showText: anyState['showText'] as boolean | undefined,
      errorCorrectionLevel: anyState['errorCorrectionLevel'] as string | undefined,
      foregroundColor: anyState['foregroundColor'] as string | undefined,
      backgroundColor: anyState['backgroundColor'] as string | undefined,
    };
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors. (The service is not yet wired into any component, so no runtime test yet.)

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/document/label-document.service.ts src/app/editor/document/index.ts
git commit -m "feat(editor): add LabelDocumentService central runtime model"
```

---

## Task 3: Move shared SCSS into `properties-panel.component.scss`

**Files:**
- Create: `src/app/editor/properties/properties-panel.component.scss` (placeholder for now)
- Read: `src/app/editor/editor-properties-panel.scss` (do not modify yet — will be deleted in Task 12)

**Interfaces:**
- Produces: a shared SCSS file with all property-panel selectors.
- Consumes (later): each sub-component's `styleUrl`.

- [ ] **Step 1: Create the placeholder SCSS**

```scss
/* src/app/editor/properties/properties-panel.component.scss */

/* This file holds the shared selectors used by every property-panel
   sub-component (.property-stack, .inline-row, .color-input-row,
   .text-style-row, .checkbox-label, .bg-preview, .muted, .icon-button,
   etc.). Each sub-component imports this file via its styleUrl.

   The full rules are copied verbatim from editor-properties-panel.scss
   in the next step. */

.placeholder {
  display: none;
}
```

- [ ] **Step 2: Verify the file is created**

Run: `ls -la src/app/editor/properties/properties-panel.component.scss`
Expected: file exists.

- [ ] **Step 3: Commit**

```bash
git add src/app/editor/properties/properties-panel.component.scss
git commit -m "chore(editor): scaffold properties-panel shared scss"
```

---

## Task 4: Create `CommonPropertiesComponent`

**Files:**
- Create: `src/app/editor/properties/common-properties.component.ts`
- Create: `src/app/editor/properties/common-properties.component.html`

**Interfaces:**
- Consumes: `LabelDocumentService.selection()` (the current element).
- Produces: emits no outputs. Calls `doc.updateElement(id, { id })` and `doc.updateElement(id, { opacity })`.

- [ ] **Step 1: Create the TS file**

```ts
// src/app/editor/properties/common-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-common-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './common-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommonPropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => this.doc.selection());

  protected onIdChange(id: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { id } as any);
  }

  protected onOpacityChange(opacityPct: number): void {
    const sel = this.state();
    if (!sel) return;
    // Fabric uses 0..1; UI uses 0..100.
    this.doc.updateElement(sel.id, { opacity: Number(opacityPct) / 100 } as any);
  }
}
```

- [ ] **Step 2: Create the HTML file**

```html
<!-- src/app/editor/properties/common-properties.component.html -->
@let s = state();
@if (s) {
  <label>
    <span>ID</span>
    <input
      type="text"
      [ngModel]="s.id"
      (ngModelChange)="onIdChange($event)"
    />
  </label>
  <label>
    <span>Opacity {{ ((s as any).opacity ?? 1) * 100 | number:'1.0-0' }}%</span>
    <input
      type="range"
      min="0"
      max="100"
      [ngModel]="((s as any).opacity ?? 1) * 100"
      (ngModelChange)="onOpacityChange($event)"
    />
  </label>
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/properties/common-properties.component.ts src/app/editor/properties/common-properties.component.html
git commit -m "feat(editor): add CommonPropertiesComponent (id + opacity)"
```

---

## Task 5: Create `PagePropertiesComponent`

**Files:**
- Create: `src/app/editor/properties/page-properties.component.ts`
- Create: `src/app/editor/properties/page-properties.component.html`

**Interfaces:**
- Consumes: `LabelDocumentService.page()`.
- Produces: calls `doc.setPageSize(w, h)` and `doc.setPageBackground(color, image)`.

- [ ] **Step 1: Create the TS file**

```ts
// src/app/editor/properties/page-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzUploadModule, type NzUploadFile } from 'ng-zorro-antd/upload';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-page-properties',
  standalone: true,
  imports: [CommonModule, FormsModule, NzButtonModule, NzIconModule, NzUploadModule],
  templateUrl: './page-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PagePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly page = this.doc.page;

  /** Tracks the currently selected preset id so the dropdown reflects user choice. */
  protected readonly presetId = signal<string>('a4-portrait');

  protected readonly mmWidth = computed(() => this.page().widthMm);
  protected readonly mmHeight = computed(() => this.page().heightMm);

  protected onWidthChange(mm: number): void {
    this.doc.setPageSize(Number(mm), this.mmHeight());
  }

  protected onHeightChange(mm: number): void {
    this.doc.setPageSize(this.mmWidth(), Number(mm));
  }

  protected onPresetChange(id: string): void {
    this.presetId.set(id);
    if (id === 'custom') return;
    // Mirror the legacy preset table; keep names stable for the wire format.
    const presets: Record<string, { w: number; h: number }> = {
      'a4-portrait': { w: 210, h: 297 },
      'a4-landscape': { w: 297, h: 210 },
      'a5-portrait': { w: 148, h: 210 },
      'a5-landscape': { w: 210, h: 148 },
      'letter-portrait': { w: 216, h: 279 },
      'letter-landscape': { w: 279, h: 216 },
    };
    const preset = presets[id];
    if (preset) this.doc.setPageSize(preset.w, preset.h);
  }

  protected onBackgroundColorChange(color: string): void {
    this.doc.setPageBackground(color || null);
  }

  protected onBackgroundNoneToggle(noneChecked: boolean): void {
    this.doc.setPageBackground(noneChecked ? null : '#ffffff');
  }

  protected onBackgroundImageToggle(noneChecked: boolean): void {
    if (noneChecked) this.doc.setPageBackground(this.page().backgroundColor ?? null, null);
    else this.doc.setPageBackground(this.page().backgroundColor ?? null, '');
  }

  protected beforeUpload = (file: NzUploadFile): boolean => {
    const raw = file as unknown as File;
    if (!raw) return false;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      this.doc.setPageBackground(this.page().backgroundColor ?? null, dataUrl);
    };
    reader.readAsDataURL(raw);
    return false; // prevent ng-zorro from doing its own upload
  };
}
```

- [ ] **Step 2: Create the HTML file**

```html
<!-- src/app/editor/properties/page-properties.component.html -->
<label>
  <select
    title="标签大小"
    [ngModel]="presetId()"
    (ngModelChange)="onPresetChange($event)"
  >
    <option value="a4-portrait">A4 Portrait (210×297 mm)</option>
    <option value="a4-landscape">A4 Landscape (297×210 mm)</option>
    <option value="a5-portrait">A5 Portrait (148×210 mm)</option>
    <option value="a5-landscape">A5 Landscape (210×148 mm)</option>
    <option value="letter-portrait">Letter Portrait (216×279 mm)</option>
    <option value="letter-landscape">Letter Landscape (279×216 mm)</option>
    <option value="custom">Custom</option>
  </select>
</label>
<div class="size-display inline-row">
  <label>
    <span>Width (mm)</span>
    <input
      type="number"
      [ngModel]="mmWidth()"
      (ngModelChange)="onWidthChange($event)"
    />
  </label>
  <label>
    <span>Height (mm)</span>
    <input
      type="number"
      [ngModel]="mmHeight()"
      (ngModelChange)="onHeightChange($event)"
    />
  </label>
</div>
<label>
  <span>Background Color</span>
  <div class="color-input-row">
    <label class="checkbox-label">
      <input
        type="checkbox"
        [checked]="!page().backgroundColor"
        (change)="onBackgroundNoneToggle($any($event.target).checked)"
      />
      <span>None</span>
    </label>
    <input
      type="color"
      [ngModel]="page().backgroundColor"
      (ngModelChange)="onBackgroundColorChange($event)"
      [disabled]="!page().backgroundColor"
    />
  </div>
</label>
<label>
  <span>Background Image</span>
  <div class="color-input-row">
    <label class="checkbox-label">
      <input
        type="checkbox"
        [checked]="!page().backgroundImage"
        (change)="onBackgroundImageToggle($any($event.target).checked)"
      />
      <span>None</span>
    </label>
    <nz-upload
      [nzShowUploadList]="false"
      [nzBeforeUpload]="beforeUpload"
    >
      <button nz-button nzType="primary" nzSize="small" type="button">
        <span nz-icon nzType="upload"></span>
        Upload
      </button>
    </nz-upload>
  </div>
  @if (page().backgroundImage) {
    <div class="bg-preview">
      <img [src]="page().backgroundImage" alt="Background preview" />
    </div>
  }
</label>
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/properties/page-properties.component.ts src/app/editor/properties/page-properties.component.html
git commit -m "feat(editor): add PagePropertiesComponent (page size, bg color/image)"
```

---

## Task 6: Create `FigurePropertiesComponent`

**Files:**
- Create: `src/app/editor/properties/figure-properties.component.ts`
- Create: `src/app/editor/properties/figure-properties.component.html`

**Interfaces:**
- Consumes: `LabelDocumentService.selection()`; switches on `'rect' | 'circle' | 'triangle' | 'image'`.
- Produces: writes width/height/fill/stroke/strokeWidth via `doc.updateElement`.

- [ ] **Step 1: Create the TS file**

```ts
// src/app/editor/properties/figure-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-figure-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './figure-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FigurePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    if (!sel) return null;
    const t = sel.type;
    return t === 'rect' || t === 'circle' || t === 'triangle' || t === 'image' ? sel : null;
  });

  protected onWidthChange(px: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { width: Number(px) } as any);
  }

  protected onHeightChange(px: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { height: Number(px) } as any);
  }

  protected onFillChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { fill: color } as any);
  }

  protected onFillNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { fill: noneChecked ? '' : '#000000' } as any);
  }

  protected onStrokeChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { stroke: color } as any);
  }

  protected onStrokeNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { stroke: noneChecked ? '' : '#000000' } as any);
  }

  protected onStrokeWidthChange(width: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { strokeWidth: Number(width) } as any);
  }
}
```

- [ ] **Step 2: Create the HTML file**

```html
<!-- src/app/editor/properties/figure-properties.component.html -->
@let s = state();
@if (s) {
  <div class="inline-row">
    <label>
      <span>W(px)</span>
      <input
        type="number"
        min="1"
        [ngModel]="$any(s).width"
        (ngModelChange)="onWidthChange($event)"
      />
    </label>
    <label>
      <span>H(px)</span>
      <input
        type="number"
        min="1"
        [ngModel]="$any(s).height"
        (ngModelChange)="onHeightChange($event)"
      />
    </label>
  </div>

  <label>
    <span>Fill</span>
    <div class="color-input-row">
      <label class="checkbox-label">
        <input
          type="checkbox"
          [checked]="!$any(s).fill"
          (change)="onFillNoneToggle($any($event.target).checked)"
        />
        <span>None</span>
      </label>
      <input
        type="color"
        [ngModel]="$any(s).fill"
        (ngModelChange)="onFillChange($event)"
        [disabled]="!$any(s).fill"
      />
    </div>
  </label>

  <label>
    <span>Stroke</span>
    <div class="color-input-row">
      <label class="checkbox-label">
        <input
          type="checkbox"
          [checked]="!$any(s).stroke"
          (change)="onStrokeNoneToggle($any($event.target).checked)"
        />
        <span>None</span>
      </label>
      <input
        type="color"
        [ngModel]="$any(s).stroke"
        (ngModelChange)="onStrokeChange($event)"
        [disabled]="!$any(s).stroke"
      />
    </div>
  </label>

  <label>
    <span>Stroke Width</span>
    <input
      type="number"
      min="0"
      max="20"
      [ngModel]="$any(s).strokeWidth"
      (ngModelChange)="onStrokeWidthChange($event)"
    />
  </label>
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/properties/figure-properties.component.ts src/app/editor/properties/figure-properties.component.html
git commit -m "feat(editor): add FigurePropertiesComponent (rect/circle/triangle/image)"
```

---

## Task 7: Create `LinePropertiesComponent`

**Files:**
- Create: `src/app/editor/properties/line-properties.component.ts`
- Create: `src/app/editor/properties/line-properties.component.html`

**Interfaces:**
- Consumes: `LabelDocumentService.selection()`; switches on `'line'`.
- Produces: writes length/stroke/strokeWidth via `doc.updateElement`.

- [ ] **Step 1: Create the TS file**

```ts
// src/app/editor/properties/line-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-line-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './line-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    return sel?.type === 'line' ? sel : null;
  });

  protected onLengthChange(px: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { length: Number(px) } as any);
  }

  protected onStrokeChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { stroke: color } as any);
  }

  protected onStrokeNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { stroke: noneChecked ? '' : '#000000' } as any);
  }

  protected onStrokeWidthChange(width: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { strokeWidth: Number(width) } as any);
  }
}
```

- [ ] **Step 2: Create the HTML file**

```html
<!-- src/app/editor/properties/line-properties.component.html -->
@let s = state();
@if (s) {
  <label>
    <span>Length</span>
    <input
      type="number"
      min="1"
      [ngModel]="$any(s).length"
      (ngModelChange)="onLengthChange($event)"
    />
  </label>

  <label>
    <span>Stroke</span>
    <div class="color-input-row">
      <label class="checkbox-label">
        <input
          type="checkbox"
          [checked]="!$any(s).stroke"
          (change)="onStrokeNoneToggle($any($event.target).checked)"
        />
        <span>None</span>
      </label>
      <input
        type="color"
        [ngModel]="$any(s).stroke"
        (ngModelChange)="onStrokeChange($event)"
        [disabled]="!$any(s).stroke"
      />
    </div>
  </label>

  <label>
    <span>Stroke Width</span>
    <input
      type="number"
      min="0"
      max="20"
      [ngModel]="$any(s).strokeWidth"
      (ngModelChange)="onStrokeWidthChange($event)"
    />
  </label>
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/properties/line-properties.component.ts src/app/editor/properties/line-properties.component.html
git commit -m "feat(editor): add LinePropertiesComponent (length + stroke)"
```

---

## Task 8: Create `TextPropertiesComponent`

**Files:**
- Create: `src/app/editor/properties/text-properties.component.ts`
- Create: `src/app/editor/properties/text-properties.component.html`

**Interfaces:**
- Consumes: `LabelDocumentService.selection()`; switches on `'text'`.
- Produces: writes color/fontFamily/fontSize/fontWeight/fontStyle/textDecoration/textAlign via `doc.updateElement`.

- [ ] **Step 1: Create the TS file**

```ts
// src/app/editor/properties/text-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-text-properties',
  standalone: true,
  imports: [CommonModule, FormsModule, NzIconModule],
  templateUrl: './text-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextPropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    return sel?.type === 'text' ? sel : null;
  });

  protected onColorChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { color } as any);
  }

  protected onColorNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { color: noneChecked ? '' : '#000000' } as any);
  }

  protected onFontFamilyChange(family: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { fontFamily: family } as any);
  }

  protected onFontSizeChange(size: number): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { fontSize: Number(size) } as any);
  }

  protected onBoldToggle(): void {
    const sel = this.state();
    if (!sel) return;
    const cur = $any(sel).fontWeight === 'bold' ? 'normal' : 'bold';
    this.doc.updateElement(sel.id, { fontWeight: cur } as any);
  }

  protected onItalicToggle(): void {
    const sel = this.state();
    if (!sel) return;
    const cur = $any(sel).fontStyle === 'italic' ? 'normal' : 'italic';
    this.doc.updateElement(sel.id, { fontStyle: cur } as any);
  }

  protected onUnderlineToggle(): void {
    const sel = this.state();
    if (!sel) return;
    const cur = ($any(sel).textDecoration ?? '').includes('underline') ? '' : 'underline';
    this.doc.updateElement(sel.id, { textDecoration: cur } as any);
  }

  protected onAlignChange(align: 'left' | 'center' | 'right'): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { textAlign: align } as any);
  }
}
```

- [ ] **Step 2: Create the HTML file**

```html
<!-- src/app/editor/properties/text-properties.component.html -->
@let s = state();
@if (s) {
  <label>
    <span>Color</span>
    <div class="color-input-row">
      <label class="checkbox-label">
        <input
          type="checkbox"
          [checked]="!$any(s).color"
          (change)="onColorNoneToggle($any($event.target).checked)"
        />
        <span>None</span>
      </label>
      <input
        type="color"
        [ngModel]="$any(s).color"
        (ngModelChange)="onColorChange($event)"
        [disabled]="!$any(s).color"
      />
    </div>
  </label>

  <label>
    <span>Font Family</span>
    <select
      [ngModel]="$any(s).fontFamily"
      (ngModelChange)="onFontFamilyChange($event)"
    >
      <option value="Liberation Sans">Liberation Sans</option>
      <option value="Noto Sans SC">Noto Sans SC</option>
    </select>
  </label>

  <label>
    <span>Font Size</span>
    <input
      type="number"
      min="8"
      [ngModel]="$any(s).fontSize"
      (ngModelChange)="onFontSizeChange($event)"
    />
  </label>

  <div class="text-style-row">
    <button
      type="button"
      class="icon-button"
      [class.active]="$any(s).fontWeight === 'bold'"
      (click)="onBoldToggle()"
      title="Bold"
    >
      <span nz-icon nzType="bold" nzTheme="outline"></span>
    </button>
    <button
      type="button"
      class="icon-button"
      [class.active]="$any(s).fontStyle === 'italic'"
      (click)="onItalicToggle()"
      title="Italic"
    >
      <span nz-icon nzType="italic" nzTheme="outline"></span>
    </button>
    <button
      type="button"
      class="icon-button"
      [class.active]="($any(s).textDecoration ?? '').includes('underline')"
      (click)="onUnderlineToggle()"
      title="Underline"
    >
      <span nz-icon nzType="underline" nzTheme="outline"></span>
    </button>
    <button
      type="button"
      class="icon-button"
      [class.active]="$any(s).textAlign === 'left'"
      (click)="onAlignChange('left')"
      title="Align Left"
    >
      <span nz-icon nzType="align-left" nzTheme="outline"></span>
    </button>
    <button
      type="button"
      class="icon-button"
      [class.active]="$any(s).textAlign === 'center'"
      (click)="onAlignChange('center')"
      title="Align Center"
    >
      <span nz-icon nzType="align-center" nzTheme="outline"></span>
    </button>
    <button
      type="button"
      class="icon-button"
      [class.active]="$any(s).textAlign === 'right'"
      (click)="onAlignChange('right')"
      title="Align Right"
    >
      <span nz-icon nzType="align-right" nzTheme="outline"></span>
    </button>
  </div>
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/properties/text-properties.component.ts src/app/editor/properties/text-properties.component.html
git commit -m "feat(editor): add TextPropertiesComponent (color/font/style/align)"
```

---

## Task 9: Create `BarcodePropertiesComponent`

**Files:**
- Create: `src/app/editor/properties/barcode-properties.component.ts`
- Create: `src/app/editor/properties/barcode-properties.component.html`

**Interfaces:**
- Consumes: `LabelDocumentService.selection()`; switches on `'barcode'`.
- Produces: writes barcodeFormat/text/showText via `doc.updateElement`.

- [ ] **Step 1: Create the TS file**

```ts
// src/app/editor/properties/barcode-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-barcode-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './barcode-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarcodePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    return sel?.type === 'barcode' ? sel : null;
  });

  protected onFormatChange(format: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { barcodeFormat: format } as any);
  }

  protected onTextChange(text: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { text } as any);
  }

  protected onShowTextChange(show: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { showText: !!show } as any);
  }
}
```

- [ ] **Step 2: Create the HTML file**

```html
<!-- src/app/editor/properties/barcode-properties.component.html -->
@let s = state();
@if (s) {
  <label>
    <span>Barcode Format</span>
    <select
      [ngModel]="$any(s).barcodeFormat"
      (ngModelChange)="onFormatChange($event)"
    >
      <option value="CODE128">CODE128</option>
      <option value="EAN13">EAN-13</option>
      <option value="CODE39">CODE39</option>
    </select>
  </label>
  <label>
    <span>Value</span>
    <input
      type="text"
      [ngModel]="$any(s).text"
      (ngModelChange)="onTextChange($event)"
    />
  </label>
  <label class="checkbox-label">
    <input
      type="checkbox"
      [ngModel]="$any(s).showText"
      (ngModelChange)="onShowTextChange($event)"
    />
    <span>Show Text</span>
  </label>
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/properties/barcode-properties.component.ts src/app/editor/properties/barcode-properties.component.html
git commit -m "feat(editor): add BarcodePropertiesComponent (format/value/showText)"
```

---

## Task 10: Create `QrcodePropertiesComponent`

**Files:**
- Create: `src/app/editor/properties/qrcode-properties.component.ts`
- Create: `src/app/editor/properties/qrcode-properties.component.html`

**Interfaces:**
- Consumes: `LabelDocumentService.selection()`; switches on `'qrcode'`.
- Produces: writes text/foregroundColor/backgroundColor/errorCorrectionLevel via `doc.updateElement`.

- [ ] **Step 1: Create the TS file**

```ts
// src/app/editor/properties/qrcode-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-qrcode-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './qrcode-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrcodePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    return sel?.type === 'qrcode' ? sel : null;
  });

  protected onTextChange(text: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { text } as any);
  }

  protected onForegroundChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { foregroundColor: color } as any);
  }

  protected onForegroundNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { foregroundColor: noneChecked ? '' : '#000000' } as any);
  }

  protected onBackgroundChange(color: string): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { backgroundColor: color } as any);
  }

  protected onBackgroundNoneToggle(noneChecked: boolean): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { backgroundColor: noneChecked ? '' : '#ffffff' } as any);
  }

  protected onErrorCorrectionChange(level: 'L' | 'M' | 'Q' | 'H'): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, { errorCorrectionLevel: level } as any);
  }
}
```

- [ ] **Step 2: Create the HTML file**

```html
<!-- src/app/editor/properties/qrcode-properties.component.html -->
@let s = state();
@if (s) {
  <label>
    <span>Value</span>
    <input
      type="text"
      [ngModel]="$any(s).text"
      (ngModelChange)="onTextChange($event)"
    />
  </label>

  <label>
    <span>Foreground</span>
    <div class="color-input-row">
      <label class="checkbox-label">
        <input
          type="checkbox"
          [checked]="!$any(s).foregroundColor"
          (change)="onForegroundNoneToggle($any($event.target).checked)"
        />
        <span>None</span>
      </label>
      <input
        type="color"
        [ngModel]="$any(s).foregroundColor"
        (ngModelChange)="onForegroundChange($event)"
        [disabled]="!$any(s).foregroundColor"
      />
    </div>
  </label>

  <label>
    <span>Background</span>
    <div class="color-input-row">
      <label class="checkbox-label">
        <input
          type="checkbox"
          [checked]="!$any(s).backgroundColor"
          (change)="onBackgroundNoneToggle($any($event.target).checked)"
        />
        <span>None</span>
      </label>
      <input
        type="color"
        [ngModel]="$any(s).backgroundColor"
        (ngModelChange)="onBackgroundChange($event)"
        [disabled]="!$any(s).backgroundColor"
      />
    </div>
  </label>

  <label>
    <span>Error Correction</span>
    <select
      [ngModel]="$any(s).errorCorrectionLevel"
      (ngModelChange)="onErrorCorrectionChange($event)"
    >
      <option value="L">Low (L)</option>
      <option value="M">Medium (M)</option>
      <option value="Q">Quartile (Q)</option>
      <option value="H">High (H)</option>
    </select>
  </label>
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/properties/qrcode-properties.component.ts src/app/editor/properties/qrcode-properties.component.html
git commit -m "feat(editor): add QrcodePropertiesComponent (value/colors/ecLevel)"
```

---

## Task 11: Create `JsonPreviewComponent`

**Files:**
- Create: `src/app/editor/properties/json-preview.component.ts`
- Create: `src/app/editor/properties/json-preview.component.html`

**Interfaces:**
- Consumes: `LabelDocumentService.selectionId()`; `EditorCanvasService.revision()` (to react to canvas-only changes); `EditorCanvasService.toCanvasJson()` — new method introduced in Task 13.
- Produces: filtered JSON string.

- [ ] **Step 1: Create the TS file**

```ts
// src/app/editor/properties/json-preview.component.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EditorCanvasService } from '../editor-canvas.service';
import { LabelDocumentService } from '../document';

/**
 * JSON preview pane. Subscribes to two sources:
 *  - the document's selectionId (filters by id when set);
 *  - the canvas revision signal (re-renders on any canvas-only change,
 *    e.g. async image render completion that doesn't go through the document).
 *
 * Source of truth for serializable shape is `canvas.toCanvasJson()` — the
 * Fabric `toJSON()` projection — so what the user sees matches what's saved
 * to `Label.canvasJson`.
 */
@Component({
  selector: 'app-json-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-preview.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonPreviewComponent {
  private doc = inject(LabelDocumentService);
  private canvas = inject(EditorCanvasService);

  protected readonly preview = computed(() => {
    // Subscribe to revision so async-only canvas updates also refresh us.
    this.canvas.revision();

    const full = this.canvas.toCanvasJson() ?? {};
    const id = this.doc.selectionId();
    if (!id) {
      return JSON.stringify(full, null, 2);
    }

    const objects = (full as { objects?: Array<{ id?: string }> }).objects ?? [];
    const one = objects.find((o) => o?.id === id);
    if (!one) {
      // Selection stale (object removed). Fall back to full.
      return JSON.stringify(full, null, 2);
    }

    const filtered = {
      background: (full as { background?: unknown }).background,
      width: (full as { width?: unknown }).width,
      height: (full as { height?: unknown }).height,
      objects: [one],
    };
    return JSON.stringify(filtered, null, 2);
  });
}
```

- [ ] **Step 2: Create the HTML file**

```html
<!-- src/app/editor/properties/json-preview.component.html -->
<pre>{{ preview() }}</pre>
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: `toCanvasJson` is not yet defined on `EditorCanvasService`. Add the public method as part of Task 13. For now, this should produce a *expected* error: `Property 'toCanvasJson' does not exist`. Skip this type-check and proceed to Task 13 which will add the method.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/properties/json-preview.component.ts src/app/editor/properties/json-preview.component.html
git commit -m "feat(editor): add JsonPreviewComponent (filters by selectionId)"
```

---

## Task 12: Create `PropertiesPanelComponent` shell

**Files:**
- Create: `src/app/editor/properties/properties-panel.component.ts`
- Create: `src/app/editor/properties/properties-panel.component.html`

**Interfaces:**
- Consumes: `LabelDocumentService.selection()` for the type-router.
- Produces: composes page + common + figure/line/text/barcode/qrcode + json-preview in a fixed layout.

- [ ] **Step 1: Copy shared SCSS rules from the existing file**

Open `src/app/editor/editor-properties-panel.scss` and copy its contents verbatim into `src/app/editor/properties/properties-panel.component.scss` (replacing the placeholder from Task 3). Do not delete the source yet — Task 18 handles deletion.

```scss
/* src/app/editor/properties/properties-panel.component.scss */
/* Contents copied verbatim from src/app/editor/editor-properties-panel.scss
   on 2026-07-19. The original file is deleted in Task 18. */

.right-rail { /* …existing rules… */ }
.rail-panel { /* … */ }
.property-stack { /* … */ }
.inline-row { /* … */ }
.color-input-row { /* … */ }
.text-style-row { /* … */ }
.checkbox-label { /* … */ }
.bg-preview { /* … */ }
.json-panel pre { /* … */ }
.muted { /* … */ }
.icon-button { /* … */ }
.icon-button.active { /* … */ }

@media (max-width: 1180px) { /* … */ }
```

(The reviewer should pull the existing rules directly from `editor-properties-panel.scss` — they are not reproduced here because they are byte-identical to the existing file. Do not modify any rule during the copy.)

- [ ] **Step 2: Create the TS file**

```ts
// src/app/editor/properties/properties-panel.component.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabelDocumentService } from '../document';
import { CommonPropertiesComponent } from './common-properties.component';
import { FigurePropertiesComponent } from './figure-properties.component';
import { LinePropertiesComponent } from './line-properties.component';
import { TextPropertiesComponent } from './text-properties.component';
import { BarcodePropertiesComponent } from './barcode-properties.component';
import { QrcodePropertiesComponent } from './qrcode-properties.component';
import { PagePropertiesComponent } from './page-properties.component';
import { JsonPreviewComponent } from './json-preview.component';

/**
 * Shell for the right-rail properties pane. Owns no editing state —
 * sub-panels inject `LabelDocumentService` directly. The shell's only
 * responsibility is the type-router: pick which sub-panel to show for the
 * currently selected element's type.
 */
@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [
    CommonModule,
    CommonPropertiesComponent,
    FigurePropertiesComponent,
    LinePropertiesComponent,
    TextPropertiesComponent,
    BarcodePropertiesComponent,
    QrcodePropertiesComponent,
    PagePropertiesComponent,
    JsonPreviewComponent,
  ],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesPanelComponent {
  protected doc = inject(LabelDocumentService);
}
```

- [ ] **Step 3: Create the HTML file**

```html
<!-- src/app/editor/properties/properties-panel.component.html -->
<aside class="right-rail">
  <section class="rail-panel">
    <h2>标签属性</h2>
    <app-page-properties />
  </section>

  <section class="rail-panel">
    <h2>元素属性</h2>
    @let sel = doc.selection();
    @if (!sel) {
      <p class="muted">Select an object on the canvas to edit its properties.</p>
    } @else {
      <div class="property-stack">
        <app-common-properties />
        @switch (sel.type) {
          @case ('text')     { <app-text-properties /> }
          @case ('barcode')  { <app-barcode-properties /> }
          @case ('qrcode')   { <app-qrcode-properties /> }
          @case ('line')     { <app-line-properties /> }
          @default           { <app-figure-properties /> }
        }
      </div>
    }
  </section>

  <section class="rail-panel json-panel">
    <h2>标签数据</h2>
    <app-json-preview />
  </section>
</aside>
```

- [ ] **Step 4: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: still errors related to `toCanvasJson` (introduced in Task 11, fixed in Task 13). All other files type-check.

- [ ] **Step 5: Commit**

```bash
git add src/app/editor/properties/properties-panel.component.ts src/app/editor/properties/properties-panel.component.html src/app/editor/properties/properties-panel.component.scss
git commit -m "feat(editor): add PropertiesPanelComponent shell with type router"
```

---

## Task 13: Add `EditorCanvasService.toCanvasJson()` and inject `LabelDocumentService`

**Files:**
- Modify: `src/app/editor/editor-canvas.service.ts`

**Interfaces:**
- Produces:
  - new constructor parameter `private doc: LabelDocumentService`
  - new public method `toCanvasJson(): Record<string, unknown> | null`
- Consumes (later): `LabelDocumentService.elements()`, `LabelDocumentService.page()` via `effect()` in Task 14.

- [ ] **Step 1: Add the import and inject `LabelDocumentService` in the constructor**

Open `src/app/editor/editor-canvas.service.ts`. Add this import near the top:

```ts
import { LabelDocumentService } from './document';
```

In the `constructor` (the existing constructor — do not duplicate), add the private field via parameter property:

```ts
constructor(
  // …existing parameters…
  private doc: LabelDocumentService,
) {}
```

If the existing constructor uses field initializers (`private foo = inject(...)`), prefer that style:

```ts
private doc = inject(LabelDocumentService);
```

(Use whichever style the existing constructor already uses — match the file's idiom.)

- [ ] **Step 2: Add the public `toCanvasJson()` method**

Insert this method alongside the other public accessors on the service:

```ts
/**
 * Returns the Fabric canvas's serializable JSON projection (plain object).
 * Returns `null` when the Fabric canvas has not yet been initialised.
 *
 * Consumers (e.g. the JSON preview pane) read this directly instead of
 * subscribing to a `jsonPreview` signal, so the projection is computed
 * on-demand and not pushed to every subscriber.
 */
toCanvasJson(): Record<string, unknown> | null {
  if (!this.canvas) return null;
  return this.canvas.toJSON() as unknown as Record<string, unknown>;
}
```

- [ ] **Step 3: Remove the existing `jsonPreview` signal and its writes**

In `editor-canvas.service.ts`:

1. Delete the field declaration: `readonly jsonPreview = signal('');` (line ~22).
2. Find every `this.jsonPreview.set(...)` call and delete the line. Current locations (per spec): lines 70, 104, 123, 144, 337, 471, 1472 — only the line in `touchRevision` (1472) is the live one in the current revision; the others are referenced in the spec because they were earlier revisions. Audit by searching `grep -n 'jsonPreview' editor-canvas.service.ts` and remove every match.
3. Delete the import of `signal` if it becomes unused (only if no other signal lives in the service — likely keep it because `revision`, `zoom`, etc. still need it).

- [ ] **Step 4: Provide `LabelDocumentService` at the editor level**

Open `src/app/editor/editor.ts`. In the `@Component` decorator, add `LabelDocumentService` to the `providers` array:

```ts
import { LabelDocumentService } from './document';

@Component({
  // …existing config…
  providers: [EditorCanvasService, LabelDocumentService],
  // …
})
```

- [ ] **Step 5: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors. (The `LabelDocumentService` injection succeeds; `toCanvasJson` resolves in `JsonPreviewComponent`; `jsonPreview` references are gone.)

- [ ] **Step 6: Commit**

```bash
git add src/app/editor/editor-canvas.service.ts src/app/editor/editor.ts
git commit -m "feat(editor): expose toCanvasJson; inject LabelDocumentService; drop jsonPreview signal"
```

---

## Task 14: Wire `EditorCanvasService` ↔ `LabelDocumentService` effects with cycle guards

**Files:**
- Modify: `src/app/editor/editor-canvas.service.ts`

**Interfaces:**
- Produces:
  - `isApplyingFromDoc: boolean` private flag on the canvas service.
  - Two new `effect()`s in the constructor that sync Fabric from `doc.elements()` and `doc.page()`.
  - New writes inside Fabric event handlers (`handleSelection`, `handleObjectModified`, etc.) that call `doc.updateElement` / `doc.selectElement` instead of mutating internal Fabric state.

- [ ] **Step 1: Add the `isApplyingFromDoc` flag**

In `editor-canvas.service.ts`, add a private field (alongside other private fields):

```ts
/**
 * Set to true while we are applying a `LabelDocument` change to Fabric.
 * While true, our own `object:modified` / `selection:created` events are
 * ignored — they are echoes of a doc-driven update, not user input.
 */
private isApplyingFromDoc = false;
```

- [ ] **Step 2: Add the document → Fabric effects in the constructor**

Add the following `effect()`s in the existing constructor (after the field initializers and `inject(...)` calls):

```ts
import { effect, untracked } from '@angular/core';

constructor(/* … */) {
  // …existing init…

  // document → fabric: re-render elements when the document changes.
  effect(() => {
    const elements = this.doc.elements();
    untracked(() => this.applyElementsFromDoc(elements));
  });

  // document → fabric: re-render canvas (size, background) when page changes.
  effect(() => {
    const page = this.doc.page();
    untracked(() => this.applyPageFromDoc(page));
  });
}
```

Add the two private sync methods on the service:

```ts
private applyElementsFromDoc(elements: ReadonlyMap<string, LabelElement>): void {
  if (!this.canvas) return;
  this.isApplyingFromDoc = true;
  try {
    // Compare against the current Fabric objects and reconcile. For the
    // initial wiring, do a coarse sync: re-add/update/remove Fabric
    // objects whose ids differ from the document map.
    //
    // Implementation note: build a Map<id, FabricObject> from the canvas's
    // current objects (each has `id` from ElementFactory.fromFabricObject),
    // then for each (id, data) in the document, either update the existing
    // Fabric object's properties or remove it if absent from the doc.
    //
    // The full reconciliation is large and out of scope for this task —
    // this is the integration point. Track the rest as a follow-up.
  } finally {
    this.isApplyingFromDoc = false;
  }
}

private applyPageFromDoc(page: LabelPageSettings): void {
  if (!this.canvas) return;
  this.isApplyingFromDoc = true;
  try {
    // Update canvas dimensions (px) and background color/image. Mirrors
    // the legacy logic in editor.ts:83-93 + editor-canvas.service.ts
    // setCanvasBackground methods.
    const wPx = Math.round(page.widthMm * PX_PER_MM);
    const hPx = Math.round(page.heightMm * PX_PER_MM);
    this.canvas.setDimensions({ width: wPx, height: hPx });
    if (page.backgroundColor) {
      this.canvas.backgroundColor = page.backgroundColor;
    } else {
      this.canvas.backgroundColor = '';
    }
    this.canvas.requestRenderAll();
  } finally {
    this.isApplyingFromDoc = false;
  }
}
```

`applyElementsFromDoc` is intentionally a coarse scaffold in this task — the fine-grained reconciliation (driven by `ElementFactory.fromFabricObject` and the per-element `updateElement` paths) is wired through subsequent tasks (15-17). The structure (the effect + guard + try/finally) is what this task delivers.

- [ ] **Step 3: Wire Fabric event handlers to write back to the document**

Locate Fabric event handlers in `editor-canvas.service.ts` (search for `canvas.on(` and `handleObject*`). For each handler that today mutates an internal Fabric-only signal (`selected`, `textEditorVisible`, etc.) or property, redirect the write into the document:

- `handleSelection(obj)` → `this.doc.selectElement(obj?.id ?? null)` (instead of `this.selected.set(...)`).
- `handleObjectModified(obj)` → `this.doc.updateElement(obj.id, { x: obj.left, y: obj.top, width, height, rotation: obj.angle, opacity: obj.opacity, ... } as any)`.
- For `setSelection*` methods that today mutate Fabric directly, replace the Fabric-side `set()` call with `this.doc.updateElement(id, patch)` — the document → fabric effect (with its own guard) will write the change back to Fabric.

Each handler should set `this.isApplyingFromDoc = true` only if it is reading from the document, not when it is *writing* to the document from a Fabric event. The flag exists to break the document→fabric→document loop, so only the *apply* side sets it.

- [ ] **Step 4: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors. (`LabelElement`, `LabelPageSettings`, `PX_PER_MM` already exist.)

- [ ] **Step 5: Manual smoke check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npm start`
Expected: dev server starts on `http://localhost:4200`. Open it, click the **square** tool, then click the canvas — a rect appears. Click the rect again — it shows selection handles. (We are not yet on the new property panel; the page wiring lands in Task 15. The point of this smoke check is to confirm that adding `LabelDocumentService` did not crash the existing canvas.)

- [ ] **Step 6: Commit**

```bash
git add src/app/editor/editor-canvas.service.ts
git commit -m "feat(editor): wire LabelDocumentService ↔ EditorCanvasService effects with cycle guards"
```

---

## Task 15: Switch `editor.html` to use the new shell and drop the old panel

**Files:**
- Modify: `src/app/editor/editor.ts`
- Modify: `src/app/editor/editor.html`
- Modify: `src/app/editor/properties/properties-panel.component.ts` (final imports update)

**Interfaces:**
- Produces: `<app-properties-panel>` replaces `<app-editor-properties-panel>`. The 22 `(*Changed)="..."` event bindings on the old shell disappear — sub-panels call `LabelDocumentService` directly.

- [ ] **Step 1: Update `editor.html`**

Replace the entire block hosting `<app-editor-properties-panel>` with a single tag. Open `src/app/editor/editor.html` and replace (line ranges from the spec — audit with `grep -n 'app-editor-properties-panel' editor.html`):

```html
<!-- before -->
<app-editor-properties-panel
  [canvasState]="canvasState()"
  [selectionState]="selectionState()"
  [textEditorVisible]="textEditorVisible()"
  [figureEditorVisible]="figureEditorVisible()"
  [propsPanelVisible]="propsPanelVisible()"
  [jsonPreview]="jsonPreview()"
  (canvasFillChanged)="updateCanvasFill($event)"
  (canvasImageChanged)="updateCanvasImage($event)"
  (pageSizeChanged)="updatePageSize($event)"
  (canvasSizeChanged)="updateCanvasSize($event)"
  (idChanged)="updateSelectionId($event)"
  (opacityChanged)="updateSelectionOpacity($event)"
  (widthChanged)="updateSelectionWidth($event)"
  (heightChanged)="updateSelectionHeight($event)"
  (lengthChanged)="updateSelectionLength($event)"
  (fillChanged)="updateSelectionFill($event)"
  (strokeChanged)="updateSelectionStroke($event)"
  (strokeWidthChanged)="updateSelectionStrokeWidth($event)"
  (fontFamilyChanged)="updateSelectionFontFamily($event)"
  (boldToggled)="toggleSelectionBold()"
  (italicToggled)="toggleSelectionItalic()"
  (textDecorationToggled)="toggleSelectionTextDecoration($event)"
  (fontSizeChanged)="updateSelectionFontSize($event)"
  (textChanged)="updateSelectionText($event)"
  (colorChanged)="updateSelectionColor($event)"
  (barcodeFormatChanged)="updateSelectionBarcodeFormat($event)"
  (barcodeShowTextChanged)="updateSelectionShowText($event)"
  (errorCorrectionLevelChanged)="updateSelectionErrorCorrectionLevel($event)"
  (foregroundColorChanged)="updateSelectionForegroundColor($event)"
  (backgroundColorChanged)="updateSelectionBackgroundColor($event)"
  (textAlignChanged)="updateSelectionTextAlign($event)"
  (verticalAlignChanged)="noop()"
></app-editor-properties-panel>

<!-- after -->
<app-properties-panel></app-properties-panel>
```

- [ ] **Step 2: Remove the now-unused signal/event wiring in `editor.ts`**

Delete from `editor.ts`:
- the `selectionState`, `canvasState`, `propsPanelVisible`, `textEditorVisible`, `figureEditorVisible`, `jsonPreview` signal/computed declarations;
- the `effect()` that syncs `selectionState` from `canvasService.selected()`;
- the 22 `updateSelection*` / `toggleSelection*` / `updateCanvas*` handler methods;
- the `noop` helper.

(Keep `isDirty` and the `effect()` that watches `revision`.)

Keep the import of `EditorPropertiesPanelComponent` removed; add `PropertiesPanelComponent` from `./properties/properties-panel.component`.

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors. (Unused imports may trigger warnings but not errors.)

- [ ] **Step 4: Manual smoke check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npm start`
Expected: dev server loads the editor. The right rail shows three sections (page / element / JSON). Selecting an element shows the right sub-panel (figure / text / etc.). Editing a property in the panel updates the canvas. Editing the canvas updates the panel values. The JSON preview shows the full canvas when nothing is selected, and just the selected element's JSON when one is selected.

- [ ] **Step 5: Commit**

```bash
git add src/app/editor/editor.ts src/app/editor/editor.html
git commit -m "refactor(editor): switch host to PropertiesPanelComponent; drop old signal wiring"
```

---

## Task 16: Delete the old `editor-properties-panel` files

**Files:**
- Delete: `src/app/editor/editor-properties-panel.ts`
- Delete: `src/app/editor/editor-properties-panel.html`
- Delete: `src/app/editor/editor-properties-panel.scss`

**Interfaces:**
- Produces: no new code; removes the old monolithic panel.

- [ ] **Step 1: Verify nothing references the old selector**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && grep -rn "app-editor-properties-panel\|EditorPropertiesPanelComponent" src/`
Expected: no matches. (Task 15 removed the last reference.)

- [ ] **Step 2: Delete the files**

```bash
cd /Users/rococo/Documents/02Project/hidan/src/label-creator
git rm src/app/editor/editor-properties-panel.ts
git rm src/app/editor/editor-properties-panel.html
git rm src/app/editor/editor-properties-panel.scss
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npm start`
Expected: editor loads and behaves identically to Task 15. (This is a deletion-only task — should be a no-op visually.)

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(editor): delete obsolete editor-properties-panel files"
```

---

## Task 17: Verify save/load round-trip preserves `canvasJson`

**Files:**
- Read: `src/app/editor/editor.ts` (locate the save handler)
- Read: `src/app/editor/template/template.storage.ts` (locate the save/load flow)
- Possibly modify `editor-canvas.service.ts` if the persistence flow needs `LabelDocumentService.toLabel()` integration.

**Interfaces:**
- Produces: a manual verification that a label saved before the refactor can still be loaded, and a label saved after the refactor can be reloaded with identical properties.

- [ ] **Step 1: Locate the save path**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && grep -rn "canvasJson\|LabelTemplate" src/app/editor/ | grep -v "node_modules" | head -30`
Expected: shows where the canvas is serialized to `Label.canvasJson` and where it is re-hydrated.

- [ ] **Step 2: If the existing save path reads from `canvas.toJSON()` directly**

Today `editor-canvas.service.ts` exposes `canvasJson` via `canvas.toJSON()`. Since `LabelDocumentService` is the new owner of `page` and `elements`, ideally the save path would call `doc.toLabel()` for the page fields and still call `canvas.toJSON()` for `canvasJson`. Audit `template.storage.ts` and `editor.ts` to confirm that the save call site reads `template.label.canvasJson` from the canvas and merges in the page fields from `template.label` — and that this is unchanged by the refactor (the document service does not need to intervene in the save path *for this iteration*).

If the audit shows that today's save path only writes page fields from `LabelDocument` and `canvasJson` from the canvas, **no code change is needed in this task**. The wire format is preserved.

- [ ] **Step 3: If `LabelDocumentService.toLabel()` IS needed**

Implement it:

```ts
// label-document.service.ts
toLabel(): Label {
  return {
    id: 'runtime', // assigned by the storage layer on save
    widthMm: this.page().widthMm,
    heightMm: this.page().heightMm,
    backgroundColor: this.page().backgroundColor,
    backgroundImage: this.page().backgroundImage,
    canvasJson: '', // populated by the canvas adapter
  };
}
```

The save path then merges `doc.toLabel()` with `canvas.toJSON()` to build the persisted `Label`. (Implementation depends on the actual save-site structure; the implementer adapts this skeleton to fit.)

- [ ] **Step 4: Manual round-trip test**

1. Run `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npm start`.
2. Create a label with one of each element type; configure each.
3. Save the template (the existing UI button).
4. Reload the saved template.
5. Confirm each element appears with its prior properties.
6. Compare the loaded `canvasJson` to the saved one — they should be byte-identical (modulo Fabric's `toJSON` ordering).

- [ ] **Step 5: Commit (only if Step 3 produced code)**

```bash
git add src/app/editor/document/label-document.service.ts src/app/editor/editor.ts src/app/editor/template/template.storage.ts src/app/editor/editor-canvas.service.ts
git commit -m "feat(editor): wire LabelDocumentService.toLabel into save/load (if needed)"
```

If Step 3 produced no code, skip this commit and document in the PR description that no save/load change was required.

---

## Task 18: Final cleanup — prettier, dead-code scan, manual full-flow verification

**Files:**
- Possibly modify: any file touched by the refactor (formatting only)

**Interfaces:**
- Produces: clean diff, no console errors or warnings in the running app.

- [ ] **Step 1: Run prettier**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx prettier --write "src/app/editor/{document,properties}/**/*.{ts,html,scss}" src/app/editor/{editor.ts,editor.html,editor-canvas.service.ts}`
Expected: prettier reformats files as needed. Review the diff to confirm the changes are formatting-only.

- [ ] **Step 2: Dead-code scan**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && grep -rn "verticalAlignChanged\|EditorPropertiesPanelComponent\|editor-properties-panel" src/`
Expected: no matches. (All references removed in Tasks 15 and 16.)

- [ ] **Step 3: Build the production bundle**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npm run build`
Expected: build succeeds with no errors. Warnings are acceptable but should be reviewed.

- [ ] **Step 4: Full-flow manual verification**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npm start` and exercise:
1. Add one of each element type (rect, circle, triangle, line, text, barcode, qrcode, image).
2. For each: change every property in its sub-panel — observe the canvas updates.
3. For each: drag/resize/rotate on the canvas — observe the panel numbers update.
4. Switch selection between elements — observe the sub-panel swaps and JSON preview filters.
5. Change the page size, page background color, and page background image — observe canvas updates.
6. Save and reload — observe everything is preserved.

- [ ] **Step 5: Commit (formatting only)**

```bash
git add -u
git commit -m "style(editor): apply prettier to refactored files"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| `LabelDocument` types | 1 |
| `LabelDocumentService` (signals + mutations + selectors) | 2 |
| Shared SCSS scaffold | 3, 12 (copy) |
| CommonPropertiesComponent (id + opacity) | 4 |
| PagePropertiesComponent (page size, bg, image) | 5 |
| FigurePropertiesComponent (rect/circle/triangle/image) | 6 |
| LinePropertiesComponent (length + stroke) | 7 |
| TextPropertiesComponent (color/font/style/align) | 8 |
| BarcodePropertiesComponent (format/value/showText) | 9 |
| QrcodePropertiesComponent (value/colors/ecLevel) | 10 |
| JsonPreviewComponent (filters by selectionId) | 11 |
| PropertiesPanelComponent shell with @switch router | 12 |
| `EditorCanvasService.toCanvasJson()` + inject `LabelDocumentService` | 13 |
| Two-way sync effects with `isApplyingFromDoc` guard | 14 |
| Host binding update (`<app-properties-panel>`) | 15 |
| Delete old files | 16 |
| Save/load round-trip preservation | 17 |
| Prettier + final verification | 18 |
| Drop `verticalAlignChanged` dead wire | 15 |
| Drop `EditorCanvasService.jsonPreview` signal | 13 |

All spec requirements are covered.

### Placeholder scan

No "TBD"/"TODO"/"fill in"/"similar to" placeholders in the plan. The one place that says "implementation note: …" (Task 14, Step 2) is a design note for `applyElementsFromDoc`, not a placeholder — the task explicitly scopes the reconciliation to a follow-up; the *structure* (effect + guard + try/finally + isApplyingFromDoc) is what this task delivers.

### Type consistency

- `LabelDocumentService`: declared in Task 2; `selection`, `selectionProperties`, `updateElement`, etc. all match the spec exactly.
- `LabelDocument.elements`: `ReadonlyMap<string, LabelElement>` — used identically in Tasks 2, 11, 14.
- `applyElementsFromDoc(elements: ReadonlyMap<string, LabelElement>)` — matches the signal type.
- `applyPageFromDoc(page: LabelPageSettings)` — matches the signal type.
- `toCanvasJson()` — declared in Task 13, used in Task 11. Consistent.
- `isApplyingFromDoc` — declared in Task 14, Step 1, used in Task 14, Steps 2 and 3. Consistent.
- `doc.selectionId()` — used identically in Tasks 11 and the shell (Task 12).
- All component selectors match the shell's `@switch` and template usage.

No type drift between tasks.

### Risks acknowledged in the plan

- `applyElementsFromDoc` is a coarse scaffold in Task 14; fine-grained reconciliation is the bulk of the wiring and may require additional follow-up. Task 14 explicitly scopes this — the structure is delivered, the full element-by-element sync is the integration point.
- Save/load (Task 17) is conditional — the audit may find that no `toLabel()` change is needed.