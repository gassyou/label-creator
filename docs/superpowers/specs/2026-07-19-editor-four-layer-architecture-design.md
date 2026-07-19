# Editor Four-Layer Architecture — Design

**Date:** 2026-07-19
**Status:** Approved design (brainstorming complete — implementation deferred per user request)
**Scope:** Refactor `editor-canvas.service.ts` (1823 lines, god class) into four clearly-scoped layers: **model**, **render**, **editor**, **persistence**. No behavior change. Wire format unchanged.

## Background

The label editor has grown organically. The current `editor-canvas.service.ts` simultaneously owns:

1. Fabric instance lifecycle (`new Canvas`, `setDimensions`, `backgroundColor`, `dispose`)
2. Render helpers (`createPlaceholderDataUrl`, `randomId`, `extend`, `extendWithCustomProperties`, `getRenderContext`)
3. Element registry (`elementRegistry: Map<id, BaseElement>` — parallel to `LabelDocumentService.elements`)
4. UI state signals (`selected`, `textEditorVisible`, `figureEditorVisible`, `revision`, `zoom`, `canUndo/Redo`)
5. Selection handling (`handleSelection`, `handleObjectModified`, `isApplyingFromDoc` cycle guard)
6. Geometric operations (`setSelectionWidth/Height`, `rotate`, `align`, `clone`, `removeSelected`, ...)
7. Serialization (`loadPage`, `toCanvasJson`, `applyElementsFromDoc`)
8. Application API (`addText/addShape/addQRCode/...`, `execute()`, `undo/redo`, `pushUndoSnapshot`, `clearCanvas`)

This is the central "god class" symptom. Recent work (the LabelDocument refactor, 27 commits) introduced the central model layer correctly, but the rendering, editing, and persistence concerns remain tangled in this service.

## Goal

Split `editor-canvas.service.ts` into four cohesive layers with one clear responsibility each:

1. **Model layer** — *what the label is* (pure data, no Fabric, no editor, no storage)
2. **Render layer** — *how the label is drawn* (Fabric adapter; consumes model, produces canvas state)
3. **Editor layer** — *what the user can do* (selection, transforms, alignment, layer order, undo/redo)
4. **Persistence layer** — *how the label survives* (LabelDocument ↔ LabelTemplate conversion, storage I/O)

## Non-Goals

- No behavior change in user-visible features. Panels, undo/redo, save/load, JSON preview all behave identically.
- No dependency upgrades. No new packages.
- No wire-format change. `LabelTemplate` JSON is byte-compatible with today.
- No migration of the print pipeline (`src/app/print/`). It can continue consuming `Label` and `LabelTemplate` directly via the persistence layer.
- No introduction of a "render backend" abstraction (e.g., not designing for SVG or WebGL renderers). Fabric is the sole renderer; the abstraction is to separate Fabric from the model, not to abstract over Fabric.

## The Four Layers

### 1. Model Layer (`src/app/editor/model/`)

**Already exists** (recently landed in the LabelDocument refactor). Rename `models/` → `model/` to align with the new naming convention.

**Files:**
- `model/label-document.ts` — `LabelPageSettings`, `LabelDocument` types, `DEFAULT_PAGE_SETTINGS`
- `model/label-document.service.ts` — central runtime service (`page`, `elements`, `selectionId` signals; mutations)
- `model/element-base.ts` — `BaseElement` abstract class, `RenderContext` interface (moved out from element-base — see below)
- `model/element-factory.ts` — `ElementFactory.fromJSON` / `fromFabricObject` (now consumes Fabric primitives, not `RenderContext`)
- `model/{rect,circle,triangle,line,text,barcode,qrcode,image}-element.ts` — concrete elements

