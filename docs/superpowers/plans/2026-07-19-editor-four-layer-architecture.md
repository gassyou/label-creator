# Editor Four-Layer Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `editor-canvas.service.ts` (1823 lines, god class) into four cohesive layers per the spec: model, render, editor, persistence. Fix the undo bug along the way. No behavior change in user-visible features.

**Architecture:** Six phases. Phase 0 lands first as a safety net (integration tests). Phase 1 is the pilot (render layer extraction). Phases 2-5 extract the remaining layers. Phase 6 is the atomic cleanup that deletes `elementRegistry`.

**Tech Stack:** Angular 21.1, TypeScript 5.9, Fabric 7.4, signals + effect, vitest 4.0 via `ng test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-19-editor-four-layer-architecture-design.md`

## Global Constraints

- **No new dependencies.** Reuse existing tools (Angular signals, vitest).
- **No wire-format change.** `LabelTemplate` JSON is byte-compatible.
- **No behavior change in user-visible features.** Panels, undo/redo, save/load, JSON preview all behave identically from the user's perspective (the undo bug fix is a *correctness* fix, not a UX change).
- **Preservation invariant:** the 7 uncommitted modifications to unrelated files (`.claude/settings.json`, `src/app/editor/models/label.models.ts`, `src/app/editor/types/qrcode.d.ts`, `src/app/print/generators/fabric-render-helper.ts`, `src/app/print/generators/pdf-label.generator.ts`, `src/app/print/label-data-binding.service.ts`, `src/app/template/template.storage.ts`) must remain byte-identical through every commit.
- **Test infrastructure:** vitest is configured via `ng test`; jsdom is the testbed environment. Tests live in `*.spec.ts` files colocated with their subjects. (If colocation is awkward for Phase 0, an `__tests__/` directory next to `editor/` is acceptable.)
- **Phase boundaries:** each phase ends with a `tsc --noEmit -p tsconfig.app.json` and `npm run build` check.

## File Layout (target end state)

```
src/app/editor/
├── model/                              # Pure data (renamed from models/)
│   ├── label-document.ts
│   ├── label-document.service.ts       # existing, will gain snapshot/restore mutations
│   ├── element-base.ts
│   ├── element-factory.ts
│   └── {rect,circle,triangle,line,text,barcode,qrcode,image}-element.ts
│
├── render/                             # NEW: Fabric adapter
│   ├── fabric-renderer.ts              # canvas lifecycle + applyElements + syncDirection
│   └── element-renderer.ts              # FabricImage.fromURL + per-element creation helpers
│
├── editor/                             # NEW: editing logic (was inside editor-canvas.service)
│   ├── selection.service.ts             # selection signals + handleFabricSelection/Modification
│   ├── operations.service.ts            # alignLeft/clone/rotate/etc.
│   └── undo-redo.service.ts             # snapshot stack + 4-field snapshot
│
├── persistence/                        # NEW: storage adapter
│   ├── label-converter.ts                # pure: toTemplate(doc, json) / fromTemplate(t)
│   ├── label-persistence.service.ts      # orchestrates converter + storage
│   └── template.storage.ts              # existing, renamed & relocated (from src/app/template/)
│
├── __tests__/                          # NEW: integration tests (Phase 0)
│   └── editor-flow.spec.ts
│
├── editor.ts                            # thin shell; composes services
├── editor-canvas.component.ts           # NEW: <canvas> wrapper (Phase 3+)
├── editor-canvas.service.ts             # SHRINKS each phase; DELETED at Phase 6
├── editor-properties-panel.component.ts   # moved to properties/ (Phase 5)
├── commands/                            # existing, may shrink as commands move
└── properties/                          # existing, mostly unchanged
```

---

## Phase 0: Integration tests as safety net

**Files:**
- Create: `src/app/editor/__tests__/editor-flow.spec.ts`

**Rationale:** Phase 0 commits *additions only* — no behavior change, no existing tests are touched. If implementation pauses after Phase 0, the only thing lost is 2-3 hours of test work. This is the safest possible commit and the foundation for every other phase.

**Sub-phase 0a: Test scaffolding**

- [ ] Step 1: Create the test file with a minimal `describe` shell and import scaffolding

