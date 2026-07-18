# Editor Command Pattern + Renderer-on-Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `editor-canvas.service.ts` element creation/deletion into Command Pattern with element classes that own their own Fabric rendering. Wire Undo/Redo for create, delete, and clear operations. Preserve the on-disk template JSON exactly.

**Architecture:** Promote the `LabelElement` interface union into a class hierarchy (`BaseElement` abstract + concrete `TextElement`/`RectElement`/etc.). Each class owns its Fabric `render(ctx)`, JSON `toJSON()`, and static hydrators `fromJSON()`/`fromFabricObject()`. An `ElementFactory` dispatches hydration. `EditorCommand` interface unifies create/delete/clear behind one `execute(ctx)` entry point on `EditorCanvasService`. Per-step JSON snapshots remain the undo source of truth.

**Tech Stack:** Angular 21.1, TypeScript 5.9, Fabric 7.4, signal-based reactivity. No new dependencies. Existing `npm test` (vitest) for unit tests where applicable; manual verification in the running app for Fabric-coupled integration.

**Spec:** `docs/superpowers/specs/2026-07-18-editor-command-pattern-design.md`

## Global Constraints

- **Wire format:** every class's `toJSON()` produces the same field names and shape as today's template entries — print pipeline, template storage, and downstream consumers must see no change.
- **Visibility:** service helpers (`extend`, `extendWithBarcodeProperties`, `createPlaceholderDataUrl`, `randomId`, `selectItemAfterAdded`, `createFabricShape`, `createElementModel`) move from `private` to `protected` with a JSDoc explaining they are called by element `render()` methods and by commands.
- **Construction:** element classes and commands are plain `new`-able classes — no `@Injectable()` decorators, no DI.
- **`ElementType` and `LabelElement` re-export:** the existing `editor.models.ts` keeps `EditorTool`, `EditorSelectionState`, `ElementType` (the literal string union), and a re-export of the new class union as `LabelElement` for the print path. The existing interface aliases (`TextElement` etc.) are removed; consumers reference the classes by the same names.
- **`exactOptionalPropertyTypes`:** TS strict-optional — preserve `?` only on fields that were optional in the existing interface.
- **Async:** element `render()` returns `FabricObject | Promise<FabricObject>`; service `execute()` is `Promise<void>`.
- **Migration gate:** each task that changes user-visible behavior must end with a manual check in the running app (start dev server, create the element type, save & reload a template, undo/redo) before its commit.

---

## Task 1: Add `BaseElement` abstract class and `RenderContext`

**Files:**
- Create: `src/app/editor/models/element-base.ts`

**Interfaces:**
- Produces: `BaseElement` (abstract class) and `RenderContext` interface.
- Consumes (later): `ElementType` from `editor.models.ts`.

- [ ] **Step 1: Write the file**

```ts
// src/app/editor/models/element-base.ts
import type { Canvas, FabricObject } from 'fabric';
import type { ElementType } from './editor.models';

/**
 * Narrow context handed to a BaseElement when it builds its Fabric
 * representation on the canvas. Provided by EditorCanvasService.
 */
export interface RenderContext {
  canvas: Canvas;
  extend(obj: any, id: string | number): void;
  extendWithBarcodeProperties(obj: any, props: Record<string, any>): void;
  randomId(): string;
}

/**
 * BaseElement owns its own Fabric rendering and its own JSON serialization.
 * Concrete subclasses implement render(), toJSON(); hydration (fromJSON,
 * fromFabricObject) is dispatched by ElementFactory.
 */
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

  abstract render(ctx: RenderContext): FabricObject | Promise<FabricObject>;
  abstract toJSON(): Record<string, unknown>;
}
```

- [ ] **Step 2: Run `npx tsc --noEmit` to confirm the file type-checks**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors (or only pre-existing errors unrelated to this file).

- [ ] **Step 3: Commit**

```bash
git add src/app/editor/models/element-base.ts
git commit -m "feat(editor): add BaseElement abstract class and RenderContext"
```

---

## Task 2: Add `TextElement` class (the proof point)

**Files:**
- Create: `src/app/editor/models/text-element.ts`

**Interfaces:**
- Produces: `TextElement extends BaseElement`, `TextElementData` interface.
- Consumes: `BaseElement`, `RenderContext`, `DEFAULT_SELECTION_STATE` from `editor.models`.

- [ ] **Step 1: Write `TextElement`**

```ts
// src/app/editor/models/text-element.ts
import { Textbox, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';
import { DEFAULT_SELECTION_STATE } from './editor.models';

export interface TextElementData {
  id: string;
  x: number;
  y: number;
  width?: number;
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
      const scaleX = box.scaleX || 1;
      const scaleY = box.scaleY || 1;
      if (scaleX !== 1 || scaleY !== 1) {
        const newWidth =
          scaleX !== 1 ? Math.max(50, (box.width || 50) * scaleX) : box.width;
        box.set({ width: newWidth, scaleX: 1, scaleY: 1 });
        box.setCoords();
        ctx.canvas.requestRenderAll();
      }
    });
    ctx.extend(box, this.id);
    return box;
  }

  toJSON(): TextElementData {
    return {
      id: this.id,
      type: 'text' as const,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      visible: this.visible,
      opacity: this.opacity,
      lock: this.lock,
      text: this.text,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle,
      textAlign: this.textAlign,
      textDecoration: this.textDecoration,
      lineHeight: this.lineHeight,
      charSpacing: this.charSpacing,
      color: this.color,
      fill: this.fill
    } as TextElementData;
  }

  static fromJSON(data: TextElementData): TextElement {
    return new TextElement(data);
  }

  static fromFabricObject(obj: any, id: string): TextElement {
    return new TextElement({
      id,
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

- [ ] **Step 2: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/editor/models/text-element.ts
git commit -m "feat(editor): add TextElement class with render, toJSON, hydrators"
```

---

## Task 3: Promote the other creation shape classes

**Files:**
- Create: `src/app/editor/models/rect-element.ts`
- Create: `src/app/editor/models/circle-element.ts`
- Create: `src/app/editor/models/triangle-element.ts`
- Create: `src/app/editor/models/line-element.ts`

**Interfaces:**
- Produces: `RectElement`, `CircleElement`, `TriangleElement`, `LineElement` extending `BaseElement` (each in its own file).
- Consumes: `BaseElement`, `RenderContext`, `Fabric.Rect`/`Circle`/`Triangle`/`Line` from `fabric`.

- [ ] **Step 1: Write `RectElement`**

