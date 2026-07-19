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
- `render/element-renderer.ts` — helpers for `FabricImage.fromURL` and other Fabric creation patterns

**Removed from earlier draft (2026-07-19 review):** `render/canvas-state.ts`. Rationale: YAGNI. The Fabric `Canvas` instance already owns its own state; wrapping it in another `signal<Canvas | null>` service is an anemia layer. `fabric-renderer.ts` directly holds `canvas: Canvas | null` plus the two lifecycle methods (`initialize(element)` / `dispose()`) currently inline in `editor-canvas.service.ts:84-120`.

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

**Existing-functionality note (2026-07-19 review):** the storage backend is already implemented (60% done). `src/app/template/template.storage.ts` defines `TemplateStorageService` abstract class with `localStorage` (`LocalStorageTemplateService`) and HTTP (`HttpTemplateService`) implementations, exposing `getAll/getById/save/delete` over RxJS Observables. **Refactor mapping:**

  - Rename `TemplateStorageService` → `LabelTemplateStorage`
  - Move file `src/app/template/template.storage.ts` → `src/app/editor/persistence/template.storage.ts`
  - Rename `LocalStorageTemplateService` → `LocalStorageLabelTemplateStore` (etc.) — drop the redundant "Service" suffix since the abstract base is now called "Storage"
  - Convert return types from `Observable<T>` → `Promise<T>` to match Angular 21 idiom and the rest of this codebase (the persistence layer is the last holdout using RxJS for what is otherwise all-signals)
  - Keep the abstraction (so `HttpLabelTemplateStore` can be swapped in) — the refactor preserves the polymorphism, just renames and resyncs

**Missing piece (the 40% to fill):** the **converter** is currently inline in `editor.ts:buildLabelTemplate()` (line 268 area). Extract into `persistence/label-converter.ts` as pure functions. After extraction, `editor.ts`'s `buildLabelTemplate` becomes a one-liner that delegates to the converter.

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

### Known follow-up: undo/redo bug (logged 2026-07-19, NOT fixed by this refactor)

The current snapshot only contains `canvas.toJSON()` and does NOT include `LabelDocumentService` state. Concrete bug:

