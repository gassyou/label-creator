# Editor Command Pattern + Renderer-on-Model — Design

**Date:** 2026-07-18
**Status:** Approved (brainstorming complete — revision 2: adds renderer-on-model)
**Scope:** Refactor element-creation logic in `editor-canvas.service.ts` into a Command Pattern with element classes that own their own Fabric rendering. Enables Undo/Redo for create, delete, and clear operations.

## Goal

Two intertwined goals:

1. **Undo/Redo for create, delete, and clear.** Today, `editor-canvas.service.ts` (1780 lines) holds five public `add*` methods, an internal element registry, and snapshot-based undo/redo infrastructure — but the public `add*` methods never push to the undo stack. Users cannot undo a freshly added element.
2. **Renderer on the model.** Each element type knows how to render itself as a Fabric object. Today the conversion logic is split between `createElementModel` (Fabric → model) and `createFabricShape` (model → Fabric) inside the service, plus inline switches inside each `add*` method. Pulling both directions onto the element classes makes adding new types a one-file change.

## Non-Goals

- No redo-by-replay. State restoration always uses the existing JSON snapshot mechanism.
- No move/resize/rotate/style commands. Those keep their current behavior.
- No async command pipeline. Commands may return Promises (image loading); the service awaits them.
- No command bus / kind-to-constructor registry. `activateTool` is the dispatch site.
- No wire-format change. Template JSON and print-pipeline data are byte-compatible with today.

## File Layout

```
src/app/editor/
  models/
    editor.models.ts                  # selection state + EditorTool (kept)
    element-base.ts                   # abstract BaseElement
    text-element.ts                   # class
    rect-element.ts                   # class
    circle-element.ts                 # class
    triangle-element.ts               # class
    line-element.ts                   # class
    barcode-element.ts                # class
    qrcode-element.ts                 # class
    image-element.ts                  # class
    element-factory.ts                # fromJSON / fromFabricObject dispatcher
    index.ts                          # re-exports
  commands/
    editor-command.ts                 # EditorCommand interface
    add-text.command.ts
    add-shape.command.ts
    add-qrcode.command.ts
    add-barcode.command.ts
    add-image.command.ts
    delete-selected.command.ts
    clear-canvas.command.ts
  editor-canvas.service.ts            # gains execute(command), getRenderContext(), shrinks
  editor.ts                           # activateTool constructs & executes commands
```

## Core Types

### Element classes

```ts
// models/element-base.ts
import type { Canvas, FabricObject } from 'fabric';
import type { ElementType } from './editor.models';

export interface RenderContext {
  canvas: Canvas;
  extend(obj: any, id: string): void;
  extendWithBarcodeProperties(obj: any, props: Record<string, any>): void;
  randomId(): string;
}

export abstract class BaseElement {
  id!: string;
  type!: ElementType;
  x!: number;
  y!: number;
  width!: number;
  height!: number;
  rotation?: number;
  visible?: boolean;
  lock?: boolean;
  zIndex?: number;
  opacity?: number;

  /** Build the Fabric representation. Async for image-bearing types. */
  abstract render(ctx: RenderContext): FabricObject | Promise<FabricObject>;

  /** Serialize to plain JSON (template wire format unchanged). */
  abstract toJSON(): Record<string, unknown>;

  /** Hydrate from a persisted template. */
  static fromJSON(data: Record<string, unknown>): BaseElement;        // implemented in factory
  /** Hydrate from a Fabric object on the canvas. */
  static fromFabricObject(obj: any): BaseElement;                     // implemented in factory
}
```

The `static fromJSON` / `fromFabricObject` are implemented **per subclass**, dispatched by `ElementFactory` so the service has one stable entry point.

### TextElement example