```ts
// src/app/editor/models/rect-element.ts
import { Rect, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface RectElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class RectElement extends BaseElement {
  declare type: 'rect';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;

  constructor(data: RectElementData) {
    super();
    Object.assign(this, data);
    this.type = 'rect';
  }

  render(ctx: RenderContext): FabricObject {
    const rect = new Rect({
      left: this.x,
      top: this.y,
      width: this.width,
      height: this.height,
      fill: this.fill ?? '#000000',
      stroke: this.stroke || undefined,
      strokeWidth: this.strokeWidth || 0,
      rx: this.radius ?? 0,
      ry: this.radius ?? 0,
      originX: 'left',
      originY: 'top',
      hasRotatingPoint: true
    });
    ctx.extend(rect, this.id);
    return rect;
  }

  toJSON(): RectElementData {
    return {
      id: this.id, type: 'rect' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      fill: this.fill, stroke: this.stroke, strokeWidth: this.strokeWidth, radius: this.radius
    };
  }

  static fromJSON(data: RectElementData): RectElement { return new RectElement(data); }

  static fromFabricObject(obj: any, id: string): RectElement {
    return new RectElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      fill: obj.fill ?? '#000000',
      stroke: obj.stroke ?? '',
      strokeWidth: obj.strokeWidth ?? 0,
      radius: obj.rx ?? 0
    });
  }
}
```

- [ ] **Step 2: Write `CircleElement`**

```ts
// src/app/editor/models/circle-element.ts
import { Circle, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface CircleElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class CircleElement extends BaseElement {
  declare type: 'circle';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;

  constructor(data: CircleElementData) {
    super();
    Object.assign(this, data);
    this.type = 'circle';
  }

  render(ctx: RenderContext): FabricObject {
    const radius = Math.max(this.width, this.height) / 2;
    const c = new Circle({
      left: this.x,
      top: this.y,
      radius,
      fill: this.fill ?? '#000000',
      stroke: this.stroke || undefined,
      strokeWidth: this.strokeWidth || 0,
      originX: 'left',
      originY: 'top',
      hasRotatingPoint: true
    });
    ctx.extend(c, this.id);
    return c;
  }

  toJSON(): CircleElementData {
    return {
      id: this.id, type: 'circle' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      fill: this.fill, stroke: this.stroke, strokeWidth: this.strokeWidth
    };
  }

  static fromJSON(data: CircleElementData): CircleElement { return new CircleElement(data); }

  static fromFabricObject(obj: any, id: string): CircleElement {
    return new CircleElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      fill: obj.fill ?? '#000000',
      stroke: obj.stroke ?? '',
      strokeWidth: obj.strokeWidth ?? 0
    });
  }
}
```

- [ ] **Step 3: Write `TriangleElement`**

```ts
// src/app/editor/models/triangle-element.ts
import { Triangle, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface TriangleElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class TriangleElement extends BaseElement {
  declare type: 'triangle';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;

  constructor(data: TriangleElementData) {
    super();
    Object.assign(this, data);
    this.type = 'triangle';
  }

  render(ctx: RenderContext): FabricObject {
    const t = new Triangle({
      left: this.x, top: this.y,
      width: this.width, height: this.height,
      fill: this.fill ?? '#000000',
      stroke: this.stroke || undefined,
      strokeWidth: this.strokeWidth || 0,
      originX: 'left', originY: 'top',
      hasRotatingPoint: true
    });
    ctx.extend(t, this.id);
    return t;
  }

  toJSON(): TriangleElementData {
    return {
      id: this.id, type: 'triangle' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      fill: this.fill, stroke: this.stroke, strokeWidth: this.strokeWidth
    };
  }

  static fromJSON(data: TriangleElementData): TriangleElement { return new TriangleElement(data); }

  static fromFabricObject(obj: any, id: string): TriangleElement {
    return new TriangleElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      fill: obj.fill ?? '#000000',
      stroke: obj.stroke ?? '',
      strokeWidth: obj.strokeWidth ?? 0
    });
  }
}
```

- [ ] **Step 4: Write `LineElement`**

```ts
// src/app/editor/models/line-element.ts
import { Line, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface LineElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class LineElement extends BaseElement {
  declare type: 'line';
  stroke!: string;
  strokeWidth!: number;

  constructor(data: LineElementData) {
    super();
    Object.assign(this, data);
    this.type = 'line';
  }

  render(ctx: RenderContext): FabricObject {
    const line = new Line([this.x, this.y, this.x + this.width, this.y + this.height], {
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      originX: 'left', originY: 'top',
      hasRotatingPoint: true
    });
    ctx.extend(line, this.id);
    return line;
  }

  toJSON(): LineElementData {
    return {
      id: this.id, type: 'line' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      stroke: this.stroke, strokeWidth: this.strokeWidth
    };
  }

  static fromJSON(data: LineElementData): LineElement { return new LineElement(data); }

  static fromFabricObject(obj: any, id: string): LineElement {
    return new LineElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: ((obj.x2 ?? 0) - (obj.x1 ?? 0)) || obj.width || 100,
      height: ((obj.y2 ?? 0) - (obj.y1 ?? 0)) || obj.height || 0,
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      stroke: obj.stroke ?? '#000000',
      strokeWidth: obj.strokeWidth ?? 1
    });
  }
}
```

- [ ] **Step 5: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/editor/models/rect-element.ts \
        src/app/editor/models/circle-element.ts \
        src/app/editor/models/triangle-element.ts \
        src/app/editor/models/line-element.ts
