// src/app/editor/commands/add-shape.command.ts
import type { EditorCommand } from './editor-command';
import type { EditorCommandContext } from '../editor/editor-command-context';
import { RectElement } from '../models/rect-element';
import { CircleElement } from '../models/circle-element';
import { TriangleElement } from '../models/triangle-element';
import { LineElement } from '../models/line-element';
import type { BaseElement } from '../models/element-base';
import type { LabelElement } from '../models/editor.models';

type ShapeType = 'square' | 'triangle' | 'circle' | 'line';

export class AddShapeCommand implements EditorCommand {
  readonly name = 'add-shape';
  element: BaseElement | null = null;

  constructor(private readonly shapeType: ShapeType) {}

  async execute(ctx: EditorCommandContext): Promise<void> {
    if (!ctx.canvas) throw new Error('Canvas not initialized');
    const id = ctx.randomId();

    switch (this.shapeType) {
      case 'square':
        this.element = new RectElement({
          type: 'rect', id, x: 24, y: 24, width: 100, height: 100,
          fill: '#059669', stroke: '#374151', strokeWidth: 2
        });
        break;
      case 'triangle':
        this.element = new TriangleElement({
          type: 'triangle', id, x: 24, y: 24, width: 100, height: 100,
          fill: '#0ea5e9', stroke: '#374151', strokeWidth: 2
        });
        break;
      case 'circle':
        this.element = new CircleElement({
          type: 'circle', id, x: 24, y: 24, width: 100, height: 100,
          fill: '#f97316', stroke: '#374151', strokeWidth: 2
        });
        break;
      case 'line':
        this.element = new LineElement({
          type: 'line', id, x: 24, y: 24, width: 100, height: 2,
          stroke: '#000000', strokeWidth: 2
        });
        break;
    }

    if (!this.element) throw new Error(`Unknown shape type: ${this.shapeType}`);

    const obj = await this.element.render(ctx.getRenderContext());
    ctx.addElement(this.element as LabelElement);
    ctx.canvasAdd(obj);
    ctx.selectItemAfterAdded(obj);
    ctx.touchRevision();
  }

  undo(_ctx: EditorCommandContext): void { this.element = null; }
}
