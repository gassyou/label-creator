# Editor Properties Panel — LabelDocument Refactor Design

**Date:** 2026-07-19
**Status:** Approved (brainstorming complete)
**Scope:** Split the monolithic `editor-properties-panel` into per-element-type sub-panels and introduce a runtime `LabelDocumentService` as the single source of truth, observed by both the canvas and the property panels via Angular signals + effect.

## Goal

Three intertwined goals:

1. **Modular property panels.** Today `editor-properties-panel.html` is a 396-line single template with seven `@if`-gated blocks for shape/image/barcode/qrcode/line/text/page. Split it into focused sub-components so each element type owns its own property UI.
2. **Single source of truth for the editing state.** Today the editor has state scattered across `EditorComponent.selectionState` (a flat snapshot), `EditorComponent.template`, and `EditorCanvasService.{selected, textEditorVisible, figureEditorVisible, jsonPreview, revision, zoom, ...}`. Introduce one runtime object — `LabelDocument` — owned by `LabelDocumentService`. The canvas, the property panels, and the toolbar all become *observers* of this single object.
3. **Real-time two-way binding via signals.** A user edit in a property panel writes to `LabelDocumentService`; the canvas effect re-renders. A user drag/edit on the canvas updates `LabelDocument` via the canvas event handler; the property panel signals recompute. No manual wiring of `output.emit()` → host handler → service call.

## Non-Goals

- No undo/redo for property edits. (Out of scope — separate concern; existing snapshot-based undo in `EditorCanvasService` is preserved as-is.)
- No wire-format change. `LabelTemplate` / `Label` (the persistence types in `models/label.models.ts`) are byte-compatible with today. `LabelDocument` is the *runtime* model and is serialized to `Label` only on save.
- No replacement of Fabric.js. Fabric remains the renderer; `EditorCanvasService` becomes a thin Fabric adapter around `LabelDocumentService`.
- No component-level inputs/outputs for property edits. Sub-panels inject the service directly. (One-way inputs from host are kept only where they are truly host-owned, e.g. `jsonPreview` formatting flags if needed.)
- No multi-selection panel today. Single-element selection only — matches current behavior.

## Naming & Distinction from Existing Types

The project already has two persistence types:

- `Label` (`models/label.models.ts:37-44`) — the persisted "label" record (`widthMm`, `heightMm`, `backgroundColor`, `backgroundImage`, `canvasJson`).
- `LabelTemplate` (`models/label.models.ts:50-58`) — wraps a `Label` with `printSetting`, `name`, `thumbnail`, timestamps.

The new runtime model is **distinct** from both. We name it:

- **`LabelDocument`** — the in-memory editing document. Holds the same logical fields as `Label` but expressed as signal trees (so consumers can subscribe to fine-grained slices) and **does not** store `canvasJson`. `canvasJson` is produced from `LabelDocument` only when persisting.

This avoids confusion: `Label` and `LabelTemplate` remain the persistence vocabulary; `LabelDocument` is the runtime vocabulary.

## File Layout

```
src/app/editor/
  document/
    label-document.ts                       # LabelDocument + LabelPageSettings types (reuses ElementType/SerializableElement)
    label-document.service.ts               # central service: signals + mutations + selectors
    index.ts                                # barrel

  properties/
    properties-panel.component.ts           # shell: page + element router + json preview
    properties-panel.component.html
    properties-panel.component.scss         # (move from editor-properties-panel.scss; shared selectors)
    page-properties.component.ts/.html      # pageSize, mm W/H, bg color, bg image upload
    common-properties.component.ts/.html    # id + opacity (all types)
    figure-properties.component.ts/.html     # rect/circle/triangle/image: fill + stroke + size + (common)
    line-properties.component.ts/.html      # line: length + stroke + strokeWidth + (common)
    text-properties.component.ts/.html      # text: color/fontFamily/fontSize/style/align + (common)
    barcode-properties.component.ts/.html   # barcode: format/value/showText + (common)
    qrcode-properties.component.ts/.html    # qrcode: value/foreground/background/ecLevel + (common)
    json-preview.component.ts/.html         # JSON preview pane

  editor.html                               # unchanged host binding (just import path update)
  editor.ts                                 # remove selectionState/canvasState signals; delegate to service
  editor-properties-panel.{ts,html,scss}    # DELETED

  editor-canvas.service.ts                  # slimmed: becomes Fabric adapter; reads/writes LabelDocumentService
  models/label.models.ts                    # UNCHANGED (Label, LabelTemplate persist)
  models/editor.models.ts                   # UNCHANGED (EditorSelectionState remains for downstream consumers if any)
  models/element-base.ts                    # UNCHANGED (BaseElement still used by ElementFactory)
  models/element-factory.ts                 # UNCHANGED
  models/{rect,circle,triangle,line,text,barcode,qrcode,image}-element.ts  # UNCHANGED
```