1. Add element A → snapshot of empty canvas pushed → canvas has A.
2. Drag A → `handleObjectModified` writes new geometry to `doc.elements[A]`.
3. Add element B → snapshot of canvas-with-A-pushed → canvas has A+B; doc.elements has A+B.
4. Press **Undo** → `loadFromJSON(snapshot-of-A-only)` → canvas now shows only A; but `doc.elements` still has A+B.
5. Press **Redo** → `loadFromJSON(snapshot-of-A+B)` → canvas shows A+B (Fabric regenerates objects with new ids); but `doc.elements` still references the original A id (not the regenerated Fabric object's id) and still has the original A geometry (not the dragged position).

Result: canvas and `doc.elements` diverge silently. Property panel shows stale values after every undo/redo. **Reproduction: add element, drag to new position, add another element, press undo, press redo → newly-added element may appear "different" in the panel vs canvas** (different ids, different geometry).

**Required fix:** snapshot must contain `{ canvasJson, page: LabelPageSettings, elements: Map<id, LabelElement>, selectionId: string | null }`. On undo/redo, restore all four atomically. `loadPage` must also rebuild `doc.elements` (currently it only rebuilds `elementRegistry`, which is being phased out).

**Defer:** per user request (2026-07-19), this bug is documented but not fixed in this refactor. Implementation guide is captured in the "follow-up" section below.

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

## Deep Dive: Cycle Guard, Undo Fix, Failure Modes, Phase 0 Tests

These four sub-sections address the architect-level concerns about the cycle guard, the undo bug, and migration safety. They are **design refinements** — not new requirements. Implementation should adopt them from Phase 1 onwards.

### Cycle guard: replace `boolean` with `syncDirection: signal<'idle' | 'doc-to-fabric' | 'fabric-to-doc'>`

**Current problem.** The `isApplyingFromDoc` boolean flag is a fragile synchronization primitive. Two failure modes:

1. **Lost flag → infinite loop.** If `obj.set()` inside `applyElementsFromDoc` throws, the `finally` block resets the flag — but the throw exits the normal control flow, so the next Fabric event may no longer be swallowed, creating a write loop.
2. **Hidden control flow.** A developer reading `handleObjectModified` cannot tell from the code *why* a Fabric event is being skipped. They must know about the flag's existence and semantics.

**Proposed design.** Replace the boolean with a tri-state signal whose **value** is the synchronization source:

```ts
// render/fabric-renderer.ts (or wherever the cycle guard currently lives)
private readonly syncDirection = signal<'idle' | 'doc-to-fabric' | 'fabric-to-doc'>('idle');

constructor() {
  // doc → fabric direction
  effect(() => {
    const elements = this.doc.elements();
    if (this.syncDirection() === 'fabric-to-doc') return;
    untracked(() => {
      this.syncDirection.set('doc-to-fabric');
      try {
        this.applyElements(elements);
      } finally {
        this.syncDirection.set('idle');
      }
    });
  });

  // fabric → doc direction: routed through the same flag by the event handler
}

private handleFabricModification(object: any): void {
  if (this.syncDirection() !== 'idle') return;  // any in-flight sync suppresses echo
  this.syncDirection.set('fabric-to-doc');
  try {
    this.doc.updateElement(this.getObjectId(object), this.extractPatch(object));
  } finally {
    this.syncDirection.set('idle');
  }
}
```

**Why this is better than the boolean:**

- **Race visibility:** when a Fabric event arrives mid-`doc-to-fabric` sync, the value reads `'doc-to-fabric'`, not just "true". A debugger breakpoint on the read makes the suppression obvious.
- **Impossible states are encoded:** the signal has three valid values; "in two directions at once" is impossible because writes go through `'idle'` as the gate.
- **Same test surface:** the same fabric-event → doc-update → effect → fabric-update → no-echo cycle that the boolean guards against is what the tri-state guards against. No test rewrite needed; just clearer semantics.

**Trade-off acknowledged:** the tri-state is *slightly* more code. For a system with one Fabric canvas and one model, this is overkill. For a system with multiple canvases (multi-preview, split view, etc.), it's necessary. We're preparing for the second scenario without paying much in the first.

### Undo fix: atomic snapshot + Fabric-id reconciliation

The known bug — canvas ↔ doc diverge after undo — has two root causes, both addressed here.

**Root cause 1: snapshot is canvas-only.**

Current `pushUndoSnapshot` stores only `canvas.toJSON()`. After `loadFromJSON`, the canvas reflects the old state but `LabelDocumentService.elements` still holds the post-state (because Fabric drag events wrote to it). The two states diverge.

**Root cause 2: Fabric regenerates ids.**

When `loadFromJSON` reconstructs objects, Fabric creates new JS object instances. If those objects retain their `id` (via the `toObject` extension we added), `doc.elements` can match by id. **But if the user added an element between two snapshots**, after undo that element is in `doc.elements` but not in the canvas — and vice versa for a redo. The doc/canvas never converge.

**Proposed design.**

```ts
// model/label-document.service.ts (new mutations)
interface LabelDocumentSnapshot {
  page: LabelPageSettings;
  elements: ReadonlyMap<string, LabelElement>;
  selectionId: string | null;
}

setElements(elements: ReadonlyMap<string, LabelElement>): void;
setSelectionId(id: string | null): void;
setPage(page: LabelPageSettings): void;
snapshot(): LabelDocumentSnapshot;
restore(snapshot: LabelDocumentSnapshot): void;
```

```ts
// editor/undo-redo.service.ts (replaces the current snapshot stack)
interface EditorSnapshot {
  canvasJson: string;
  docSnapshot: LabelDocumentSnapshot;
}

private undoStack: EditorSnapshot[] = [];
private redoStack: EditorSnapshot[] = [];

execute(command: EditorCommand): Promise<void> {
  const before = this.takeSnapshot();
  this.redoStack.length = 0;
  await command.execute();
  // after: implicit (Fabric events already wrote to doc via handleFabricModification)
  // no need to push after — undo just needs the *before* state
  this.undoStack.push(before);
  this.syncSignals();
}

undo(): Promise<void> {
  if (this.undoStack.length === 0) return;
  const current = this.takeSnapshot();
  const target = this.undoStack.pop()!;

  // 1. Restore doc FIRST (atomic mutation; no echo back)
  this.doc.restore(target.docSnapshot);
  this.renderer.syncDirection.set('doc-to-fabric');

  // 2. Load canvas (will trigger object:added events, all swallowed by syncDirection)
  await this.renderer.fromJsonBlob(JSON.parse(target.canvasJson));

  // 3. Reset guard
  this.renderer.syncDirection.set('idle');

  this.redoStack.push(current);
  this.syncSignals();
}

private takeSnapshot(): EditorSnapshot {
  return {
    canvasJson: JSON.stringify(this.renderer.toJsonBlob()),
    docSnapshot: this.doc.snapshot(),
  };
}
```

**Critical detail — the `syncDirection` guard is set *across the entire* `fromJsonBlob` call.** This is why the tri-state (above) matters: the boolean flag was set inside `applyElementsFromDoc` only, but the load-from-JSON path is *separate* and needs the same guard. With `syncDirection` as a single shared signal, both `applyElementsFromDoc` and `loadFromJSON` flip it the same way.

**Reconciliation for new Fabric ids.** If `loadFromJSON` regenerates an object without the original id (shouldn't happen given our `extend`/`extendWithCustomProperties` work, but defensively): after load, walk `canvas.getObjects()`, build a Map<id, FabricObject>, and re-issue `doc.setElements()` from the snapshot — but replace ids with whatever Fabric assigned. This is the "last-resort reconciliation" branch; should only fire if the `extend()` chain breaks.

### Failure modes per phase (Strangler Fig safety net)

If implementation pauses mid-phase, the codebase must remain buildable and runnable. Each phase below lists what works, what's partial, and what's broken if stopped mid-flight.

**Phase 1 (render layer extraction) — partial stop acceptable.**

- Working: `RenderContext` interface unchanged at the import sites; `getRenderContext()` still returns the same shape. `fabric-renderer.ts` is a new file but is referenced only via `EditorCanvasService.getRenderContext()` which is the only call site.
- Partial (acceptable): old methods (`createPlaceholderDataUrl`, `randomId`, etc.) still on `EditorCanvasService` until all callers migrate. `fabric-renderer.ts` is the new home; both can coexist.
- Broken if stopped: nothing. The new service can be removed without affecting the old code paths.

**Phase 2 (undo fix) — partial stop acceptable.**

- Working: snapshot data is now `EditorSnapshot` (4 fields instead of 1). If stopped after only adding the type but not the `restore()` flow, undo still uses the old `canvasJson`-only stack — no regression.
- Broken if stopped: only if `restore()` is wired into `undo()` but the cycle guard isn't updated. Then `loadFromJSON` events would write back to doc, re-introducing the divergence.

**Phase 3 (selection service) — partial stop acceptable.**

- Working: `handleSelection` and the selection signals move to a new service. `EditorCanvasService` proxies to it. If stopped, both old and new code paths coexist.
- Broken if stopped: only the `selected` signal is now in two places. Resolution: keep `EditorCanvasService.selected` as the public read API, have it delegate to the new service.

**Phase 4 (operations service) — partial stop acceptable.**

- Working: alignLeft, clone, rotate, etc. become service methods. Topbar buttons call the service instead of canvas service.
- Broken if stopped: only the cycle guard — if `OperationsService` writes back via `doc.updateElement`, the existing `applyElementsFromDoc` needs to be cycle-guarded *correctly*. The tri-state signal fixes this; if you skipped the tri-state, you have race conditions.

**Phase 5 (persistence layer) — partial stop acceptable.**

- Working: storage backend renamed and relocated; converter extracted. `editor.ts:buildLabelTemplate` becomes a one-liner.
- Broken if stopped: nothing — this layer has no cycle dependencies.

**Phase 6 (cleanup) — DO NOT pause mid-flight.**

- Working: `elementRegistry` is gone. `doc.elements` is the single source.
- Broken if stopped: every `elementRegistry.get(id)` call site breaks. There are dozens. Plan to land Phase 6 atomically (single commit) or in sub-phases (selection first, then operations, then commands).

### Phase 0: integration tests as safety net

**Before any code change**, land this commit:

```ts
// src/app/editor/__tests__/editor-flow.spec.ts
describe('Canvas ↔ Doc round-trip', () => {
  it('add → drag → undo returns both canvas and doc to add-pre state', async () => {
    // Setup: empty canvas
    // Action: add rect, drag right by 50px
    // Assert: doc.elements has 1 element with new x; canvas has 1 rect at new x
    // Action: undo
    // Assert: doc.elements is empty; canvas is empty
  });

  it('add → undo → redo restores exact state (id, geometry)', async () => {
    // Action: add rect, drag to (100, 100)
    // Action: undo (doc and canvas both empty)
    // Action: redo
    // Assert: doc.elements has the same id as before; geometry matches
  });

  it('add → drag → undo → add different element → redo does not re-add first', async () => {
    // Action: add rect A, drag
    // Action: undo (state: empty)
    // Action: add rect B
    // Action: redo
    // Assert: doc.elements contains ONLY rect B; canvas shows only rect B
    // (This is the user-reported bug: "新增元素消失了")
  });

  it('delete → undo restores element with correct id', async () => {
    // Action: add rect, delete selected
    // Action: undo
    // Assert: doc.elements contains the rect again; canvas shows it
  });

  it('multi-select → drag → undo restores both elements to original positions', async () => {
    // Action: add 2 rects, drag both
    // Action: undo
    // Assert: both rects back to original positions; doc.elements geometry matches
  });
});
```

These tests are the **safety net** that makes every other phase safe to land. They will catch:

- The current undo bug (regression-tested)
- Any future cycle-guard bug (regression-tested)
- Any state-divergence between canvas and doc (regression-tested)

**Effort estimate for Phase 0: 2-3 hours**, dominated by test setup. Pay it once, before the four-layer refactor begins.

### Migration order revised with Phase 0

The earlier suggestion (Pilot: Render layer first) was correct in isolation but skipped Phase 0. Revised:

0. **Phase 0** — integration tests for canvas ↔ doc round-trip (~2-3 hours)
1. **Phase 1** — render layer extraction (~5 commits)
2. **Phase 2** — undo fix (snapshot 4 fields + tri-state guard) (~3 commits)
3. **Phase 3** — selection service (~3 commits)
4. **Phase 4** — operations service (~3 commits)
5. **Phase 5** — persistence layer rename + extraction (~4 commits)
6. **Phase 6** — cleanup (delete `elementRegistry`, simplify `editor.ts`) (~2 commits)

Total: ~20 commits + 1 Phase 0 commit. Phase 0 should land first; if implementation pauses after Phase 0 but before Phase 1, the only thing lost is 2-3 hours of test work. **Phase 0 is the safest possible commit** — it's pure additions, no behavior change.

## Open Questions

1. Should `render/render-context.ts` exist as a separate file, or stay inside `model/element-base.ts`? **Recommendation:** keep inside `model/element-base.ts` to minimize model-side churn. Re-evaluate at implementation time.
2. Should `editor-canvas.component.ts` (the presentational wrapper) be a new component or just a `<canvas>` element inside the existing `editor.ts` template? **Recommendation:** keep the `<canvas>` in `editor.ts` for now; introducing a sub-component is a separate refactor.
3. Should undo/redo be migrated to command-log replay at the same time? **Recommendation:** no, keep the JSON snapshot. Document as a follow-up.
4. Should `LabelDocumentService` be renamed to something that signals "runtime model"? E.g., `LabelDocumentState`? **Recommendation:** no, the name is fine; users of the service don't care that it's a "state."

## Decision

The design is **approved** for reference. Implementation is **deferred** per the user's request ("暂不动，只设计文档") — this document is the source of truth for any future refactor along these lines.

When implementation begins, follow the migration order (Pilot: Render layer first), write a fresh implementation plan against this design, and run the existing manual smoke checks at each layer boundary.

## Deferred Follow-Ups (logged 2026-07-19)

These items were discussed and explicitly deferred by the user. They are out of scope for any immediate implementation but should be picked up before the four-layer refactor reaches completion.

1. **Undo/Redo snapshot bug** (critical for correctness) — see the "Known follow-up" section above the migration path. Snapshot must atomically include `{ canvasJson, page, elements, selectionId }`. Reproduction: add element, drag, add another, undo, redo → newly-added element is inconsistent in panel vs canvas.

2. **`render/canvas-state.ts` was removed from this design** (2026-07-19 review) — YAGNI. Fabric `Canvas` already owns its own state; `fabric-renderer.ts` directly holds `canvas: Canvas | null` plus the `initialize(element)` / `dispose()` lifecycle methods currently inline at `editor-canvas.service.ts:84-120`.

3. **`TemplateStorageService` rename + move** — see "Existing-functionality note" above. The storage backend is 60% done; only renaming (`TemplateStorageService` → `LabelTemplateStorage`), relocating (`src/app/template/template.storage.ts` → `src/app/editor/persistence/template.storage.ts`), and API conversion (`Observable<T>` → `Promise<T>`) remain. The `buildLabelTemplate` glue in `editor.ts` extracts to `persistence/label-converter.ts`.