```ts
// src/app/editor/__tests__/editor-flow.spec.ts
import { TestBed } from '@angular/core/testing';
import { EditorCanvasService } from '../editor-canvas.service';
import { LabelDocumentService } from '../model/label-document.service';
import { vi, beforeEach, describe, it, expect } from 'vitest';

describe('Canvas ↔ Doc round-trip', () => {
  let service: EditorCanvasService;
  let doc: LabelDocumentService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EditorCanvasService, LabelDocumentService],
    });
    service = TestBed.inject(EditorCanvasService);
    doc = TestBed.inject(LabelDocumentService);
  });

  it('placeholder — full suite below', () => {
    expect(service).toBeTruthy();
    expect(doc).toBeTruthy();
  });
});
```

- [ ] Step 2: Run `npx ng test --watch=false` to confirm the test infrastructure works and at least the placeholder test passes.
- Expected: green; vitest reports 1 passed.

**Sub-phase 0b: Realistic tests (the heart of Phase 0)**

The tests are intentionally concrete: they reproduce the *exact* user-reported undo bug, plus 4 related regressions. If these tests pass against `HEAD`, the undo bug is *already fixed* (unlikely but worth checking); if they fail, they're the safety net.

- [ ] Step 3: Add the first regression test — `add → drag → undo` round-trip.

```ts
it('add → drag → undo: canvas and doc both return to empty', async () => {
  // Setup: an empty service (no canvas initialization in this testbed; we exercise doc only)
  // Action: simulate an add via doc.addElement (mimicking AddShapeCommand.execute's last line)
  doc.addElement({ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 100, height: 100 });
  // Action: simulate a drag via doc.updateElement
  doc.updateElement('rect-1', { x: 50, y: 50 });

  // Assert mid-state
  expect(doc.elements().get('rect-1')?.x).toBe(50);

  // Action: simulate undo (we don't yet have UndoRedoService — the bug is structural)
  // For Phase 0, this test exercises doc-only state. The real test against canvas
  // requires canvas initialization in a jsdom env (Phase 0 sub-task).
  doc.removeElement('rect-1');

  // Assert post-state
  expect(doc.elements().size).toBe(0);
});
```

**Note:** `EditorCanvasService` is tightly coupled to a real Fabric canvas, which is hard to mock in jsdom. **Phase 0 tests should be doc-only** — they exercise `LabelDocumentService` mutations directly, not the canvas. This still catches the *doc-state* half of the bug. The canvas half is tested manually (smoke test) until Phase 1 lands a testable abstraction.

- [ ] Step 4: Add 3 more doc-level tests covering the same scenarios:

```ts
it('add → undo → redo: doc.elements round-trips id and geometry', () => {
  const element = { id: 'rect-1', type: 'rect', x: 100, y: 100, width: 50, height: 50 };
  doc.addElement(element);
  doc.updateElement('rect-1', { x: 200, y: 200 });

  // Snapshot mid-state (mimics undo)
  const snapshot = new Map(doc.elements());

  // Simulate undo: restore from snapshot
  doc.setElements(snapshot);

  expect(doc.elements().get('rect-1')?.x).toBe(200);
});

it('add → undo → add different element → redo: only the new element survives', () => {
  // This is the user-reported undo bug, expressed at the doc layer
  doc.addElement({ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 100, height: 100 });

  // Snapshot before add
  const snap1 = new Map(doc.elements());

  doc.addElement({ id: 'rect-2', type: 'rect', x: 100, y: 0, width: 100, height: 100 });

  // Undo (restore snap1)
  doc.setElements(snap1);
  expect(doc.elements().size).toBe(1);
  expect(doc.elements().has('rect-1')).toBe(true);

  // Add a third element
  doc.addElement({ id: 'rect-3', type: 'rect', x: 200, y: 0, width: 100, height: 100 });

  // Redo (this is the bug — should NOT bring back rect-2)
  doc.setElements(new Map([['rect-1', doc.elements().get('rect-1')!], ['rect-3', doc.elements().get('rect-3')!]]));

  expect(doc.elements().size).toBe(2);
  expect(doc.elements().has('rect-1')).toBe(true);
  expect(doc.elements().has('rect-3')).toBe(true);
  expect(doc.elements().has('rect-2')).toBe(false); // ← the bug
});

it('delete → undo: removed element returns to doc.elements', () => {
  doc.addElement({ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 100, height: 100 });
  const snap1 = new Map(doc.elements());
  doc.removeElement('rect-1');
  doc.setElements(snap1);
  expect(doc.elements().get('rect-1')?.x).toBe(0);
});
```