## Core Types

### `LabelDocument`

**Reuse, don't redefine.** The runtime model uses types that already exist in `models/`:

- The element discriminator is the existing `ElementType` (`models/editor.models.ts:53-61`).
- A single element's runtime state is the existing `SerializableElement` (`models/element-base.ts:44-57`) — its `[key: string]: unknown` index signature already covers every kind-specific field (`fill`/`stroke`/`text`/`fontFamily`/`barcodeFormat`/`foregroundColor`/etc.). Concrete subtypes (`RectElementData`, `TextElementData`, …) satisfy it structurally.

We do **not** introduce new `ElementKind` or `ElementState` types. Only one new type is added:

```ts
// document/label-document.ts
import type { ElementType, EditorSelectionState } from '../models/editor.models';
import type { SerializableElement } from '../models/element-base';

/** Runtime page-level settings. */
export interface LabelPageSettings {
  widthMm: number;
  heightMm: number;
  backgroundColor?: string;   // empty string or undefined = none
  backgroundImage?: string;   // data URL
}

/** The runtime editing document. Immutable from outside the service. */
export interface LabelDocument {
  page: LabelPageSettings;
  elements: ReadonlyMap<string, SerializableElement>;
  selectionId: string | null;
}

/** Map an element's ElementType to the property-panel switch key. */
export type ElementKind = ElementType; // semantic alias only; same value set.
```

**Why no separate `ElementState`:** `SerializableElement` already satisfies "an element's runtime state": it carries the common fields (`id`, `type`, `x`, `y`, `width`, `height`, `rotation`, `opacity`, …) plus the open `[key: string]: unknown` bag. Each `*ElementData` interface (e.g. `TextElementData` for text-only fields like `fontFamily`) is the per-kind specialization. The service stores `SerializableElement` values; consumers narrow to the specific `*Data` shape via the element `type` discriminator.

**Why `ElementKind` (alias only):** some panel sub-components want to switch on a kind that matches the panel's URL/selector naming (`text-properties`, `barcode-properties`, …). Aliasing to `ElementType` keeps the same value set and prevents the codebase from drifting.

### `LabelDocumentService`

```ts
// document/label-document.service.ts
@Injectable()
export class LabelDocumentService {
  // -- state signals --
  readonly page = signal<LabelPageSettings>(DEFAULT_PAGE);
  readonly elements = signal<ReadonlyMap<string, SerializableElement>>(new Map());
  readonly selectionId = signal<string | null>(null);

  // -- selectors (computed) --
  /** The currently selected element, or null. */
  readonly selection = computed<SerializableElement | null>(() => {
    const id = this.selectionId();
    return id ? this.elements().get(id) ?? null : null;
  });

  /** A flat shape used by property panels (matches today's EditorSelectionState shape). */
  readonly selectionProperties = computed<EditorSelectionState>(() => {
    const sel = this.selection();
    return sel ? this.toProperties(sel) : { ...DEFAULT_SELECTION_STATE };
  });

  // -- mutations --
  setPageSize(widthMm: number, heightMm: number): void;
  setPageBackground(color: string | null, image?: string | null): void;

  addElement(state: SerializableElement): void;
  updateElement(id: string, patch: Partial<SerializableElement>): void;   // the main write entry
  removeElement(id: string): void;
  selectElement(id: string | null): void;

  // -- serialization --
  /**
   * Serialize current runtime state to the persistence `Label` shape.
   * `page` fields map directly. `elements` is serialized to `canvasJson`
   * by delegating to EditorCanvasService (Fabric's `toJSON()`); this service
   * does not own Fabric, so it asks the adapter to render the JSON.
   */
  toLabel(): Label;
  /** Hydrate runtime state from a persisted `Label`. The canvas adapter
   *  parses `canvasJson` and pushes SerializableElement records via `addElement`. */
  loadFromLabel(label: Label): void;

  // -- internal --
  private toProperties(s: SerializableElement): EditorSelectionState { /* field mapping */ }
}
```