```ts
// models/text-element.ts
import { Textbox, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';
import { DEFAULT_SELECTION_STATE } from './editor.models';

export interface TextElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  textDecoration?: string;
  lineHeight?: number;
  charSpacing?: number;
  color?: string;
  fill?: string;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class TextElement extends BaseElement {
  declare type: 'text';
  text?: string;
  fontSize!: number;
  fontFamily!: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  textDecoration?: string;
  lineHeight?: number;
  charSpacing?: number;
  color?: string;
  fill?: string;

  constructor(data: TextElementData) {
    super();
    Object.assign(this, data);
    this.type = 'text';
    this.fontSize ??= DEFAULT_SELECTION_STATE.fontSize ?? 16;
    this.fontFamily ??= DEFAULT_SELECTION_STATE.fontFamily ?? 'Liberation Sans';
    this.width ??= 200;
  }

  render(ctx: RenderContext): FabricObject {
    const box = new Textbox(this.text?.trim() || 'Text', {
      left: this.x,
      top: this.y,
      fontFamily: this.fontFamily,
      fill: this.color ?? this.fill ?? '#111827',
      fontSize: this.fontSize,
      width: this.width,
      minWidth: 50,
      splitByGrapheme: true,
      textAlign: (this.textAlign as any) ?? 'left',
      whiteSpace: 'normal',
      originX: 'left',
      originY: 'top',
      hasRotatingPoint: true
    });
    box.on('modified', () => {
      // Convert scaling to actual width — unchanged from current behavior.
      const scaleX = box.scaleX || 1;
      const scaleY = box.scaleY || 1;
      if (scaleX !== 1 || scaleY !== 1) {
        const newWidth = scaleX !== 1 ? Math.max(50, (box.width || 50) * scaleX) : box.width;
        box.set({ width: newWidth, scaleX: 1, scaleY: 1 });
        box.setCoords();
        ctx.canvas.requestRenderAll();
      }
    });
    ctx.extend(box, this.id);
    return box;
  }

  toJSON(): TextElementData {
    const { id, type, x, y, width, height, rotation, visible, opacity, lock, zIndex,
            text, fontSize, fontFamily, fontWeight, fontStyle, textAlign,
            textDecoration, lineHeight, charSpacing, color, fill } = this;
    return { id, type, x, y, width, height, rotation, visible, opacity, lock, zIndex,
             text, fontSize, fontFamily, fontWeight, fontStyle, textAlign,
             textDecoration, lineHeight, charSpacing, color, fill };
  }

  static fromJSON(data: TextElementData): TextElement {
    return new TextElement(data);
  }

  static fromFabricObject(obj: any): TextElement {
    return new TextElement({
      id: obj.elementId ?? obj.id,                                   // service supplies via extend()
      x: obj.left ?? 0,
      y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0,
      opacity: obj.opacity ?? 1,
      visible: obj.visible ?? true,
      lock: !obj.selectable,
      text: obj.text ?? '',
      fontSize: obj.fontSize ?? 16,
      fontFamily: obj.fontFamily ?? 'Liberation Sans',
      fontWeight: obj.fontWeight ?? '',
      fontStyle: obj.fontStyle ?? '',
      textAlign: obj.textAlign ?? 'left',
      color: obj.fill ?? '#000000',
      lineHeight: obj.lineHeight ?? 1.16,
      charSpacing: obj.charSpacing ?? 0
    });
  }
}
```

`RectElement`, `CircleElement`, `TriangleElement`, `LineElement` follow the same shape with their own render() building the matching Fabric primitive. `QRCodeElement`, `BarcodeElement`, `ImageElement` make `render` async (FabricImage.fromURL returns a Promise) and carry the placeholder/url/format metadata.

### ElementFactory

```ts
// models/element-factory.ts
import { TextElement } from './text-element';
import { RectElement } from './rect-element';
import { CircleElement } from './circle-element';
import { TriangleElement } from './triangle-element';
import { LineElement } from './line-element';
import { BarcodeElement } from './barcode-element';
import { QRCodeElement } from './qrcode-element';
import { ImageElement } from './image-element';
import { BaseElement } from './element-base';

export const ElementFactory = {
  fromJSON(data: Record<string, unknown>): BaseElement {
    switch (data.type) {
      case 'text':    return TextElement.fromJSON(data as any);
      case 'rect':    return RectElement.fromJSON(data as any);
      case 'circle':  return CircleElement.fromJSON(data as any);
      case 'triangle':return TriangleElement.fromJSON(data as any);
      case 'line':    return LineElement.fromJSON(data as any);
      case 'barcode': return BarcodeElement.fromJSON(data as any);
      case 'qrcode':  return QRCodeElement.fromJSON(data as any);
      case 'image':   return ImageElement.fromJSON(data as any);
      default: throw new Error(`Unknown element type: ${(data as any).type}`);
    }
  },
  fromFabricObject(obj: any): BaseElement {
    switch (obj.elementType as string) {                            // set via ctx.extend()
      case 'text':    return TextElement.fromFabricObject(obj);
      case 'rect':    return RectElement.fromFabricObject(obj);
      case 'circle':  return CircleElement.fromFabricObject(obj);
      case 'triangle':return TriangleElement.fromFabricObject(obj);
      case 'line':    return LineElement.fromFabricObject(obj);
      case 'barcode': return BarcodeElement.fromFabricObject(obj);
      case 'qrcode':  return QRCodeElement.fromFabricObject(obj);
      case 'image':   return ImageElement.fromFabricObject(obj);
      default: throw new Error(`Unknown element type on Fabric object: ${obj.elementType}`);
    }
  }
};
```