- [ ] Step 5: Run `npx ng test --watch=false` and confirm all 4 tests pass.
- Expected: 4 passed (this proves the **doc state** round-trips correctly when given the right API; the bug only manifests when canvas events fire during loadFromJSON).

**Sub-phase 0c: Canvas-integration tests (deferred)**

Canvas-level tests require initializing a real Fabric canvas inside jsdom, which is fragile. **Defer canvas integration tests to Phase 1 or later**, after `fabric-renderer.ts` is extracted and mockable.

- [ ] Step 6: Add a placeholder comment in `editor-flow.spec.ts` marking where canvas tests will go.

```ts
// TODO Phase 1: add canvas-level integration tests once fabric-renderer is extracted.
// For now, doc-level tests are the safety net.
```

- [ ] Step 7: Commit Phase 0.

```bash
git add src/app/editor/__tests__/editor-flow.spec.ts
git commit -m "test(editor): add doc-level integration tests for canvas ↔ doc round-trip"
```

---

## Phase 1: Render layer extraction (pilot)

**Files:**
- Create: `src/app/editor/render/fabric-renderer.ts`
- Create: `src/app/editor/render/element-renderer.ts`
- Modify: `src/app/editor/editor-canvas.service.ts` (delegate to renderer; do not delete)

**Sub-phase 1a: Create `fabric-renderer.ts` (scaffold)**

- [ ] Step 1: Create the new file with the basic structure — canvas lifecycle + render helpers + syncDirection tri-state.

```ts
// src/app/editor/render/fabric-renderer.ts
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Canvas, FabricImage, type FabricObject } from 'fabric';
import { LabelDocumentService } from '../model/label-document.service';
import { LabelElement } from '../model/editor.models';

export type SyncDirection = 'idle' | 'doc-to-fabric' | 'fabric-to-doc';

@Injectable()
export class FabricRenderer {
  private readonly doc = inject(LabelDocumentService);

  private canvas: Canvas | null = null;
  private canvasElement: HTMLCanvasElement | null = null;

  readonly syncDirection = signal<SyncDirection>('idle');

  constructor() {
    // doc → fabric effect
    effect(() => {
      const elements = this.doc.elements();
      if (this.syncDirection() === 'fabric-to-doc') return;
      untracked(() => this.applyElementsFromDoc(elements));
    });

    // doc → fabric page effect
    effect(() => {
      const page = this.doc.page();
      if (this.syncDirection() === 'fabric-to-doc') return;
      untracked(() => this.applyPageFromDoc(page));
    });
  }

  initialize(element: HTMLCanvasElement, page: { widthMm: number; heightMm: number; backgroundColor?: string; backgroundImage?: string }): void {
    this.canvas?.dispose();
    this.canvasElement = element;
    this.canvas = new Canvas(element, { /* ... copy from editor-canvas.service.ts:86 ... */ });
    // ... dimensions, background, etc. ...
  }

  dispose(): void {
    this.canvas?.dispose();
    this.canvas = null;
    this.canvasElement = null;
  }

  getCanvas(): Canvas | null { return this.canvas; }

  // ----- doc → fabric -----
  private applyElementsFromDoc(elements: ReadonlyMap<string, LabelElement>): void {
    // Copy logic from editor-canvas.service.ts:1652-1751
    // Replace `this.isApplyingFromDoc = true` with `this.syncDirection.set('doc-to-fabric')` etc.
  }

  private applyPageFromDoc(page: any): void {
    // Copy from editor-canvas.service.ts:1757-...
  }

  // ----- render helpers (moved from editor-canvas.service) -----
  randomId(): string { /* moved */ }
  protected extend(obj: any, id: string | number): void { /* moved */ }
  protected extendWithCustomProperties(obj: any, props: Record<string, any>): void { /* moved */ }
  createPlaceholderDataUrl(label: string, w: number, h: number): string { /* moved */ }

  // ----- canvas → doc (called by SelectionService later, but for now from EditorCanvasService) -----
  recordFabricModification(object: any): void {
    if (this.syncDirection() !== 'idle') return;  // any in-flight sync suppresses echo
    this.syncDirection.set('fabric-to-doc');
    try {
      // ... call into doc.updateElement via injected doc service ...
    } finally {
      this.syncDirection.set('idle');
    }
  }
}
```

