# Editor Command Pattern — Design

**Date:** 2026-07-18
**Status:** Approved (brainstorming complete)
**Scope:** Refactor element-creation logic in `editor-canvas.service.ts` into a Command Pattern, enabling Undo/Redo for create, delete, and clear operations.

## Goal

Make every discrete editor action an undoable, testable unit. Today, `editor-canvas.service.ts` (1780 lines) holds five public `add*` methods, an internal element registry, and snapshot-based undo/redo infrastructure — but the public `add*` methods never push to the undo stack. As a result, users cannot undo a freshly added element.

This refactor extracts creation and deletion into named Command classes, threads them through a single `execute()` entry point, and exposes Undo/Redo to the UI.

## Non-Goals

- No redo-by-replay. State restoration always uses the existing JSON snapshot mechanism.
- No move/resize/rotate/style commands. Those keep their current behavior.
- No async command pipeline. Commands may return Promises (image loading); the service awaits them.
- No command bus / kind-to-constructor registry. `activateTool` is the dispatch site.

## File Layout

```
src/app/editor/
  commands/
    editor-command.ts                  # EditorCommand interface
    add-text.command.ts
    add-shape.command.ts
    add-qrcode.command.ts
    add-barcode.command.ts
    add-image.command.ts
    delete-selected.command.ts
    clear-canvas.command.ts
  editor-canvas.service.ts             # gains execute(command), keeps helpers
  editor.ts                            # activateTool constructs & executes commands
```

## Core Interface

```ts
// commands/editor-command.ts
import type { EditorCanvasService } from '../editor-canvas.service';

export interface EditorCommand {
  readonly name: string;                                       // for debugging / future UI
  execute(ctx: EditorCanvasService): void | Promise<void>;
  undo(ctx: EditorCanvasService): void;
}
```

## Service Surface (additions)

```ts
// editor-canvas.service.ts
execute(command: EditorCommand): Promise<void> {
  this.pushUndoSnapshot();
  this.redoStack.length = 0;
  try {
    await command.execute(this);
    this.touchRevision();
  } catch (err) {
    // Snapshot already pushed; pop it so failed actions leave no orphan.
    this.undoStack.pop();
    throw err;
  }
}

undo(): void { /* pop undo stack, hydrate canvas from snapshot */ }
redo(): void { /* pop redo stack, hydrate canvas from snapshot */ }
canUndo(): boolean { return this.undoStack.length > 0; }
canRedo(): boolean { return this.redoStack.length > 0; }

// Reactive signals for UI binding
readonly canUndo = computed(() => this.undoStack.length > 0);
readonly canRedo = computed(() => this.redoStack.length > 0);

// Narrow accessor for the element registry (commands must not mutate private state directly)
getElementRegistry(): Map<string, LabelElement> { return this.elementRegistry; }

// Existing public add* methods stay as thin wrappers:
//   addText(content) { const c = new AddTextCommand(content); await this.execute(c); return c.lastCreated!; }
// so any internal/test callers continue to work during the migration.
```

## Commands

| Command           | Construction                       | `execute()`                                                | `undo()`                |
| ----------------- | ---------------------------------- | ---------------------------------------------------------- | ----------------------- |
| `AddTextCommand`  | `new AddTextCommand(content)`      | Build Textbox, extend, register, add, select               | `lastCreated = null`    |
| `AddShapeCommand` | `new AddShapeCommand(type)`        | Build shape model + Fabric object, register, add, select  | `lastCreated = null`    |
| `AddQRCodeCommand`| `new AddQRCodeCommand(binding?)`   | Generate placeholder, load FabricImage, set props, add     | `lastCreated = null`    |
| `AddBarcodeCommand`| `new AddBarcodeCommand(format, binding?)` | Same as QRCode but for barcode                     | `lastCreated = null`    |
| `AddImageCommand` | `new AddImageCommand(url)`         | `FabricImage.fromURL`, scale, extend, add                  | `lastCreated = null`    |
| `DeleteSelectedCommand` | `new DeleteSelectedCommand()` | Call `ctx.deleteSelectedInternal()`                        | no-op (snapshot covers) |
| `ClearCanvasCommand`    | `new ClearCanvasCommand()`     | Call `ctx.clearCanvasInternal()`                           | no-op (snapshot covers) |

Each command exposes a `lastCreated: LabelElement | null` field populated during `execute()` so the wrapper on the service can return the new element to callers (e.g., for selection in the properties panel).

### Add-text shape