## EditorCommand

```ts
// commands/editor-command.ts
import type { EditorCanvasService } from '../editor-canvas.service';

export interface EditorCommand {
  readonly name: string;
  execute(ctx: EditorCanvasService): void | Promise<void>;
  undo(ctx: EditorCanvasService): void;
}
```

## Service Surface (revised)

```ts
// editor-canvas.service.ts
execute(command: EditorCommand): Promise<void> {
  this.pushUndoSnapshot();
  this.redoStack.length = 0;
  try {
    await command.execute(this);
    this.touchRevision();
  } catch (err) {
    this.undoStack.pop();
    throw err;
  }
}

undo(): void { /* pop undo stack, hydrate canvas from snapshot */ }
redo(): void { /* pop redo stack, hydrate canvas from snapshot */ }
canUndo(): boolean { return this.undoStack.length > 0; }
canRedo(): boolean { return this.redoStack.length > 0; }

readonly canUndoSignal = computed(() => this.undoStack.length > 0);
readonly canRedoSignal = computed(() => this.redoStack.length > 0);

// Render context handed to elements' render(ctx)
getRenderContext(): RenderContext {
  if (!this.canvas) throw new Error('Canvas not initialized');
  return {
    canvas: this.canvas,
    extend: (obj, id) => this.extend(obj, id),
    extendWithBarcodeProperties: (obj, props) => this.extendWithBarcodeProperties(obj, props),
    randomId: () => this.randomId()
  };
}

// Narrow registry accessor
getElementRegistry(): Map<string, BaseElement> { return this.elementRegistry; }

// Public add* methods are thin wrappers; they now return Promises:
async addText(content: string): Promise<TextElement> {
  const cmd = new AddTextCommand(content);
  await this.execute(cmd);
  return cmd.element!;
}
```

The service loses the giant `createElementModel` and `createFabricShape` switches. They're replaced by:

- `ElementFactory.fromFabricObject(obj)` — used in canvas hydration.
- `element.render(ctx.getRenderContext())` — used during command execution.

## Commands

| Command                 | Construction                              | `execute()`                                                                          | `undo()`                |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| `AddTextCommand`        | `new AddTextCommand(content)`             | `new TextElement(...)` → `render(ctx)` → register → add → select                     | `element = null`        |
| `AddShapeCommand`       | `new AddShapeCommand(type)`               | Build matching subclass → `render(ctx)` → register → add → select                    | `element = null`        |
| `AddQRCodeCommand`      | `new AddQRCodeCommand(binding?)`          | `new QRCodeElement(...)` → `render(ctx)` (async) → register → add → select           | `element = null`        |
| `AddBarcodeCommand`     | `new AddBarcodeCommand(format, binding?)` | `new BarcodeElement(...)` → `render(ctx)` (async) → register → add → select          | `element = null`        |
| `AddImageCommand`       | `new AddImageCommand(url)`                | `new ImageElement(...)` → `render(ctx)` (async) → register → add → select             | `element = null`        |
| `DeleteSelectedCommand` | `new DeleteSelectedCommand()`             | `ctx.deleteSelectedInternal()`                                                       | no-op (snapshot covers) |
| `ClearCanvasCommand`    | `new ClearCanvasCommand()`                | `ctx.clearCanvasInternal()`                                                          | no-op (snapshot covers) |

Each command exposes an `element: BaseElement | null` field populated during `execute()` so the wrapper on the service can return the new element to callers.

### Add-text command (final)

```ts
export class AddTextCommand implements EditorCommand {
  readonly name = 'add-text';
  element: TextElement | null = null;

  constructor(private readonly content: string) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    this.element = new TextElement({
      id: ctx.randomId(),
      x: 24, y: 24,
      width: 200,
      text: this.content,
      fontSize: DEFAULT_SELECTION_STATE.fontSize,
      fontFamily: DEFAULT_SELECTION_STATE.fontFamily,
      color: '#111827'
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.elementRegistry.set(this.element.id, this.element);
    ctx.canvas.add(obj);
    ctx.selectItemAfterAdded(obj);
  }

  undo(_ctx: EditorCanvasService): void { this.element = null; }
}
```

Compare to the original 40-line `addText` body: this is 6 lines of actual work plus a `render` call.

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

Keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) bind to `canvasService.undo()` / `redo()`.

## Hydration Path (canvas load)

The existing `editor-canvas.service.ts:702-727` block iterates Fabric objects on the canvas and calls `createElementModel(object, objType)`. With the new design it becomes:

```ts
const element = ElementFactory.fromFabricObject(object);
this.elementRegistry.set(element.id, element);
```

Template load (templates → canvas) becomes:

```ts
for (const data of template.elements) {
  const element = ElementFactory.fromJSON(data);
  const obj = await element.render(this.getRenderContext());
  this.canvas.add(obj);
  this.elementRegistry.set(element.id, element);
}
```

Template save (canvas → templates) iterates the registry and calls `element.toJSON()`.

## Error Handling

- `execute()` pushes the snapshot **before** awaiting the command.
- On throw, the just-pushed snapshot is popped and the error re-thrown — failed actions leave no orphan history.
- Image-bearing commands (`AddQRCodeCommand`, `AddBarcodeCommand`, `AddImageCommand`) validate `canvas` non-null at the top of `execute()`.

## Test Surface

- Each command is unit-testable with a partial mock of `EditorCanvasService` exposing only `canvas`, `randomId`, `getRenderContext`, `elementRegistry`, `selectItemAfterAdded`.
- Each element class is testable by passing a stub `RenderContext` and asserting on the returned Fabric object.
- `ElementFactory.fromJSON` / `fromFabricObject` are pure data-conversion functions; trivially testable.
- The wrapper `add*` methods remain so existing tests calling `addText(...)` etc. still pass (now returning a Promise — callers that ignored the value are unchanged).

## Migration Order

1. **Add `BaseElement` and `TextElement` only.** Promote TextElement to a class with `render`, `toJSON`, `fromJSON`, `fromFabricObject`. Replace the inline Textbox construction inside `addText` with `new TextElement(...).render(ctx.getRenderContext())`. Verify in the running app that text creates identically and JSON persists identically.
2. **Promote the other creation shapes:** RectElement, CircleElement, TriangleElement, LineElement (each in its own small PR). Update the matching `addShape` branch to use the new class. Remove `createFabricShape` and `createElementModel` switches as each shape migrates.
3. **Promote QRCodeElement, BarcodeElement, ImageElement** (async render).
4. **Add `ElementFactory`**; replace remaining `createElementModel` call sites with `ElementFactory.fromFabricObject`.
5. **Add commands:** `AddTextCommand` first (already partially done as a class), then `AddShapeCommand`, `AddQRCodeCommand`, etc. Make the public `add*` methods thin async wrappers around `execute(cmd)`.
6. **Add `DeleteSelectedCommand` and `ClearCanvasCommand`** plus their internal service methods.
7. **Update `activateTool`** to construct & execute commands.
8. **Wire `canUndoSignal` / `canRedoSignal`** and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z shortcuts.
9. **Verify** undo/redo round-trip for each operation; verify template save/load still produces identical JSON; verify print generators still receive data of the same shape.

## Risks

- **Snapshot timing**: pushing the snapshot before awaiting the async command means an undo during image load may restore a half-loaded canvas. Mitigated by the existing `hydrating` flag.
- **`instanceof` checks elsewhere**: codebase uses `type` discrimination on plain objects, not `instanceof`. Promoting to classes is safe. The one place to verify is the print path, which only sees serialized JSON — and we keep `toJSON` field-compatible.
- **Height/width after render**: Fabric's Textbox computes `height` post-render. Today's code copies `object.height` into the model after rendering via `extend()`. We preserve this — `extend()` runs at the end of `render()` so the model's height stays accurate.
- **Visibility**: the service's `extend` / `selectItemAfterAdded` / `extendWithBarcodeProperties` / `randomId` are currently `private`. **Decision:** change from `private` to `protected` with a JSDoc explaining they are called by element `render()` methods and by commands. The element registry is accessed via `getElementRegistry()`.
- **Wire format**: every `toJSON()` must produce the same field names and shape as today's template entries. Verified by round-trip: load saved template → compare bytes.
- **Migration order**: TextElement migration is the smallest, most isolated change. If anything goes wrong, the user already approved TextElement specifically as the proof point — it's the right first step.

## Out of Scope

- Multi-step macro commands (paste, template-insert).
- Move / resize / rotate / style commands.
- Redo-by-replay.
- Persisting the undo stack across sessions.
- A UI panel listing recent commands.
- Changing the print-pipeline data shape.