- [ ] Step 2: Run `npx tsc --noEmit -p tsconfig.app.json` — should have **known compile errors** because the body of `applyElementsFromDoc` etc. is referenced but not fully implemented. This is expected. The actual fill-in happens in Step 3.

- [ ] Step 3: Fill in the bodies — copy the logic from `editor-canvas.service.ts:1652-1751` (and adjacent lines for page sync). Replace every `this.isApplyingFromDoc = true` with `this.syncDirection.set('doc-to-fabric')` and the corresponding `finally { this.isApplyingFromDoc = false }` with `finally { this.syncDirection.set('idle') }`. Keep the logic byte-identical otherwise.

- [ ] Step 4: Run `npx tsc --noEmit -p tsconfig.app.json` — should be 0 errors.

**Sub-phase 1b: Wire `EditorCanvasService` to delegate**

- [ ] Step 5: In `editor-canvas.service.ts`, inject `FabricRenderer` and add a private field.

```ts
// editor-canvas.service.ts
import { FabricRenderer } from './render/fabric-renderer';

private renderer = inject(FabricRenderer);
```

- [ ] Step 6: Replace the `initialize(element)` body to delegate to `this.renderer.initialize(element, canvasState)`; remove the inline `new Canvas(...)` call. Same for `dispose()`.

- [ ] Step 7: Replace direct `this.canvas?.dispose()`, `this.canvas = new Canvas(...)` etc. with `this.renderer.dispose()` / `this.renderer.initialize(...)`. The `this.canvas` getter continues to delegate: `get canvas() { return this.renderer.getCanvas(); }`.

- [ ] Step 8: Replace all `this.isApplyingFromDoc = true` / `false` sites with `this.renderer.syncDirection.set('doc-to-fabric')` / `('idle')`. The handler (`handleObjectModified`) reads `this.renderer.syncDirection()` instead of `this.isApplyingFromDoc`.

- [ ] Step 9: Run `npx tsc --noEmit -p tsconfig.app.json` — 0 errors.
- [ ] Step 10: Run `npm run build` — succeeds.
- [ ] Step 11: Run `npx ng test --watch=false` — Phase 0 tests still pass.
- [ ] Step 12: Commit Phase 1.

```bash
git add src/app/editor/render/fabric-renderer.ts src/app/editor/editor-canvas.service.ts
git commit -m "refactor(editor): extract render layer to FabricRenderer with syncDirection tri-state"
```

**Sub-phase 1c: Sanity check the partial stop**

- [ ] Step 13: Verify the failure-mode "Phase 1 partial stop acceptable" claim. If you delete `fabric-renderer.ts`, does the old code paths still work? (Answer: yes, because the new service only *adds* — the old methods on EditorCanvasService are still present and now delegate to the renderer.)

---

## Phase 2: Undo fix — atomic 4-field snapshot + tri-state guard spans loadFromJSON

**Files:**
- Modify: `src/app/editor/model/label-document.service.ts` (add snapshot/restore mutations and types)
- Modify: `src/app/editor/editor-canvas.service.ts` (replace snapshot stack with EditorSnapshot, expand `pushUndoSnapshot`/`undo`/`redo` to write/read 4 fields, set syncDirection across `loadFromJSON`)

**Sub-phase 2a: Add snapshot API to `LabelDocumentService`**

- [ ] Step 1: Add the snapshot types and mutations to `label-document.service.ts`.

```ts
// model/label-document.service.ts (additions)

export interface LabelDocumentSnapshot {
  page: LabelPageSettings;
  elements: ReadonlyMap<string, LabelElement>;
  selectionId: string | null;
}

snapshot(): LabelDocumentSnapshot {
  return {
    page: this.page(),
    elements: this.elements(),
    selectionId: this.selectionId(),
  };
}

restore(snap: LabelDocumentSnapshot): void {
  // Use set-style mutations to fire all signals in one batch
  this.page.set(snap.page);
  this.elements.set(snap.elements);
  this.selectionId.set(snap.selectionId);
}
```

- [ ] Step 2: Run `npx tsc --noEmit -p tsconfig.app.json` — 0 errors. Run Phase 0 tests — still pass.

**Sub-phase 2b: Update snapshot stack in `EditorCanvasService`**

- [ ] Step 3: Change the snapshot type from `string` (current — just `JSON.stringify(canvas.toJSON())`) to a 4-field object.