```ts
export class AddTextCommand implements EditorCommand {
  readonly name = 'add-text';
  lastCreated: TextElement | null = null;

  constructor(private readonly content: string) {}

  execute(ctx: EditorCanvasService): void {
    if (!ctx.canvas) throw new Error('Canvas not initialized');
    const id = ctx.randomId();
    const textbox = new Textbox(this.content.trim() || 'Text', {
      left: 24, top: 24,
      fontFamily: DEFAULT_SELECTION_STATE.fontFamily,
      fill: '#111827',
      fontSize: DEFAULT_SELECTION_STATE.fontSize,
      width: 200, minWidth: 50,
      splitByGrapheme: true, textAlign: 'left', whiteSpace: 'normal',
      originX: 'left', originY: 'top', hasRotatingPoint: true
    });
    textbox.on('modified', () => { /* unchanged handler */ });
    ctx.extend(textbox, id);
    const element = ctx.createElementModel(textbox, 'text') as TextElement;
    ctx.elementRegistry.set(element.id, element);
    ctx.canvas.add(textbox);
    ctx.selectItemAfterAdded(textbox);
    this.lastCreated = element;
  }

  undo(ctx: EditorCanvasService): void { this.lastCreated = null; }
}
```

`AddShapeCommand` mirrors the existing switch on `'square' | 'triangle' | 'circle' | 'line'` — each branch builds the matching model, calls `createFabricShape`, extends, registers, and selects. `AddQRCodeCommand`, `AddBarcodeCommand`, and `AddImageCommand` move their existing bodies verbatim into `execute()`.

## Call Site Rewrite

```ts
// editor.ts — activateTool
activateTool(tool: EditorTool): void {
  this.activeTool.set(tool);

  let cmd: EditorCommand;
  switch (tool) {
    case 'select':   this.canvasService.clearSelection(); return;
    case 'text':     cmd = new AddTextCommand(this.textString); this.textString = 'Text'; break;
    case 'square':
    case 'circle':
    case 'triangle':
    case 'line':     cmd = new AddShapeCommand(tool); break;
    case 'qrcode':   cmd = new AddQRCodeCommand(); break;
    case 'barcode':  cmd = new AddBarcodeCommand('CODE128'); break;
  }
  void this.canvasService.execute(cmd);
}
```

Keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) bind to `canvasService.undo()` / `redo()` directly.

## Error Handling

- `execute()` pushes the snapshot **before** awaiting the command.
- On throw, the just-pushed snapshot is popped and the error re-thrown — failed actions leave no orphan history.
- `AddQRCodeCommand` and `AddBarcodeCommand` already validate `canvas` non-null at the top of `execute()`.

## Test Surface

- Each command is unit-testable with a partial mock of `EditorCanvasService` exposing only `canvas`, `randomId`, `extend`, `createElementModel`, `selectItemAfterAdded`, `extendWithBarcodeProperties`, `elementRegistry`.
- `execute(command)` is testable end-to-end by feeding it commands and asserting on canvas JSON.
- The wrapper `add*` methods remain so existing tests calling `addText(...)` etc. still pass.

## Migration Order

1. Add `editor-command.ts` interface.
2. Move creation logic into `AddTextCommand` first (smallest, most-similar refactor); make the public `addText` a wrapper around it.
3. Repeat for `AddShapeCommand`, `AddQRCodeCommand`, `AddBarcodeCommand`, `AddImageCommand`.
4. Add `DeleteSelectedCommand` and `ClearCanvasCommand` plus their internal service methods.
5. Update `activateTool` to construct & execute commands.
6. Wire `canUndo` / `canRedo` signals and keyboard shortcuts.
7. Verify undo/redo round-trip for each operation in the running app.

## Risks

- **Snapshot timing**: pushing the snapshot before awaiting the async command means an undo during image load may restore a half-loaded canvas. Mitigated by `hydrating` flag the service already maintains.
- **TypeScript visibility**: commands call `ctx.elementRegistry.set(...)` which is currently `private`. Solution: commands access the registry via `getElementRegistry()`, but the registry returned is the same Map — mutations work. Alternatively, change `elementRegistry` from `private` to `protected` with a single comment explaining command access. **Decision:** use the `getElementRegistry()` accessor so the mutation API stays narrow.
- **`extend` / `createElementModel`** / `selectItemAfterAdded` / `extendWithBarcodeProperties` / `createFabricShape` / `randomId` / `createPlaceholderDataUrl`: these are currently `private`. **Decision:** change visibility from `private` to `protected` with a JSDoc explaining they are called by commands in `commands/`. The element registry (a mutable Map) is accessed via `getElementRegistry()` to keep a clean seam.
- **Result:** commands call internal helpers directly (they're now `protected`) and the registry through its accessor — two channels, each with a clear reason.

## Out of Scope

- Multi-step macro commands (paste, template-insert).
- Move / resize / rotate / style commands.
- Redo-by-replay.
- Persisting the undo stack across sessions.
- A UI panel listing recent commands.