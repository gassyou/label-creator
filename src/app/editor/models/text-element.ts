// src/app/editor/models/text-element.ts
import { Textbox, type FabricObject } from 'fabric';
import { BaseElement, type RenderContext } from './element-base';
import { DEFAULT_SELECTION_STATE } from './editor.models';

export interface TextElementData {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height?: number;
  lock?: boolean;
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
  [key: string]: unknown;
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
      type: 'text',
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