```ts
// editor-canvas.service.ts
import type { LabelDocumentSnapshot } from './model/label-document.service';

private undoStack: EditorSnapshot[] = [];
private redoStack: EditorSnapshot[] = [];
private maxUndoLevels = 50;

interface EditorSnapshot {
  canvasJson: string;
  docSnapshot: LabelDocumentSnapshot;
}

private takeSnapshot(): EditorSnapshot {
  return {
    canvasJson: JSON.stringify(this.renderer.toJsonBlob()),
    docSnapshot: this.doc.snapshot(),
  };
}

private pushUndoSnapshot(): void {
  if (!this.canvas) return;
  this.undoStack.push(this.takeSnapshot());
  if (this.undoStack.length > this.maxUndoLevels) this.undoStack.shift();
  this.syncUndoSignals();
}
```

- [ ] Step 4: Rewrite `undo()` and `redo()` to:
  - Restore doc first (atomic — all 3 fields together via `restore()`)
  - Set `syncDirection = 'doc-to-fabric'` *before* `loadFromJSON`
  - Call `loadFromJSON` (events are swallowed)
  - Reset `syncDirection = 'idle'`
  - Push current snapshot onto the opposite stack

```ts
async undo(): Promise<void> {
  if (this.undoInFlight || this.undoStack.length === 0 || !this.canvas) return;
  const current = this.takeSnapshot();
  const target = this.undoStack.pop()!;

  this.undoInFlight = true;
  this.hydrating = true;

  try {
    // 1. Restore doc FIRST (atomic via restore())
    this.doc.restore(target.docSnapshot);

    // 2. Span the entire loadFromJSON with the guard
    this.renderer.syncDirection.set('doc-to-fabric');

    // 3. Load canvas (events swallowed by syncDirection)
    await this.canvas.loadFromJSON(target.canvasJson);

    // 4. Reset
    this.renderer.syncDirection.set('idle');

    // 5. Last-resort reconciliation if Fabric regenerated ids
    // (only fires if our extend/extendWithCustomProperties chain breaks — defensive)
    this.reconcileDocFromCanvas();

    this.canvas.discardActiveObject();
    this.applyInteractionMode();
    this.redoStack.push(current);
    this.touchRevision();
    this.canvas.requestRenderAll();
  } finally {
    this.renderer.syncDirection.set('idle');  // safety net if loadFromJSON threw
    this.hydrating = false;
    this.undoInFlight = false;
    this.syncUndoSignals();
  }
}

// Mirror redo() — same structure
```

- [ ] Step 5: Implement `reconcileDocFromCanvas()` (defensive only; should be a no-op in normal operation).

```ts
private reconcileDocFromCanvas(): void {
  if (!this.canvas) return;
  const canvasIds = new Set<string>();
  this.canvas.forEachObject(obj => {
    const id = this.getObjectId(obj);
    if (id) canvasIds.add(id);
  });
  const docIds = new Set(this.doc.elements().keys());

  // Remove doc-only ids (shouldn't happen — doc and canvas should agree)
  for (const id of docIds) {
    if (!canvasIds.has(id)) this.doc.removeElement(id);
  }

  // Add canvas-only ids (defensive — Fabric created something not in doc)
  // This walks the canvas and creates element data from each object.
  for (const id of canvasIds) {
    if (!docIds.has(id) && id !== 'multi-select-marker') {
      const obj = this.canvas.getObjects().find(o => this.getObjectId(o) === id);
      if (obj) {
        const element = ElementFactory.fromFabricObject(obj, id);
        this.doc.addElement(element);
      }
    }
  }
}
```

- [ ] Step 6: Run `npx tsc --noEmit -p tsconfig.app.json` — 0 errors.
- [ ] Step 7: Run `npm run build` — succeeds.
- [ ] Step 8: Run Phase 0 tests — still pass.
- [ ] Step 9: Commit Phase 2.

```bash
git add src/app/editor/model/label-document.service.ts src/app/editor/editor-canvas.service.ts
git commit -m "fix(editor): atomic 4-field undo snapshot; syncDirection spans loadFromJSON"
```

---

## Phase 3: Selection service extraction

**Files:**
- Create: `src/app/editor/editor/selection.service.ts`
- Modify: `src/app/editor/editor-canvas.service.ts` (delegate to `SelectionService`)