git commit -m "feat(editor): add Rect/Circle/Triangle/Line element classes"
```

---

## Task 4: Promote `QRCodeElement`, `BarcodeElement`, `ImageElement`

**Files:**
- Create: `src/app/editor/models/qrcode-element.ts`
- Create: `src/app/editor/models/barcode-element.ts`
- Create: `src/app/editor/models/image-element.ts`

**Interfaces:**
- Produces: `QRCodeElement`, `BarcodeElement`, `ImageElement`. `render()` is `async` (returns `Promise<FabricObject>`) because `FabricImage.fromURL` is async.
- Consumes: `BaseElement`, `RenderContext`, `FabricImage` from `fabric`. The data URL placeholder generation lives in the service and is reached through `RenderContext` if needed (see notes).

- [ ] **Step 1: Write `QRCodeElement`**

```ts
// src/app/editor/models/qrcode-element.ts
import { FabricImage, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface QRCodeElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
  binding?: string;
  errorCorrectionLevel?: string;
  foregroundColor?: string;
  backgroundColor?: string;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class QRCodeElement extends BaseElement {
  declare type: 'qrcode';
  value?: string;
  binding?: string;
  errorCorrectionLevel?: string;
  foregroundColor?: string;
  backgroundColor?: string;

  constructor(data: QRCodeElementData) {
    super();
    Object.assign(this, data);
    this.type = 'qrcode';
  }

  async render(ctx: RenderContext): Promise<FabricObject> {
    const dataUrl = (ctx as any).createPlaceholderDataUrl?.('QR', this.width, this.height)
      ?? `data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='${this.width}' height='${this.height}'><rect width='100%' height='100%' fill='#fff'/><text x='50%' y='50%' text-anchor='middle' dy='.3em' font-size='12' fill='#999'>QR</text></svg>`
        )}`;
    const img = await FabricImage.fromURL(dataUrl);
    img.set({
      left: this.x, top: this.y,
      width: this.width, height: this.height,
      scaleX: 1, scaleY: 1,
      originX: 'left', originY: 'top',
      hasRotatingPoint: true
    });
    (img as any).elementType = 'qrcode';
    (img as any).bindingValue = this.binding ?? this.value ?? '';
    (img as any).errorCorrectionLevel = this.errorCorrectionLevel ?? 'M';
    (img as any).foregroundColor = this.foregroundColor ?? '#000000';
    (img as any).backgroundColor = this.backgroundColor ?? '#ffffff';
    ctx.extendWithBarcodeProperties(img, {
      elementType: 'qrcode',
      bindingValue: (img as any).bindingValue,
      errorCorrectionLevel: (img as any).errorCorrectionLevel,
      foregroundColor: (img as any).foregroundColor,
      backgroundColor: (img as any).backgroundColor
    });
    ctx.extend(img, this.id);
    return img;
  }

  toJSON(): QRCodeElementData {
    return {
      id: this.id, type: 'qrcode' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      value: this.value, binding: this.binding,
      errorCorrectionLevel: this.errorCorrectionLevel,
      foregroundColor: this.foregroundColor,
      backgroundColor: this.backgroundColor
    };
  }

  static fromJSON(data: QRCodeElementData): QRCodeElement { return new QRCodeElement(data); }

  static fromFabricObject(obj: any, id: string): QRCodeElement {
    return new QRCodeElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      value: obj.bindingValue ?? '',
      binding: obj.bindingValue ?? '',
      errorCorrectionLevel: obj.errorCorrectionLevel ?? 'M',
      foregroundColor: obj.foregroundColor ?? '#000000',
      backgroundColor: obj.backgroundColor ?? '#ffffff'
    });
  }
}
```

Notes:
- `createPlaceholderDataUrl` lives on the service today; the spec's `RenderContext` does not include it. For Phase 1 we fall back to an inline SVG. In Task 9 we add `createPlaceholderDataUrl` to `RenderContext` if needed.

- [ ] **Step 2: Write `BarcodeElement`**

```ts
// src/app/editor/models/barcode-element.ts
import { FabricImage, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';

export interface BarcodeElementData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  format: BarcodeFormat | string;
  value?: string;
  binding?: string;
  showText?: boolean;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class BarcodeElement extends BaseElement {
  declare type: 'barcode';
  format!: BarcodeFormat | string;
  value?: string;
  binding?: string;
  showText?: boolean;

  constructor(data: BarcodeElementData) {
    super();
    Object.assign(this, data);
    this.type = 'barcode';
  }

  async render(ctx: RenderContext): Promise<FabricObject> {
    const dataUrl = (ctx as any).createPlaceholderDataUrl?.('BC', this.width, this.height)
      ?? `data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='${this.width}' height='${this.height}'><rect width='100%' height='100%' fill='#fff'/><text x='50%' y='50%' text-anchor='middle' dy='.3em' font-size='12' fill='#999'>BC</text></svg>`
        )}`;
    const img = await FabricImage.fromURL(dataUrl);
    img.set({
      left: this.x, top: this.y,
      width: this.width, height: this.height,
      scaleX: 1, scaleY: 1,
      originX: 'left', originY: 'top',
      hasRotatingPoint: true
    });
    (img as any).elementType = 'barcode';
    (img as any).bindingValue = this.binding ?? this.value ?? '';
    (img as any).barcodeFormat = this.format;
    (img as any).showText = this.showText ?? true;
    ctx.extendWithBarcodeProperties(img, {
      elementType: 'barcode',
      bindingValue: (img as any).bindingValue,
      barcodeFormat: (img as any).barcodeFormat,
      showText: (img as any).showText
    });
    ctx.extend(img, this.id);
    return img;
  }

  toJSON(): BarcodeElementData {
    return {
      id: this.id, type: 'barcode' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      format: this.format, value: this.value, binding: this.binding, showText: this.showText
    };
  }

  static fromJSON(data: BarcodeElementData): BarcodeElement { return new BarcodeElement(data); }

  static fromFabricObject(obj: any, id: string): BarcodeElement {
    return new BarcodeElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      format: obj.barcodeFormat ?? 'CODE128',
      value: obj.bindingValue ?? '',
      binding: obj.bindingValue ?? '',
      showText: obj.showText ?? true
    });
  }
}
```

- [ ] **Step 3: Write `ImageElement`**

```ts
// src/app/editor/models/image-element.ts
import { FabricImage, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';

export interface ImageElementData {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  src?: string;
  binding?: string;
  rotation?: number;
  visible?: boolean;
  opacity?: number;
}

export class ImageElement extends BaseElement {
  declare type: 'image';
  src?: string;
  binding?: string;

  constructor(data: ImageElementData) {
    super();
    Object.assign(this, data);
    this.type = 'image';
    this.width ??= 220;
    this.height ??= 220;
  }

  async render(ctx: RenderContext): Promise<FabricObject> {
    const src = this.src ?? '';
    const img = await FabricImage.fromURL(src);
    img.set({
      left: this.x, top: this.y,
      originX: 'left', originY: 'top',
      padding: 10, cornerSize: 10,
      hasRotatingPoint: true, angle: this.rotation ?? 0
    });
    if (this.width) img.scaleToWidth(this.width);
    if (this.height) img.scaleToHeight(this.height);
    ctx.extend(img, this.id);
    return img;
  }

  toJSON(): ImageElementData {
    return {
      id: this.id, type: 'image' as const,
      x: this.x, y: this.y, width: this.width, height: this.height,
      rotation: this.rotation, visible: this.visible, opacity: this.opacity, lock: this.lock,
      src: this.src, binding: this.binding
    };
  }

  static fromJSON(data: ImageElementData): ImageElement { return new ImageElement(data); }

  static fromFabricObject(obj: any, id: string): ImageElement {
    return new ImageElement({
      id,
      x: obj.left ?? 0, y: obj.top ?? 0,
      width: (obj.width ?? 100) * (obj.scaleX ?? 1),
      height: (obj.height ?? 100) * (obj.scaleY ?? 1),
      rotation: obj.angle ?? 0, opacity: obj.opacity ?? 1, visible: obj.visible ?? true,
      lock: !obj.selectable,
      src: obj.getSrc?.() ?? obj._element?.src ?? ''
    });
  }
}
```

- [ ] **Step 4: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/editor/models/qrcode-element.ts \
        src/app/editor/models/barcode-element.ts \
        src/app/editor/models/image-element.ts
git commit -m "feat(editor): add QRCode/Barcode/Image element classes (async render)"
```

---

## Task 5: Add `ElementFactory` dispatcher

**Files:**
- Create: `src/app/editor/models/element-factory.ts`
- Create: `src/app/editor/models/index.ts`

**Interfaces:**
- Produces: `ElementFactory.fromJSON(data)` and `ElementFactory.fromFabricObject(obj, id)`. Both are sync; for image-bearing types the element is hydrated immediately and its async render runs later.
- Consumes: every concrete element class.

- [ ] **Step 1: Write `element-factory.ts`**

```ts
// src/app/editor/models/element-factory.ts
import { BaseElement } from './element-base';
import { TextElement, type TextElementData } from './text-element';
import { RectElement, type RectElementData } from './rect-element';
import { CircleElement, type CircleElementData } from './circle-element';
import { TriangleElement, type TriangleElementData } from './triangle-element';
import { LineElement, type LineElementData } from './line-element';
import { QRCodeElement, type QRCodeElementData } from './qrcode-element';
import { BarcodeElement, type BarcodeElementData } from './barcode-element';
import { ImageElement, type ImageElementData } from './image-element';

export const ElementFactory = {
  fromJSON(data: Record<string, unknown>): BaseElement {
    switch (data.type) {
      case 'text':    return TextElement.fromJSON(data as TextElementData);
      case 'rect':    return RectElement.fromJSON(data as RectElementData);
      case 'circle':  return CircleElement.fromJSON(data as CircleElementData);
      case 'triangle':return TriangleElement.fromJSON(data as TriangleElementData);
      case 'line':    return LineElement.fromJSON(data as LineElementData);
      case 'qrcode':  return QRCodeElement.fromJSON(data as QRCodeElementData);
      case 'barcode': return BarcodeElement.fromJSON(data as BarcodeElementData);
      case 'image':   return ImageElement.fromJSON(data as ImageElementData);
      default: throw new Error(`Unknown element type: ${(data as any).type}`);
    }
  },
  fromFabricObject(obj: any, id: string): BaseElement {
    const t = obj.elementType as string;
    switch (t) {
      case 'text':    return TextElement.fromFabricObject(obj, id);
      case 'shape':
      case 'rect':    return RectElement.fromFabricObject(obj, id);
      case 'circle':  return CircleElement.fromFabricObject(obj, id);
      case 'triangle':return TriangleElement.fromFabricObject(obj, id);
      case 'line':    return LineElement.fromFabricObject(obj, id);
      case 'qrcode':  return QRCodeElement.fromFabricObject(obj, id);
      case 'barcode': return BarcodeElement.fromFabricObject(obj, id);
      case 'image':   return ImageElement.fromFabricObject(obj, id);
      default: throw new Error(`Unknown element type on Fabric object: ${t}`);
    }
  }
};
```

Note: `'shape'` is the existing `EditorSelectionState['type']` value that maps to Fabric rectangles. We handle both for compatibility.

- [ ] **Step 2: Write `index.ts` barrel**

```ts
// src/app/editor/models/index.ts
export * from './editor.models';
export * from './element-base';
export * from './element-factory';
export * from './text-element';
export * from './rect-element';
export * from './circle-element';
export * from './triangle-element';
export * from './line-element';
export * from './qrcode-element';
export * from './barcode-element';
export * from './image-element';
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no new errors. (Existing `editor.models.ts` still defines `TextElement`/etc. as interfaces — this collision is expected and addressed in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/models/element-factory.ts src/app/editor/models/index.ts
git commit -m "feat(editor): add ElementFactory dispatcher and barrel re-exports"
```

---

## Task 6: Add `EditorCommand` interface and the first command

**Files:**
- Create: `src/app/editor/commands/editor-command.ts`
- Create: `src/app/editor/commands/add-text.command.ts`

**Interfaces:**
- Produces: `EditorCommand` interface; `AddTextCommand` class.
- Consumes: `EditorCanvasService` for typing (referenced, not imported, to avoid cyclic dep — see Step 1).

- [ ] **Step 1: Write `editor-command.ts` using a type-only import**

```ts
// src/app/editor/commands/editor-command.ts
// Type-only import to avoid a runtime cycle between the service and commands.
import type { EditorCanvasService } from '../editor-canvas.service';

export interface EditorCommand {
  readonly name: string;
  execute(ctx: EditorCanvasService): void | Promise<void>;
  undo(ctx: EditorCanvasService): void;
}
```

- [ ] **Step 2: Write `add-text.command.ts`**

```ts
// src/app/editor/commands/add-text.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';
import { TextElement } from '../models/text-element';
import { DEFAULT_SELECTION_STATE } from '../models/editor.models';

export class AddTextCommand implements EditorCommand {
  readonly name = 'add-text';
  element: TextElement | null = null;

  constructor(private readonly content: string) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    if (!ctx.canvas) throw new Error('Canvas not initialized');

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

Notes:
- `ctx.elementRegistry` is currently `private`; in Task 8 we change its visibility so commands can mutate it.

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: error referencing `ctx.elementRegistry` and `ctx.canvas` access — those will resolve in Task 8. **That's expected; commit anyway? No — fix in Task 8 first.** Hold this commit until Task 8.

---

## Task 7: Switch `editor.models.ts` from interfaces to type aliases for the label elements

**Files:**
- Modify: `src/app/editor/models/editor.models.ts`

The current `editor.models.ts` declares interfaces (`TextElement`, etc.). Our new classes collide on those names. Resolution: remove the interfaces from `editor.models.ts` and re-export the classes from the barrel instead, keeping `LabelElement` and the rest of the file unchanged.

- [ ] **Step 1: Edit `editor.models.ts`**

Open `src/app/editor/models/editor.models.ts`.

Delete the interface declarations at lines 77–142 (`RectElement` through `ImageElement`).

Replace the closing block of the file:

```ts
export type LabelElement =
  | RectElement
  | CircleElement
  | TriangleElement
  | LineElement
  | TextElement
  | BarcodeElement
  | QRCodeElement
  | ImageElement;
```

with a single import-from-barrel:

```ts
import type {
  RectElement,
  CircleElement,
  TriangleElement,
  LineElement,
  TextElement,
  BarcodeElement,
  QRCodeElement,
  ImageElement
} from './index';
// Keep the explicit union so downstream code referring to LabelElement still works.
export type LabelElement =
  | RectElement
  | CircleElement
  | TriangleElement
  | LineElement
  | TextElement
  | BarcodeElement
  | QRCodeElement
  | ImageElement;
```

This causes a small problem: `index.ts` re-exports `* from './editor.models'`, and editor.models.ts now imports from `./index`. That's a circular reference but TypeScript handles it because everything is `export type` only. If TS complains, change `index.ts` to import `editor.models` last and not re-export `*` from it; instead re-export the specific symbols (`ElementType`, `EditorTool`, `DEFAULT_SELECTION_STATE`, `EditorSelectionState`).

- [ ] **Step 2: Fix `index.ts` to avoid the circular re-export, if needed**

If `npx tsc --noEmit` reports a circular type problem:

```ts
// src/app/editor/models/index.ts
export type {
  EditorSelectionState,
  DEFAULT_SELECTION_STATE,
  EditorTool,
  ElementType
} from './editor.models';
export * from './element-base';
export * from './element-factory';
export * from './text-element';
export * from './rect-element';
export * from './circle-element';
export * from './triangle-element';
export * from './line-element';
export * from './qrcode-element';
export * from './barcode-element';
export * from './image-element';
```

And in `editor.models.ts`, replace the `./index` import with direct file paths:

```ts
import type { RectElement } from './rect-element';
import type { CircleElement } from './circle-element';
import type { TriangleElement } from './triangle-element';
import type { LineElement } from './line-element';
import type { TextElement } from './text-element';
import type { BarcodeElement } from './barcode-element';
import type { QRCodeElement } from './qrcode-element';
import type { ImageElement } from './image-element';
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no errors after either Step 1 or Step 2 fix.

- [ ] **Step 4: Run the dev server and confirm app still compiles**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx ng build --configuration development`
Expected: succeeds. (No new runtime behavior yet.)

- [ ] **Step 5: Commit**

```bash
git add src/app/editor/models/editor.models.ts src/app/editor/models/index.ts
git commit -m "refactor(editor): replace element interfaces with class re-exports"
```

---

## Task 8: Loosen service visibility and add `getRenderContext` / `getElementRegistry`

**Files:**
- Modify: `src/app/editor/editor-canvas.service.ts`

**Interfaces:**
- Produces:
  - `getRenderContext(): RenderContext` (for element `render()` calls)
  - `getElementRegistry(): Map<string, BaseElement>` (returns same map, narrowed signature)
  - All previously-private helpers become `protected` so subclasses / element classes (via `RenderContext`) can call them.

- [ ] **Step 1: Add imports**

At the top of `editor-canvas.service.ts`, add:

```ts
import { BaseElement, type RenderContext } from './models/element-base';
```

Change the existing `LabelElement` import to be a type-only import (it stays valid; we're just making sure nothing else broke).

- [ ] **Step 2: Change element registry type and helpers to protected**

Find this block (around lines 33–34):

```ts
private elementRegistry: Map<string, LabelElement> = new Map();
```

Replace with:

```ts
protected elementRegistry: Map<string, BaseElement> = new Map();
```

Find each of these private methods and change `private` → `protected`, adding a JSDoc above each:

- `private extend(obj: any, id: string | number): void` → `protected` + JSDoc `/** Called by element render() methods to attach element id to Fabric object. */`
- `private extendWithBarcodeProperties(obj: any, props: Record<string, any>): void` → `protected` + JSDoc.
- `private createPlaceholderDataUrl(text: string, w: number, h: number): string` → `protected` + JSDoc.
- `private randomId(): string` → `protected` + JSDoc.
- `private selectItemAfterAdded(item: any): void` → `protected` + JSDoc.
- `private createFabricShape(element: LabelElement): any` → `protected` + JSDoc (kept on service for now; removed in Task 10 once elements own render()).
- `private createElementModel(object: any, type: EditorSelectionState['type']): LabelElement` → `protected` + JSDoc (same).

- [ ] **Step 3: Add the new public accessors**

Add the following methods to the class (next to `getDrawingModeEnabled` works well):

```ts
getRenderContext(): RenderContext {
  if (!this.canvas) throw new Error('Canvas not initialized');
  return {
    canvas: this.canvas,
    extend: (obj, id) => this.extend(obj, id),
    extendWithBarcodeProperties: (obj, props) => this.extendWithBarcodeProperties(obj, props),
    randomId: () => this.randomId(),
    createPlaceholderDataUrl: (text, w, h) => this.createPlaceholderDataUrl(text, w, h)
  };
}

getElementRegistry(): Map<string, BaseElement> {
  return this.elementRegistry;
}
```

- [ ] **Step 4: Type-check**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit`
Expected: no new errors. (Task 6's `AddTextCommand` should now compile cleanly.)

- [ ] **Step 5: Build the project to make sure Angular is happy**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx ng build --configuration development`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/editor/editor-canvas.service.ts
git commit -m "refactor(editor): loosen service visibility and expose RenderContext"
```

---

## Task 9: Wire `AddTextCommand` into the service `execute()` pipeline

**Files:**
- Modify: `src/app/editor/editor-canvas.service.ts`

**Interfaces:**
- Produces: `execute(command: EditorCommand): Promise<void>` method that pushes an undo snapshot before running the command and pops it on failure.
- Produces: `canUndo()` / `canRedo()` methods backed by snapshot stack length.
- Produces (later tasks): `canUndoSignal` / `canRedoSignal` Angular signals.
- Consumes: `EditorCommand` interface.

- [ ] **Step 1: Add the `execute` method**

Locate the `// ============================================================ // Element Creation Methods` section header in `editor-canvas.service.ts`. Add the imports at the top of the file:

```ts
import { EditorCommand } from './commands/editor-command';
```

Then add the new methods:

```ts
execute(command: EditorCommand): Promise<void> {
  this.pushUndoSnapshot();
  this.redoStack.length = 0;
  return Promise.resolve()
    .then(() => command.execute(this))
    .then(
      () => this.touchRevision(),
      (err) => {
        this.undoStack.pop();
        throw err;
      }
    );
}

undo(): void {
  if (this.undoStack.length === 0 || !this.canvas) return;
  const current = JSON.stringify(this.canvas.toJSON());
  this.redoStack.push(current);
  const snapshot = this.undoStack.pop()!;
  this.hydrating = true;
  this.canvas.loadFromJSON(snapshot).then(() => {
    this.canvas?.discardActiveObject();
    this.applyInteractionMode();
    this.hydrating = false;
    this.touchRevision();
    this.canvas?.requestRenderAll();
  });
}

redo(): void {
  if (this.redoStack.length === 0 || !this.canvas) return;
  const current = JSON.stringify(this.canvas.toJSON());
  this.undoStack.push(current);
  const snapshot = this.redoStack.pop()!;
  this.hydrating = true;
  this.canvas.loadFromJSON(snapshot).then(() => {
    this.canvas?.discardActiveObject();
    this.applyInteractionMode();
    this.hydrating = false;
    this.touchRevision();
    this.canvas?.requestRenderAll();
  });
}

canUndo(): boolean { return this.undoStack.length > 0; }
canRedo(): boolean { return this.redoStack.length > 0; }
```

The `pushUndoSnapshot()` private helper:

```ts
private pushUndoSnapshot(): void {
  if (!this.canvas) return;
  const snapshot = JSON.stringify(this.canvas.toJSON());
  this.undoStack.push(snapshot);
  if (this.undoStack.length > this.maxUndoLevels) this.undoStack.shift();
}
```

Place these methods in the same section as `destroy()` / `setDrawingMode()`.

- [ ] **Step 2: Replace the body of `addText(content)` so it goes through `execute`**

Find the existing `addText(content: string): LabelElement { ... }` method. Replace it entirely with:

```ts
async addText(content: string): Promise<TextElement> {
  const cmd = new AddTextCommand(content);
  await this.execute(cmd);
  return cmd.element!;
}
```

At the top of the file add: `import { AddTextCommand } from './commands/add-text.command';`

`addText` now returns `Promise<TextElement>`. This is a soft break: callers that didn't await still get a fired-off command, but the return type changes.

- [ ] **Step 3: Update `editor.ts` `activateTool('text')` to await**

Open `src/app/editor/editor.ts`. Find:

```ts
case 'text':
  this.canvasService.addText(this.textString);
  this.textString = 'Text';
  return;
```

Replace with:

```ts
case 'text':
  void this.canvasService.addText(this.textString);
  this.textString = 'Text';
  return;
```

- [ ] **Step 4: Type-check and build**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit && npx ng build --configuration development`
Expected: succeeds.

- [ ] **Step 5: Manual verification — text add works**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npm start` (in background).

In the running app:
- Click the **T** tool. A text box should appear at top-left of the canvas, identical to before.
- Drag the text, type into it, save the template, reload the template — the text reappears identical.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/app/editor/editor-canvas.service.ts src/app/editor/editor.ts
git commit -m "feat(editor): route addText through command pipeline + add execute/undo/redo"
```

---

## Task 10: Promote `addShape` to use `RectElement`/`CircleElement`/`TriangleElement`/`LineElement`

**Files:**
- Create: `src/app/editor/commands/add-shape.command.ts`
- Modify: `src/app/editor/editor-canvas.service.ts`
- Modify: `src/app/editor/editor.ts`

- [ ] **Step 1: Write `add-shape.command.ts`**

```ts
// src/app/editor/commands/add-shape.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';
import { RectElement } from '../models/rect-element';
import { CircleElement } from '../models/circle-element';
import { TriangleElement } from '../models/triangle-element';
import { LineElement } from '../models/line-element';
import type { BaseElement } from '../models/element-base';

type ShapeType = 'square' | 'triangle' | 'circle' | 'line';

export class AddShapeCommand implements EditorCommand {
  readonly name = 'add-shape';
  element: BaseElement | null = null;

  constructor(private readonly shapeType: ShapeType) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    if (!ctx.canvas) throw new Error('Canvas not initialized');
    const id = ctx.randomId();

    switch (this.shapeType) {
      case 'square':
        this.element = new RectElement({
          id, x: 24, y: 24, width: 100, height: 100,
          fill: '#059669', stroke: '#374151', strokeWidth: 2
        });
        break;
      case 'triangle':
        this.element = new TriangleElement({
          id, x: 24, y: 24, width: 100, height: 100,
          fill: '#0ea5e9', stroke: '#374151', strokeWidth: 2
        });
        break;
      case 'circle':
        this.element = new CircleElement({
          id, x: 24, y: 24, width: 100, height: 100,
          fill: '#f97316', stroke: '#374151', strokeWidth: 2
        });
        break;
      case 'line':
        this.element = new LineElement({
          id, x: 24, y: 24, width: 100, height: 2,
          stroke: '#000000', strokeWidth: 2
        });
        break;
    }

    if (!this.element) throw new Error(`Unknown shape type: ${this.shapeType}`);

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.elementRegistry.set(this.element.id, this.element);
    ctx.canvas.add(obj);
    ctx.selectItemAfterAdded(obj);
  }

  undo(_ctx: EditorCanvasService): void { this.element = null; }
}
```

- [ ] **Step 2: Replace `addShape` body in the service**

Find `addShape(shapeType: 'square' | 'triangle' | 'circle' | 'line'): LabelElement { ... }`. Replace the entire method (keep the signature, change the body) with:

```ts
async addShape(shapeType: 'square' | 'triangle' | 'circle' | 'line'): Promise<BaseElement> {
  const cmd = new AddShapeCommand(shapeType);
  await this.execute(cmd);
  return cmd.element!;
}
```

Add the import at the top of the file:

```ts
import { AddShapeCommand } from './commands/add-shape.command';
```

- [ ] **Step 3: Update `editor.ts activateTool` for shapes**

Find:

```ts
case 'square':
case 'circle':
case 'triangle':
case 'line':
  this.canvasService.addShape(tool);
  return;
```

Replace with:

```ts
case 'square':
case 'circle':
case 'triangle':
case 'line':
  void this.canvasService.addShape(tool);
  return;
```

- [ ] **Step 4: Verify in the running app**

`npm start`. Click each shape tool — square/circle/triangle/line should appear with their original colors and stroke widths. Save the template, reload — shapes preserve colors and sizes.

- [ ] **Step 5: Commit**

```bash
git add src/app/editor/commands/add-shape.command.ts \
        src/app/editor/editor-canvas.service.ts \
        src/app/editor/editor.ts
git commit -m "feat(editor): route addShape through AddShapeCommand"
```

---

## Task 11: Promote `addQRCode`, `addBarcode`, `addImage` to commands

**Files:**
- Create: `src/app/editor/commands/add-qrcode.command.ts`
- Create: `src/app/editor/commands/add-barcode.command.ts`
- Create: `src/app/editor/commands/add-image.command.ts`
- Modify: `src/app/editor/editor-canvas.service.ts`
- Modify: `src/app/editor/editor.ts`

- [ ] **Step 1: Write `add-qrcode.command.ts`**

```ts
// src/app/editor/commands/add-qrcode.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';
import { QRCodeElement } from '../models/qrcode-element';

export class AddQRCodeCommand implements EditorCommand {
  readonly name = 'add-qrcode';
  element: QRCodeElement | null = null;

  constructor(private readonly bindingValue?: string) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    if (!ctx.canvas) throw new Error('Canvas not initialized');

    this.element = new QRCodeElement({
      id: ctx.randomId(),
      x: 24, y: 24, width: 100, height: 100,
      value: this.bindingValue ?? '',
      binding: this.bindingValue,
      errorCorrectionLevel: 'M',
      foregroundColor: '#000000',
      backgroundColor: '#ffffff'
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.elementRegistry.set(this.element.id, this.element);
    ctx.canvas.add(obj);
    ctx.selectItemAfterAdded(obj);
  }

  undo(_ctx: EditorCanvasService): void { this.element = null; }
}
```

- [ ] **Step 2: Write `add-barcode.command.ts`**

```ts
// src/app/editor/commands/add-barcode.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';
import { BarcodeElement, type BarcodeFormat } from '../models/barcode-element';

export class AddBarcodeCommand implements EditorCommand {
  readonly name = 'add-barcode';
  element: BarcodeElement | null = null;

  constructor(
    private readonly format: BarcodeFormat | string,
    private readonly bindingValue?: string
  ) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    if (!ctx.canvas) throw new Error('Canvas not initialized');

    this.element = new BarcodeElement({
      id: ctx.randomId(),
      x: 24, y: 24, width: 200, height: 80,
      format: this.format,
      value: this.bindingValue ?? '',
      binding: this.bindingValue,
      showText: true
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.elementRegistry.set(this.element.id, this.element);
    ctx.canvas.add(obj);
    ctx.selectItemAfterAdded(obj);
  }

  undo(_ctx: EditorCanvasService): void { this.element = null; }
}
```

- [ ] **Step 3: Write `add-image.command.ts`**

```ts
// src/app/editor/commands/add-image.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';
import { ImageElement } from '../models/image-element';

export class AddImageCommand implements EditorCommand {
  readonly name = 'add-image';
  element: ImageElement | null = null;

  constructor(private readonly url: string) {}

  async execute(ctx: EditorCanvasService): Promise<void> {
    if (!ctx.canvas || !this.url) throw new Error('Canvas not initialized or URL missing');

    this.element = new ImageElement({
      id: ctx.randomId(),
      x: 24, y: 24, width: 220, height: 220,
      src: this.url
    });

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.elementRegistry.set(this.element.id, this.element);
    ctx.canvas.add(obj);
    ctx.selectItemAfterAdded(obj);
  }

  undo(_ctx: EditorCanvasService): void { this.element = null; }
}
```

- [ ] **Step 4: Replace `addQRCode`, `addBarcode`, `addImage` in service**

In `editor-canvas.service.ts`, add imports:

```ts
import { AddQRCodeCommand } from './commands/add-qrcode.command';
import { AddBarcodeCommand } from './commands/add-barcode.command';
import { AddImageCommand } from './commands/add-image.command';
```

Replace each method body:

```ts
async addQRCode(bindingValue?: string): Promise<QRCodeElement> {
  const cmd = new AddQRCodeCommand(bindingValue);
  await this.execute(cmd);
  return cmd.element!;
}

async addBarcode(format: BarcodeElement['format'], bindingValue?: string): Promise<BarcodeElement> {
  const cmd = new AddBarcodeCommand(format, bindingValue);
  await this.execute(cmd);
  return cmd.element!;
}

async addImage(url: string): Promise<ImageElement | null> {
  if (!url) return null;
  const cmd = new AddImageCommand(url);
  await this.execute(cmd);
  return cmd.element!;
}
```

(Original `addImage` was `void` and ignored null URLs by returning early. We preserve that behavior by guarding before constructing the command.)

- [ ] **Step 5: Update `editor.ts activateTool` for QR/barcode**

Find:

```ts
case 'qrcode':
  this.canvasService.addQRCode();
  return;
case 'barcode':
  this.canvasService.addBarcode('CODE128');
  return;
```

Replace with:

```ts
case 'qrcode':
  void this.canvasService.addQRCode();
  return;
case 'barcode':
  void this.canvasService.addBarcode('CODE128');
  return;
```

- [ ] **Step 6: Verify in the running app**

`npm start`. Click QR code and barcode tools — placeholders render. Insert image via the image dialog — image loads.

- [ ] **Step 7: Commit**

```bash
git add src/app/editor/commands/add-qrcode.command.ts \
        src/app/editor/commands/add-barcode.command.ts \
        src/app/editor/commands/add-image.command.ts \
        src/app/editor/editor-canvas.service.ts \
        src/app/editor/editor.ts
git commit -m "feat(editor): route addQRCode/addBarcode/addImage through commands"
```

---

## Task 12: Add `DeleteSelectedCommand` and `ClearCanvasCommand`

**Files:**
- Create: `src/app/editor/commands/delete-selected.command.ts`
- Create: `src/app/editor/commands/clear-canvas.command.ts`
- Modify: `src/app/editor/editor-canvas.service.ts`
- Modify: `src/app/editor/editor.ts`

- [ ] **Step 1: Identify and rename the existing internal handlers**

In `editor-canvas.service.ts`, find the existing `removeSelected()` and any `clearCanvas()` method. These currently:

- Remove selected objects from the canvas (`canvas.remove(...)`).
- Delete entries from `elementRegistry`.
- Refresh selection state.

Add two thin `protected` wrappers below them:

```ts
protected deleteSelectedInternal(): void {
  this.removeSelected();    // existing implementation
}

protected clearCanvasInternal(): void {
  // Use the existing clear path; if there's no dedicated method, iterate canvas.remove on each object.
  if (!this.canvas) return;
  const objects = this.canvas.getObjects().slice();
  for (const obj of objects) this.canvas.remove(obj);
  this.elementRegistry.clear();
  this.handleSelection(null);
  this.touchRevision();
}
```

If `removeSelected` already does both the canvas removal and registry cleanup, `clearCanvasInternal` still needs its own iteration since clearing affects everything, not just selection.

- [ ] **Step 2: Write `delete-selected.command.ts`**

```ts
// src/app/editor/commands/delete-selected.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';

export class DeleteSelectedCommand implements EditorCommand {
  readonly name = 'delete-selected';

  execute(ctx: EditorCanvasService): void {
    ctx.deleteSelectedInternal();
  }

  undo(_ctx: EditorCanvasService): void { /* snapshot restores canvas state */ }
}
```

- [ ] **Step 3: Write `clear-canvas.command.ts`**

```ts
// src/app/editor/commands/clear-canvas.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCanvasService } from '../editor-canvas.service';

export class ClearCanvasCommand implements EditorCommand {
  readonly name = 'clear-canvas';

  execute(ctx: EditorCanvasService): void {
    ctx.clearCanvasInternal();
  }

  undo(_ctx: EditorCanvasService): void { /* snapshot restores canvas state */ }
}
```

- [ ] **Step 4: Add public `deleteSelected()` and `clearCanvas()` wrappers on the service**

```ts
async deleteSelected(): Promise<void> {
  await this.execute(new DeleteSelectedCommand());
}

async clearCanvas(): Promise<void> {
  await this.execute(new ClearCanvasCommand());
}
```

Add imports:

```ts
import { DeleteSelectedCommand } from './commands/delete-selected.command';
import { ClearCanvasCommand } from './commands/clear-canvas.command';
```

- [ ] **Step 5: Update `editor.ts` delete key handler**

Find the keyboard handler that calls `this.removeSelected()`:

```ts
this.removeSelected();
return;
```

Replace with:

```ts
void this.canvasService.deleteSelected();
return;
```

Also update the selection of these commands in the topbar / properties panel if any direct calls to `removeSelected` exist; route them through `void this.canvasService.deleteSelected()` instead.

- [ ] **Step 6: Verify in the running app**

`npm start`. Add several elements. Press Delete — selected one is removed and the snapshot is on the undo stack (still empty at this stage). Verify delete/clear don't crash; the visual UI is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/app/editor/commands/delete-selected.command.ts \
        src/app/editor/commands/clear-canvas.command.ts \
        src/app/editor/editor-canvas.service.ts \
        src/app/editor/editor.ts
git commit -m "feat(editor): wrap delete/clear as commands"
```

---

## Task 13: Replace `createElementModel` and `createFabricShape` with `ElementFactory`

**Files:**
- Modify: `src/app/editor/editor-canvas.service.ts` (specifically the canvas hydration block at lines ~694–729)

- [ ] **Step 1: Replace the hydration loop body**

Find:

```ts
const objType = this.getElementType(object);
const element = this.createElementModel(object, objType);
this.elementRegistry.set(id, element);
```

Replace with:

```ts
const element = ElementFactory.fromFabricObject(object, id);
this.elementRegistry.set(id, element);
```

Add the import near the top of the file:

```ts
import { ElementFactory } from './models/element-factory';
```

- [ ] **Step 2: Remove now-unused `createElementModel` and `createFabricShape`**

After hydration is verified, delete the bodies of `createElementModel` and `createFabricShape`. First verify nothing else calls them:

Run: `grep -n "createElementModel\|createFabricShape" src/app/editor/editor-canvas.service.ts src/app/editor/*.ts`
Expected: only the definitions themselves.

If only definitions remain, delete them entirely.

- [ ] **Step 3: Verify in the running app**

`npm start`. Open an existing template with elements. Each element type should reappear identical to before. Save and reload — round-trip works.

- [ ] **Step 4: Run typecheck & build**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx tsc --noEmit && npx ng build --configuration development`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/editor/editor-canvas.service.ts
git commit -m "refactor(editor): route canvas hydration through ElementFactory"
```

---

## Task 14: Wire `canUndoSignal`/`canRedoSignal` and Ctrl+Z / Ctrl+Shift+Z

**Files:**
- Modify: `src/app/editor/editor-canvas.service.ts`
- Modify: `src/app/editor/editor.ts`

**Interfaces:**
- Produces: `canUndoSignal = computed(() => ...)`, `canRedoSignal = computed(() => ...)` on the service.

- [ ] **Step 1: Add signals to the service**

Place them next to existing `signal` declarations:

```ts
readonly canUndoSignal = signal(false);
readonly canRedoSignal = signal(false);
```

After every push/pop on `undoStack` and `redoStack` (in `execute`, `pushUndoSnapshot`, `undo`, `redo`), add:

```ts
this.canUndoSignal.set(this.undoStack.length > 0);
this.canRedoSignal.set(this.redoStack.length > 0);
```

Wrap this in a private helper:

```ts
private syncUndoSignals(): void {
  this.canUndoSignal.set(this.undoStack.length > 0);
  this.canRedoSignal.set(this.redoStack.length > 0);
}
```

Call `syncUndoSignals()` at the end of `execute()`, `undo()`, `redo()`, and `pushUndoSnapshot()`.

- [ ] **Step 2: Bind keyboard shortcuts in `editor.ts`**

Inspect `src/app/editor/editor.ts` for any existing `keydown` handler (search for `'keydown'`, `metaKey`, or `HostListener`). Match the existing style:

- **If existing handler uses `@HostListener('document:keydown', ['$event'])`:**
  Add the undo/redo branch at the top of the method body, before any other key branches:

  ```ts
  const meta = event.metaKey || event.ctrlKey;
  if (meta && (event.key === 'z' || event.key === 'Z')) {
    event.preventDefault();
    if (event.shiftKey) void this.canvasService.redo();
    else void this.canvasService.undo();
    return;
  }
  ```

- **If existing handler uses the `host` field on `@Component`:** add the same branch inside the existing handler method that matches `(document:keydown)`.

- **If no keydown handler exists:** add `host: { '(document:keydown)': 'handleKeydown($event)' }` to the `@Component` decorator and a method:

  ```ts
  handleKeydown(event: KeyboardEvent): void {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) void this.canvasService.redo();
      else void this.canvasService.undo();
    }
  }
  ```

  Place this method on the `Editor` component class.

- [ ] **Step 3: Verify in the running app**

`npm start`.
- Add text. Ctrl+Z — text disappears. Ctrl+Shift+Z — text reappears.
- Add shape. Delete it via menu. Ctrl+Z — shape returns.
- Add three elements. Ctrl+Z repeatedly — last-added is removed each time. Ctrl+Shift+Z repeatedly — last-removed returns.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/editor-canvas.service.ts src/app/editor/editor.ts
git commit -m "feat(editor): wire undo/redo signals and Ctrl+Z / Ctrl+Shift+Z"
```

---

## Task 15: Wire reactive Undo/Redo button state in the topbar

**Files:**
- Modify: `src/app/editor/editor-topbar.ts`
- Modify: `src/app/editor/editor-topbar.html`

- [ ] **Step 1: Inject the service and read signals**

In `editor-topbar.ts`, inject `EditorCanvasService` (likely already injected). Add to the component:

```ts
protected readonly canUndo = this.canvasService.canUndoSignal;
protected readonly canRedo = this.canvasService.canRedoSignal;
```

- [ ] **Step 2: Add undo/redo buttons to the template**

In `editor-topbar.html`, add two buttons next to the existing tool actions:

```html
<button type="button" (click)="canvasService.undo()" [disabled]="!canUndo()">
  Undo
</button>
<button type="button" (click)="canvasService.redo()" [disabled]="!canRedo()">
  Redo
</button>
```

If the topbar is `OnPush`, set `signal`-based inputs are already reactive — no change detection tweaks needed.

- [ ] **Step 3: Verify in the running app**

`npm start`. Buttons enable/disable correctly across actions.

- [ ] **Step 4: Commit**

```bash
git add src/app/editor/editor-topbar.ts src/app/editor/editor-topbar.html
git commit -m "feat(editor): add Undo/Redo buttons to topbar"
```

---

## Task 16: Verify wire format is byte-identical to before

This is the safety net for the "wire-format unchanged" global constraint.

- [ ] **Step 1: Save a complex template, capture its JSON**

`npm start`. Build a label containing one of each element type. Save the template to its storage backend (HTTP template service or local). Capture the JSON shape — note the `elements` array.

- [ ] **Step 2: Refresh the page; load the template; compare**

Hard refresh. Reload the same template. Compare:
- Element count and types match.
- Field names match (`id`, `type`, `x`, `y`, `width`, `height`, plus element-specific fields).
- `barcodeFormat` / `bindingValue` / `errorCorrectionLevel` etc. round-trip unchanged.

- [ ] **Step 3: Open the print preview**

Generate the PDF. Compare against pre-refactor behavior — visual output identical.

- [ ] **Step 4: Commit any captured test data**

If you wrote a fixture JSON for regression, save it under a `tests/` folder. Otherwise, document the manual verification result in the commit message:

```bash
git commit --allow-empty -m "verify: wire format identical to pre-refactor (text/shape/qr/barcode/image)"
```

---

## Task 17: Final cleanup and code review pass

- [ ] **Step 1: Remove dead code**

Look for any remaining unused imports in `editor-canvas.service.ts` (especially around `createElementModel`, `createFabricShape`, the original Textbox/Triangle/etc. inline code) and remove them.

- [ ] **Step 2: Run linter / formatter**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx ng lint` (or whichever lint script exists).
Fix any newly-flagged issues.

- [ ] **Step 3: Run the full test suite**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npm test -- --watch=false --browsers=ChromeHeadless` (or your project's command).
Expected: passes.

- [ ] **Step 4: Run the production build**

Run: `cd /Users/rococo/Documents/02Project/hidan/src/label-creator && npx ng build`
Expected: succeeds.

- [ ] **Step 5: Final manual verification**

Use the app end-to-end:
- Create / delete / undo / redo each element type.
- Move and resize each element (these still use snapshot, but should be untouched).
- Save template, refresh, load template.
- Print preview matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(editor): cleanup imports and confirm wire-format preservation"
```

---

## Self-Review Notes (post-draft)

- **Type/name drift:** every reference to `addText` etc. in this plan matches the migration order — `addText` becomes `Promise<TextElement>` in Task 9. Downstream callers (`editor.ts`, topbar) get fire-and-forget `void` calls rather than awaiting, which preserves current behavior.
- **`ElementFactory.fromFabricObject` signature:** takes `(obj, id)` rather than reading the id off the object. The plan has the service call site pass `id` explicitly. This avoids a hidden mutation in the factory. ✅
- **`pushUndoSnapshot` returning the snapshot:** snapshots are pushed before command execution; on failure they're popped. The plan keeps this symmetric. ✅
- **`createFabricShape`/`createElementModel` deletion timing:** they're only deleted in Task 13, after `ElementFactory` is verified to handle all eight element types. Until then, the old paths remain in the file as fallback. ✅
- **Recursive `host` listener for Ctrl+Z:** the plan calls out how to find or add it ("look at how existing keydown handlers are wired"), acknowledging some exploring may be needed. ✅