**Layer rules:**
- No imports from `render/`, `editor/`, or `persistence/`.
- The only side effects are signal mutations in `LabelDocumentService`.
- `RenderContext` interface lives here (it's a contract that the render layer implements), but concrete implementations live in `render/`.

### 2. Render Layer (`src/app/editor/render/`)

**New.** Owns everything Fabric-specific that the model layer doesn't need to know about.

**Files:**
- `render/render-context.ts` — `RenderContext` interface moved from `model/element-base.ts`
- `render/fabric-renderer.ts` — `@Injectable()` service:
  - `applyElements(elements: ReadonlyMap<id, LabelElement>): void` — reconcile document state with Fabric canvas (currently `applyElementsFromDoc` + `applyPageFromDoc`)
  - `toJsonBlob(): Record<string, unknown>` — currently `toCanvasJson()`
  - `fromJsonBlob(blob: Record<string, unknown>): Promise<void>` — currently the Fabric load path inside `loadPage`
  - `createPlaceholderDataUrl(label: string, w: number, h: number): string` — moved from editor-canvas.service
  - `randomId(): string` — moved from editor-canvas.service
  - `extend(obj, id): void` — moved from editor-canvas.service
  - `extendWithCustomProperties(obj, props): void` — moved (renamed already)
- `render/canvas-state.ts` — reactive `Canvas | null` holder + dispose lifecycle
- `render/element-renderer.ts` — helpers for `FabricImage.fromURL` and other Fabric creation patterns

**Layer rules:**
- Imports from `model/` (read-only).
- Imports from `fabric` (the only place in the codebase that should).
- No imports from `editor/` or `persistence/`.
- The renderer is stateless beyond the canvas instance; it accepts model data and produces canvas updates.

### 3. Editor Layer (`src/app/editor/editor/`)

**Already partially exists** (`commands/`). Split out the editing logic.

**Files:**
- `editor/editor.ts` — top-level component (unchanged location, slightly slimmer)
- `editor/editor-canvas.component.ts` — presentational wrapper for the `<canvas>` element + Fabric event bindings
- `editor/selection.service.ts` — `SelectionService`:
  - `selected = signal<LabelElement | null>(null)`
  - `textEditorVisible` / `figureEditorVisible` (move out of canvas service)
  - `handleFabricSelection(object)` — moved from canvas service
  - `handleFabricModification(object)` — moved from canvas service
- `editor/operations.service.ts` — `OperationsService`:
  - `alignLeft/Center/Right()` — moved from canvas service
  - `bringToFront/SendToBack()` — moved from canvas service
  - `clone()` — moved from canvas service
  - `rotate90()` — moved from canvas service
  - `removeSelected()` — moved from canvas service
- `editor/undo-redo.service.ts` — `UndoRedoService`:
  - Owns the snapshot stack (currently `pushUndoSnapshot` / `undoState` / `redoState` private fields in canvas service)
  - `canUndo`, `canRedo`, `execute(command)`, `undo()`, `redo()`
- `editor/commands/` — already exists; sub-components consume it via DI

**Layer rules:**
- Imports from `model/` and `render/`.
- No imports from `persistence/`.
- No raw Fabric imports in this layer except via the renderer's exposed methods (e.g., `renderer.applyElements(elements)`).

### 4. Persistence Layer (`src/app/editor/persistence/`)

**New.** Owns the boundary between the in-memory model and the on-disk / wire format.

**Files:**
- `persistence/label-converter.ts` — pure functions:
  - `toTemplate(doc: LabelDocument, canvasJson: string): LabelTemplate`
  - `fromTemplate(template: LabelTemplate): Promise<LabelDocument>` — also resolves the canvas JSON via the render layer's `fromJsonBlob`
- `persistence/label-persistence.service.ts` — `LabelPersistenceService`:
  - `save(template: LabelTemplate): Promise<void>` — orchestrates storage write
  - `load(id: string): Promise<LabelTemplate | null>` — orchestrates storage read
  - `list(): Promise<TemplateSummary[]>` — list available templates
- `persistence/template.storage.ts` — already exists; becomes the storage backend (`LabelTemplateStore`)

**Layer rules:**
- Imports from `model/` (read-only) and `render/` (for `toJsonBlob`/`fromJsonBlob`).
- Owns the **only** code that knows about `localStorage` / `IndexedDB` / future remote storage.
- The print pipeline (`src/app/print/`) continues to consume `LabelTemplate` directly — this layer provides the converter, the print pipeline doesn't need to know about `LabelDocument`.

## File Layout (target)

```
src/app/editor/
├── model/                          # Pure data (renamed from models/)
│   ├── label-document.ts
│   ├── label-document.service.ts
│   ├── element-base.ts
│   ├── element-factory.ts
│   └── {rect,circle,triangle,line,text,barcode,qrcode,image}-element.ts
│
├── render/                         # Fabric adapter (new)
│   ├── render-context.ts
│   ├── fabric-renderer.ts
│   ├── canvas-state.ts
│   └── element-renderer.ts
│
├── editor/                         # Editing logic (split from current EditorCanvasService)
│   ├── editor.ts
│   ├── editor-canvas.component.ts
│   ├── selection.service.ts
│   ├── operations.service.ts
│   ├── undo-redo.service.ts
│   └── commands/
│       └── {add-text,add-shape,add-qrcode,add-barcode,add-image,delete-selected,clear-canvas}.command.ts
│
├── persistence/                    # Storage adapter (new)
│   ├── label-converter.ts
│   ├── label-persistence.service.ts
│   └── template.storage.ts
│
└── properties/                     # Property panels (unchanged location)
    ├── properties-panel.component.ts
    └── {page,common,figure,line,text,barcode,qrcode,json-preview}-properties.component.ts
```

## Cross-Cutting Concerns

### RenderContext location

`RenderContext` is a **contract** that the render layer implements and the model layer's element classes call into. The cleanest home is `render/render-context.ts`, with the concrete implementation in `fabric-renderer.ts` and the interface exposed to `model/` via:

```ts
// model/element-base.ts
import type { RenderContext } from '../render/render-context';
```

This means `model/` has a *type-only* import from `render/`. The interface is purely structural (canvas reference + 3 methods); no runtime coupling. This is acceptable: the model declares "I need these capabilities" without knowing who provides them.

Alternative: keep `RenderContext` in `model/` and have `render/` import it. This is cleaner from a "model is leaf" perspective, but means the contract lives where it's used, not where it's defined. Either is defensible; we'll pick at implementation time.

**Decision:** keep `RenderContext` interface in `model/element-base.ts` (current location). Concrete implementation in `render/fabric-renderer.ts`. This minimizes churn for the model layer's existing import.

### Cycle detection (current `isApplyingFromDoc` flag)

Today this lives in `EditorCanvasService.handleObjectModified` because the flag protects the Fabric → document write from triggering a document → Fabric echo.

After the split:
- `editor/selection.service.ts` `handleFabricModification` writes to `model/`
- `render/fabric-renderer.ts` `applyElements` writes to Fabric
- The flag can live in **either** service. Recommendation: put it in `fabric-renderer.ts` (it's about preventing Fabric-side event echo). The selection service calls `renderer.apply(...)` which itself is no-op when the flag is set.

Concretely:

```ts
// render/fabric-renderer.ts
private isApplyingFromDoc = false;

applyElements(elements: ReadonlyMap<id, LabelElement>): void {
  if (!this.canvas) return;
  this.isApplyingFromDoc = true;
  try {
    // ... reconcile ...
  } finally {
    this.isApplyingFromDoc = false;
  }
}

// In selection.service.ts, when handling Fabric's `object:modified`:
// Only write back to model if the renderer wasn't the one driving the change.
handleFabricModification(object: any): void {
  if (this.renderer.isApplyingFromDoc()) {
    this.refreshSelectionFromFabric(); // just refresh selection
    return;
  }
  this.doc.updateElement(id, this.extractGeometryPatch(object));
}
```

### Undo/redo architecture

Currently `UndoRedoService` would own the snapshot stack. The hard part: **what's in a snapshot?**

Two options:
1. **JSON snapshot** — store the entire `canvas.toJSON()` after each command (current approach). Pros: simple, already works. Cons: O(canvas size) per snapshot.
2. **Command log + replay** — store each `EditorCommand` executed, replay on undo. Pros: O(command size) per snapshot. Cons: requires every state change to be a Command, which the current code doesn't strictly enforce.

**Recommendation:** keep the JSON snapshot approach. It works, the canvas is small (< 100 elements typical), and the refactor isn't the right time to change undo semantics.

`UndoRedoService` reads `renderer.toJsonBlob()` and `doc.page()` to construct snapshots.

### Double-source-of-truth cleanup

Today `EditorCanvasService.elementRegistry: Map<id, BaseElement>` is a parallel registry to `LabelDocumentService.elements: Map<id, LabelElement>`. Both exist; only one was being read by the property panels (after the recent fix).

After this refactor: **delete `elementRegistry`** entirely. `LabelDocumentService.elements` becomes the single source. The renderer's `applyElements` reads from `doc.elements()`. The selection service reads from `doc.elements()` and writes to `doc.selectionId()`.

Commands (`Add*Command`) call `doc.addElement(...)` only — they no longer touch a separate registry.

This is the **single most important cleanup** in this refactor.

## Migration Path

This refactor is large enough that it warrants its own spec/plan after this design is approved. Out of scope for THIS design doc:

- Order of tasks (which layer first; how to incrementally migrate)
- Whether to do it as a big-bang or as a series of small commits
- How to keep the running app green at each step
- Test strategy (the project has minimal tests today)

**High-level suggested order:**

1. **Pilot: Render layer extraction** — `fabric-renderer.ts` + `render-context.ts` + `canvas-state.ts`. Move `createPlaceholderDataUrl`, `randomId`, `extend`, `extendWithCustomProperties`, `toCanvasJson`, `loadPage`'s Fabric hydrate logic. Update `getRenderContext()` to delegate. ~5 commits.
2. **Selection service** — extract `handleSelection` + `handleObjectModified` + selection state signals. ~3 commits.
3. **Operations service** — extract alignLeft/Center/Right, bringToFront/SendToBack, clone, rotate, removeSelected. ~3 commits.
4. **Undo/redo service** — extract the snapshot stack. ~3 commits.
5. **Persistence layer** — create `LabelConverter` and `LabelPersistenceService`. ~4 commits.
6. **Cleanup** — delete `elementRegistry`, simplify `editor.ts` to compose the services. ~2 commits.

Total estimate: ~20 commits over 1-2 weeks of focused work. Each layer is independently testable (property panels already work without canvas events; renderer can be tested with a mocked canvas; etc.).

## Risks

### Risk 1: Behavior drift during incremental migration

**Mitigation:** After each layer extraction, run `npm run build` and the existing `app.spec.ts`. Behavior should be unchanged. Manual smoke: add an element, drag it, change a property, save/load. The dev server smoke check that the previous refactor skipped should land with this one — once the architecture is cleaner, the smoke check becomes easier to write (services are smaller and more isolated).

### Risk 2: SelectionService ↔ FabricRenderer dependency cycle

Selection writes to model and reads from Fabric; FabricRenderer reads from model and writes to Fabric. Both touch the model. The `isApplyingFromDoc` flag is the synchronizer.

**Mitigation:** selection service does NOT call renderer directly. It calls `doc.updateElement(...)`; the renderer's effect (via `effect()` on `doc.elements()`) applies the change. The flag lives in the renderer.

### Risk 3: RenderContext belongs to render layer but model needs it

`element-base.ts` defines `abstract render(ctx: RenderContext)` — model classes call this method, but the `ctx` is provided by the render layer.

**Mitigation:** the `RenderContext` interface lives in `model/element-base.ts` (as a contract), and the concrete implementation is built by `fabric-renderer.ts` and passed in. Model imports the *interface*; render implements the interface. No runtime coupling — TypeScript erases the interface at compile time.

### Risk 4: Undo/redo architecture lock-in

If we keep the JSON snapshot approach, future undo-by-replay is harder.

**Mitigation:** document the decision and leave a TODO at `undo-redo.service.ts` referencing the alternative. Not blocking.

## Success Criteria

- `editor-canvas.service.ts` is **deleted** after the refactor (not just shrunk — the file should disappear).
- Each new layer's service class is **< 300 lines**.
- No service imports from `fabric` except `render/`.
- No service in `render/`, `editor/`, or `persistence/` holds a `signal<LabelElement | null>` — that's the model's job.
- The print pipeline (`src/app/print/`) does not need to change.
- Wire format (`LabelTemplate` JSON) is byte-compatible.
- 7-file preservation invariant (set in the previous refactor's ledger) continues to hold for any future work.

## Open Questions

1. Should `render/render-context.ts` exist as a separate file, or stay inside `model/element-base.ts`? **Recommendation:** keep inside `model/element-base.ts` to minimize model-side churn. Re-evaluate at implementation time.
2. Should `editor-canvas.component.ts` (the presentational wrapper) be a new component or just a `<canvas>` element inside the existing `editor.ts` template? **Recommendation:** keep the `<canvas>` in `editor.ts` for now; introducing a sub-component is a separate refactor.
3. Should undo/redo be migrated to command-log replay at the same time? **Recommendation:** no, keep the JSON snapshot. Document as a follow-up.
4. Should `LabelDocumentService` be renamed to something that signals "runtime model"? E.g., `LabelDocumentState`? **Recommendation:** no, the name is fine; users of the service don't care that it's a "state."

## Decision

The design is **approved** for reference. Implementation is **deferred** per the user's request ("暂不动，只设计文档") — this document is the source of truth for any future refactor along these lines.

When implementation begins, follow the migration order (Pilot: Render layer first), write a fresh implementation plan against this design, and run the existing manual smoke checks at each layer boundary.