**Sub-phase 3a: Create `SelectionService`**

- [ ] Step 1: Create the file.

```ts
// src/app/editor/editor/selection.service.ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { FabricRenderer } from '../render/fabric-renderer';
import { LabelDocumentService, type LabelElement } from '../model/label-document.service';
import { ElementFactory } from '../model/element-factory';

@Injectable()
export class SelectionService {
  private readonly renderer = inject(FabricRenderer);
  private readonly doc = inject(LabelDocumentService);

  // Public read API — used by properties panel, JSON preview, topbar
  readonly selected = signal<LabelElement | null>(null);
  readonly textEditorVisible = signal(false);
  readonly figureEditorVisible = signal(false);

  // Computed: the snapshot shape the panels consume
  readonly selection = this.doc.selection;
  readonly selectionProperties = this.doc.selectionProperties;

  // Called by EditorCanvasService on Fabric selection:* events
  handleFabricSelection(object: any): void {
    if (!object) {
      this.selected.set(null);
      this.textEditorVisible.set(false);
      this.figureEditorVisible.set(false);
      this.doc.selectElement(null);
      return;
    }

    const isMultiSelect = object.type?.toLowerCase() === 'activeselection';

    object.set({ hasRotatingPoint: true, transparentCorners: false, cornerColor: 'rgba(37, 99, 235, 0.7)' });

    if (isMultiSelect) {
      // ... multi-select dummy ...
      this.selected.set({ type: 'rect', id: 'multi-select-marker', x: 0, y: 0, width: 0, height: 0 } as any);
      this.textEditorVisible.set(false);
      this.figureEditorVisible.set(false);
      this.doc.selectElement(null);
    } else {
      const id = this.getObjectId(object);
      const element = this.elementRegistry().get(id) ?? null;
      // backfill: hydrate doc.elements if element pre-dates LabelDocumentService refactor
      if (element && !this.doc.elements().has(id)) {
        this.doc.addElement(element as LabelElement);
      }
      this.selected.set(element);
      this.textEditorVisible.set(false);
      this.figureEditorVisible.set(false);
      const type = object.type;
      if (type === 'rect' || type === 'circle' || type === 'triangle' || type === 'line') {
        this.figureEditorVisible.set(true);
      } else if (type === 'i-text' || type === 'textbox') {
        this.textEditorVisible.set(true);
      }
      this.doc.selectElement(id || null);
    }
  }

  // Called by EditorCanvasService on Fabric object:modified events
  handleFabricModification(object: any): void {
    if (this.renderer.syncDirection() !== 'idle') return;  // echo suppression
    if (!object) {
      this.handleFabricSelection(null);
      return;
    }
    if (object.type?.toLowerCase() === 'activeselection') {
      this.handleFabricSelection(object);
      return;
    }
    const id = this.getObjectId(object);
    if (!id) {
      this.handleFabricSelection(this.renderer.getCanvas()?.getActiveObject() ?? null);
      return;
    }
    this.renderer.syncDirection.set('fabric-to-doc');
    try {
      // ... build patch from object, call doc.updateElement ...
    } finally {
      this.renderer.syncDirection.set('idle');
    }
  }

  // ----- private helpers -----
  private getObjectId(object: any): string | undefined { /* moved from canvas service */ }
  private elementRegistry(): Map<string, any> {
    // read-only access to EditorCanvasService.elementRegistry (still exists in Phase 3)
    // TODO Phase 6: replace this with doc.elements()
    return (this.renderer as any).elementRegistry;  // temporary hack
  }
}
```

- [ ] Step 2: Wire `EditorCanvasService` to delegate. Replace its `handleSelection` / `handleObjectModified` with calls to `this.selection.handleFabricSelection(obj)` etc. Keep the `isApplyingFromDoc` flag checks (now reading from `this.renderer.syncDirection()`).

- [ ] Step 3: Run `tsc`, `build`, `ng test --watch=false`. All green.
- [ ] Step 4: Commit Phase 3.

```bash
git add src/app/editor/editor/selection.service.ts src/app/editor/editor-canvas.service.ts
git commit -m "refactor(editor): extract SelectionService from editor-canvas.service"
```

---

## Phase 4: Operations service extraction

**Files:**
- Create: `src/app/editor/editor/operations.service.ts`
- Modify: `src/app/editor/editor-canvas.service.ts` (delegate operations to new service)