**Note:** `elements` is a `ReadonlyMap` stored in a single signal. We do not split per-element signals (that would explode the API surface). Mutations replace the Map reference with a new Map (cheap; ~handful of elements per label), which still gives consumers O(1) re-render via `effect` + identity check. If perf becomes an issue we can later move to `Map<id, signal<SerializableElement>>`; today's labels are small (< 50 elements typical) so the simple model wins.

## Component Architecture

### Shell — `PropertiesPanelComponent`

The shell owns no editing state. It only composes sub-components and provides the type-router:

```html
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
      <app-common-properties />
      @switch (sel.type) {
        @case ('text')     { <app-text-properties /> }
        @case ('barcode')  { <app-barcode-properties /> }
        @case ('qrcode')   { <app-qrcode-properties /> }
        @case ('line')     { <app-line-properties /> }
        @default           { <app-figure-properties /> }
      }
    }
  </section>

  <section class="rail-panel json-panel">
    <h2>标签数据</h2>
    <app-json-preview />
  </section>
</aside>
```

The `'image'` case is routed to `<app-figure-properties />` because images share the figure property shape (size + opacity + fill/stroke). If image-specific properties are needed later (e.g. image-fit mode), split into `<app-image-properties />`.

### JSON Preview — bound to `LabelDocument`, not the editor's standalone `jsonPreview` signal

The current `<pre>{{ jsonPreview() }}</pre>` pane shows `EditorCanvasService.jsonPreview` (the whole Fabric canvas JSON). Per the brainstorming request, this pane is reworked to:

