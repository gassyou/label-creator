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
  abstract toJSON(): SerializableElement;
}

/**
 * Wire-format shape for any element's serialized form. Concrete *Data
 * interfaces satisfy this structurally as long as they include at least
 * { id, type, x, y, width, height } and may carry any extra element-specific
 * fields.
 */
export interface SerializableElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height?: number;
  rotation?: number;
  visible?: boolean;
  lock?: boolean;
  zIndex?: number;
  opacity?: number;
  [key: string]: unknown;
}