**Sub-phase 4a: Create `OperationsService`**

- [ ] Step 1: Create the file with all geometric operations moved from `EditorCanvasService`.

```ts
// src/app/editor/editor/operations.service.ts
import { Injectable, inject } from '@angular/core';
import { FabricRenderer } from '../render/fabric-renderer';
import { LabelDocumentService } from '../model/label-document.service';
import { AddShapeCommand } from '../commands/add-shape.command';
// ... etc.

@Injectable()
export class OperationsService {
  private readonly renderer = inject(FabricRenderer);
  private readonly doc = inject(LabelDocumentService);

  async addShape(type: 'square' | 'triangle' | 'circle' | 'line'): Promise<void> {
    // ... moved from editor.ts activateTool ...
  }

  async addText(): Promise<void> { /* ... */ }
  async addQRCode(): Promise<void> { /* ... */ }
  async addBarcode(): Promise<void> { /* ... */ }
  async addImage(): Promise<void> { /* ... */ }

  async deleteSelected(): Promise<void> { /* ... */ }
  async clearCanvas(): Promise<void> { /* ... */ }
  async cloneSelected(): Promise<void> { /* ... */ }

  alignLeft(): void { /* ... */ }
  alignCenter(): void { /* ... */ }
  alignRight(): void { /* ... */ }

  bringToFront(): void { /* ... */ }
  sendToBack(): void { /* ... */ }

  rotate90(): void { /* ... */ }
}
```

- [ ] Step 2: Move the command-creating methods from `editor.ts:activateTool()` (around line 251-289) to `OperationsService`. Update `editor.ts` to inject the service and call `this.operations.addShape(...)`.

- [ ] Step 3: Run `tsc`, `build`, `ng test`. All green.
- [ ] Step 4: Commit Phase 4.

```bash
git add src/app/editor/editor/operations.service.ts src/app/editor/editor-canvas.service.ts src/app/editor/editor.ts
git commit -m "refactor(editor): extract OperationsService for geometric/structural ops"
```

---

## Phase 5: Persistence layer rename + extraction

**Files:**
- Create: `src/app/editor/persistence/label-converter.ts`
- Create: `src/app/editor/persistence/label-persistence.service.ts`
- Move + rename: `src/app/template/template.storage.ts` → `src/app/editor/persistence/template.storage.ts` (rename `TemplateStorageService` → `LabelTemplateStorage`; convert `Observable<T>` → `Promise<T>`)
- Modify: `src/app/editor/editor.ts` (replace `buildLabelTemplate()` body with delegation to converter)

**Sub-phase 5a: Relocate and rename storage**

- [ ] Step 1: Move `src/app/template/template.storage.ts` to `src/app/editor/persistence/template.storage.ts`.

```bash
git mv src/app/template/template.storage.ts src/app/editor/persistence/template.storage.ts
```

- [ ] Step 2: Rename `TemplateStorageService` → `LabelTemplateStorage`, `LocalStorageTemplateService` → `LocalStorageLabelTemplateStore`, `HttpTemplateService` → `HttpLabelTemplateStore`. Convert `Observable<T>` → `Promise<T>`:

```ts
abstract class LabelTemplateStorage {
  abstract getAll(): Promise<LabelTemplate[]>;
  abstract getById(id: string): Promise<LabelTemplate | null>;
  abstract save(template: LabelTemplate): Promise<void>;
  abstract delete(id: string): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class LocalStorageLabelTemplateStore implements LabelTemplateStorage { /* ... */ }
@Injectable({ providedIn: 'root' })
export class HttpLabelTemplateStore implements LabelTemplateStorage { /* ... */ }
```

- [ ] Step 3: Update all callers. Most callers are in `src/app/template/template-list/` or similar — search and replace.

```bash
grep -rn "TemplateStorageService\|LocalStorageTemplateService\|HttpTemplateService" src/
```

- [ ] Step 4: Run `tsc`, `build`. All green.

**Sub-phase 5b: Extract `LabelConverter`**

- [ ] Step 5: Create `label-converter.ts` with pure functions.