- **Always render the Fabric `toJSON()` shape** (so what users see matches what's saved into `canvasJson`), produced by `EditorCanvasService.toCanvasJson()` — same data the persistence path uses.
- **Filter by selection state** (driven by `LabelDocumentService.selectionId()`):
  - **No selection** → emit the *entire* canvas JSON (all objects, page background, etc.).
  - **Element selected** → emit a JSON object containing only the matching `objects[]` entry (by `id`), plus page-level fields (`background`, `width`, `height`) for context. Visually a smaller, focused blob.

```ts
// properties/json-preview.component.ts
@Component({
  selector: 'app-json-preview',
  template: `<pre>{{ preview() }}</pre>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonPreviewComponent {
  private doc = inject(LabelDocumentService);
  private canvas = inject(EditorCanvasService);

  /** Re-runs when selectionId changes or when the canvas reports a revision. */
  protected readonly preview = computed(() => {
    // Subscribe to revision so canvas-only updates (e.g. async image render)
    // also trigger a refresh. Read once — value not used in the projection.
    this.canvas.revision();

    const full = this.canvas.toCanvasJson(); // Fabric toJSON() result, plain object
    const id = this.doc.selectionId();
    if (!id) return JSON.stringify(full, null, 2);

    const one = (full.objects ?? []).find((o: any) => o?.id === id);
    if (!one) return JSON.stringify(full, null, 2); // selection stale; show full as fallback

    return JSON.stringify(
      {
        background: full.background,
        width: full.width,
        height: full.height,
        objects: [one],
      },
      null,
      2,
    );
  });
}
```

**Why this lives in `LabelDocumentService`'s observation world, not `EditorCanvasService.jsonPreview`:**
- The data source is the canvas (Fabric is the truth for serializable shape).
- The *filter* is selection-driven, and selection lives in `LabelDocumentService` — so the preview component reads both: canvas JSON for data, document service for "which slice."
- A standalone `jsonPreview` signal on `EditorCanvasService` would either show only the full snapshot (current behavior, not enough) or would need to know about `LabelDocumentService` — coupling the canvas to the document. Keeping the projection in the component keeps responsibilities clean.

`EditorCanvasService.jsonPreview` signal is removed in this refactor; if any other consumer needs the raw full JSON they can call `canvas.toCanvasJson()` directly.

### Sub-component pattern — `TextPropertiesComponent`

```ts
@Component({
  selector: 'app-text-properties',
  templateUrl: './text-properties.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, NzIconModule],
})
export class TextPropertiesComponent {
  private doc = inject(LabelDocumentService);

  // Auto-derived from selection — no manual subscription
  protected readonly state = computed(() => {
    const sel = this.doc.selection();
    return sel?.type === 'text' ? sel : null;
  });

  protected onFontSizeChange(size: number): void {
    const id = this.doc.selectionId();
    if (!id) return;
    this.doc.updateElement(id, { fontSize: Number(size) });
    // signal triggers canvas effect → fabric updates → revision bumps → dirty flag
  }

  protected onBoldToggle(): void {
    const sel = this.state();
    if (!sel) return;
    this.doc.updateElement(sel.id, {
      fontWeight: sel.fontWeight === 'bold' ? 'normal' : 'bold',
    });
  }
}
```

Template:

```html
@let s = state();
@if (s) {
  <label>
    <span>Color</span>
    <input type="color" [ngModel]="s.color" (ngModelChange)="onColorChange($event)" />
  </label>
  <label>
    <span>Font Family</span>
    <select [ngModel]="s.fontFamily" (ngModelChange)="onFontFamilyChange($event)">
      <option value="Liberation Sans">Liberation Sans</option>
      <option value="Noto Sans SC">Noto Sans SC</option>
    </select>
  </label>
  <!-- ... -->
}
```

### `EditorComponent` simplification

```ts
@Component({
  selector: 'app-editor',
  providers: [EditorCanvasService, LabelDocumentService],  // service is provided here
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [/* ... */ PropertiesPanelComponent, /* ... */],
})
export class EditorComponent {
  // No more selectionState, canvasState, propsPanelVisible signals.
  // The service owns them; panels subscribe directly.
}
```

## `EditorCanvasService` Adaptation

`EditorCanvasService` becomes a Fabric adapter. It reads from `LabelDocumentService` and pushes Fabric events back into it.

```ts
constructor(private doc: LabelDocumentService) {
  // 1. document → fabric: re-render when elements/page change
  effect(() => {
    const elements = this.doc.elements();
    untracked(() => this.syncFabricElements(elements));
  });

  effect(() => {
    const page = this.doc.page();
    untracked(() => this.syncCanvasPage(page));
  });

  // 2. fabric events → document: user interaction writes back
  // (existing Fabric event handlers are modified to call doc.updateElement / doc.selectElement
  //  instead of mutating internal Fabric-only state.)
}
```

**Cycle prevention rule:** every write path from Fabric events to `LabelDocumentService` runs inside `untracked(...)` *and* uses `doc.updateElement(id, patch)` which calls `signal.update` (a write, not a read); the *read* side is in `effect`s only. Angular's signal graph guarantees no infinite loop because writes inside `untracked` do not retrigger effects.

Existing Fabric-specific signals (`zoom`, `canUndoSignal`, `canRedoSignal`, `revision`, `textEditorVisible`, `figureEditorVisible`) **stay** in `EditorCanvasService` — they describe Fabric state, not document state. The `jsonPreview` signal is removed (see JSON Preview section). `revision` is bumped only by direct Fabric mutations that don't go through the document (e.g. async image render completion).

## Data Flow Examples

### A. User changes font size in the text panel

```
<input (ngModelChange)="onFontSizeChange($event)">
   │
   ▼
TextPropertiesComponent.onFontSizeChange(size)
   │
   ▼
LabelDocumentService.updateElement(id, { fontSize })
   │ (signal mutation)
   ├──► elements signal updates
   │      └──► EditorCanvasService.effect: syncFabricElements()
   │              └──► Fabric Textbox.set('fontSize', size)
   │                     └──► canvas.requestRenderAll() → revision++
   │                            └──► EditorComponent.effect → isDirty = true
   │
   └──► selectionProperties computed updates
          └──► TextPropertiesComponent.state computed updates
                 └──► ngModel binding re-renders <input> with new value
```

### B. User drags a shape on the canvas

```
Fabric 'object:modified' event
   │
   ▼
EditorCanvasService.handleObjectModified(obj)
   │ (writes via untracked, with isApplyingFromDoc = true)
   ▼
LabelDocumentService.updateElement(obj.id, { x, y, width, height, ... })
   │ (signal mutation: replaces elements Map)
   ├──► elements signal updates (new Map reference)
   │      └──► effect fires syncFabricElements()
   │             → guarded by isApplyingFromDoc → skip
   │             → set isApplyingFromDoc = false when done
   │
   └──► selectionProperties computed updates
          └──► FigurePropertiesComponent.state updates
                 └──► <input type="number"> re-renders with new W/H
```

**Cycle guard:** the `isApplyingFromDoc` flag is set `true` only on the *fabric → document* write path; `syncFabricElements` reads the flag and returns early when `true`, then resets it in a `finally`. This breaks the loop without `untracked`-dependency gymnastics.

## Shared Styles

The existing `editor-properties-panel.scss` selectors (`.right-rail`, `.rail-panel`, `.property-stack`, `.inline-row`, `.color-input-row`, `.text-style-row`, `.checkbox-label`, `.bg-preview`, `.json-panel`, `.muted`, `.icon-button`, `.icon-button.active`) are component-internal today (no other file references them).

**Decision:** Move them verbatim into `properties/properties-panel.component.scss`. Each sub-component that uses a shared selector declares it in its own (small) `styleUrl`. We use Angular's default ViewEncapsulation.Emulated and rely on attribute selectors scoping the rules; rules are duplicated across small files when needed (cheap). To avoid duplication we can `import './properties-panel.component.scss'` from each sub-component — Angular allows this.

## Migration Plan (high level — implementation plan will detail)

1. Create `document/` with `label-document.ts` + `label-document.service.ts` + `index.ts`.
2. Create `properties/` with the 8 sub-components + shell. Each sub-component injects `LabelDocumentService` and reads `selection()` / writes via `updateElement`.
3. Refactor `editor.ts`: provide `LabelDocumentService`; remove `selectionState`, `canvasState`, `propsPanelVisible`, `textEditorVisible`, `figureEditorVisible` signals; rely on service-backed selectors. (The `jsonPreview` signal is also removed — see step 4.)
4. Adapt `editor-canvas.service.ts`: inject `LabelDocumentService`; convert direct Fabric mutations on edit events to `doc.updateElement(...)` calls; convert init/hydrate to read from `doc.elements()`; keep Fabric-only signals (zoom/revision/undo/redo/textEditorVisible/figureEditorVisible) where they belong; **remove** the `jsonPreview` signal (replaced by the new `<app-json-preview>` component which subscribes to both services).
5. Wire `editor-canvas.service.ts` ↔ `LabelDocumentService` effects for two-way sync with cycle guards (`untracked` + `isApplyingFromDoc` flag).
6. Update `editor.html`: replace `<app-editor-properties-panel>` with `<app-properties-panel>`. The 22 `(*Changed)="..."` event bindings disappear (sub-panels call service directly).
7. Delete `editor-properties-panel.{ts,html,scss}`.
8. Verify with the existing demo / manual interaction: add each element type, change each property from panel and from canvas, observe the other side updates.
9. Verify save/load: `LabelDocument.toLabel()` → `LabelTemplate` round-trip preserves all fields, `loadFromLabel` rebuilds the document correctly.

## Testing Considerations

There are no existing unit tests in this folder (`__tests__`, `*.spec.ts` not present in `src/app/editor/`). We will not introduce a test framework as part of this refactor — that's a separate concern.

Verification is manual via the existing demo:
- Click each tool, add one of each element, change each property.
- Drag, resize, rotate each element; observe panel updates.
- Reload after save → all properties preserved.
- Selection switching: select element A → switch to element B → panel updates instantly.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Signal cycle (canvas → doc → canvas → …) | `untracked(...)` on all canvas-event → doc writes; `isApplyingFromDoc` flag on doc → canvas writes; read-then-write order is enforced in `updateElement` (reads inside `effect`, writes never re-read in the same tick). |
| `EditorSelectionState` consumers outside this folder break | Keep `editor.models.ts` `EditorSelectionState` type unchanged; `selectionProperties` computed still produces it. (Audit pass before implementation.) |
| Performance — every property edit re-renders all panels | Each sub-panel reads only the fields it needs via narrow `computed`. Angular's signal change detection skips unchanged components. |
| Loss of the dead `verticalAlignChanged` wire (currently in `editor-properties-panel.ts:57` and `editor.html:78` but no UI emits it) | Remove during the refactor. Add back later if needed. |
| Image panel UX (no specific properties today) | Routes to `<app-figure-properties />` (shared with rect/circle/triangle). Add `<app-image-properties />` later if image-specific fields are added. |
| SCSS duplication across sub-components | Each sub-component's `styleUrl` imports the shared `properties-panel.component.scss` file; Angular supports this. |

## Open Questions

None at design-approval time. Resolved during brainstorming:

1. Sync mechanism → Angular signals + effect (no RxJS).
2. Granularity → 5 type-specific panels (`figure`/`line`/`text`/`barcode`/`qrcode`) + 1 page + 1 common + 1 json preview (medium).
3. Sync direction → bidirectional, via central `LabelDocumentService`.
4. Central object naming → `LabelDocument` (vs. existing persistence `Label`).
5. Central object location → new `document/label-document.service.ts` with `signal` tree.