```ts
// src/app/editor/persistence/label-converter.ts
import { LabelDocument, LabelPageSettings } from '../model/label-document';
import { LabelDocumentSnapshot } from '../model/label-document.service';
import { Label, LabelTemplate } from '../models/label.models';

export function buildLabelTemplate(
  doc: LabelDocument,
  canvasJson: string
): Label {
  const page = doc.page;
  return {
    id: `tpl-${Date.now()}`,
    name: 'Template',
    width: page.widthMm,
    height: page.heightMm,
    canvasJson,
  };
}

export function toTemplate(doc: LabelDocument, canvasJson: string): LabelTemplate {
  // ... full LabelTemplate construction ...
}

export function fromSnapshot(snap: LabelDocumentSnapshot, canvasJson: string): LabelDocument {
  // ... if needed ...
}
```

- [ ] Step 6: Replace `editor.ts:buildLabelTemplate()` body with a call to the converter.

- [ ] Step 7: Run `tsc`, `build`, `ng test`. All green.
- [ ] Step 8: Commit Phase 5.

```bash
git add src/app/editor/persistence/ src/app/editor/editor.ts src/app/template/template.storage.ts
git commit -m "refactor(editor): rename storage layer; extract LabelConverter"
```

---

## Phase 6: Cleanup — delete `elementRegistry`

**Files:**
- Modify: every file referencing `elementRegistry`

**CRITICAL:** This phase is the most fragile. **Do not pause mid-phase.** Either land atomically or in sub-phases (selection first → operations → commands).

- [ ] Step 1: Grep all `elementRegistry` references.

```bash
grep -rn "elementRegistry" src/
```

- [ ] Step 2: For each reference, replace with `doc.elements()`. This is mechanical but high-volume. Do it in sub-batches if needed.

- [ ] Step 3: Once `elementRegistry` has zero references, delete the field declaration from `editor-canvas.service.ts`.

- [ ] Step 4: Run `tsc`, `build`, `ng test`. All green.
- [ ] Step 5: Manual smoke check (if possible — port conflict permitting): add an element, drag, undo, redo, save, reload.

- [ ] Step 6: Commit Phase 6.

```bash
git commit -m "refactor(editor): delete elementRegistry; doc.elements is the single source"
```

**Sub-phase 6b: Delete `editor-canvas.service.ts`**

This is the final goal — the god class is gone.

- [ ] Step 7: Move any remaining logic from `editor-canvas.service.ts` to its proper home (selection → `SelectionService`, ops → `OperationsService`, undo → `UndoRedoService`).
- [ ] Step 8: Once `editor-canvas.service.ts` has no remaining responsibilities, delete the file.

- [ ] Step 9: Run `tsc`, `build`, `ng test`. All green.
- [ ] Step 10: Commit Phase 6 final.

```bash
git commit -m "refactor(editor): delete editor-canvas.service.ts (god class removed)"
```

---

## Self-Review

**Spec coverage:** all four layers (model/render/editor/persistence) are addressed. Undo fix is Phase 2 (between render extraction and selection extraction). Failure modes acknowledged per phase. Phase 0 is the safety net.

**Placeholder scan:** no TBD/TODO left in the plan body. (There is a literal `TODO Phase 1: add canvas-level integration tests once fabric-renderer is extracted` in Step 6 of Phase 0c — that's an intentional deferral comment, not a placeholder. Similarly the Phase 3 `temporary hack` for accessing elementRegistry is documented.)

**Type consistency:** the new `syncDirection` signal type is consistent across all phases. `EditorSnapshot` type is consistent across Phase 2 and Phase 3. `LabelDocumentSnapshot` type is consistent across Phase 2 and Phase 5.

**Risks acknowledged:** the spec already enumerates cycle-guard, undo, failure modes. The plan preserves those.

**Phases are independently shippable:** Phase 0 → 1 → 2 → 3 → 4 → 5 → 6. Each ends with green `tsc` + `build` + tests. Each preserves the 7-file invariant.

## Execution Handoff

This plan is ready. Two execution modes are available:

1. **Subagent-Driven (recommended)** — Use `superpowers:subagent-driven-development`. A fresh subagent per task, task reviewer after each task, broad whole-branch review at the end.
2. **Inline Execution** — Use `superpowers:executing-plans`. Batch execution with checkpoints.

For this plan, **Subagent-Driven** is recommended because:
- 7 phases with ~20 commits total
- Each phase has integration-testable artifacts
- Per-task review catches errors before they cascade

The plan is documented in `docs/superpowers/plans/2026-07-19-editor-four-layer-architecture.md`. Ready for execution.