import { Injectable, signal } from '@angular/core';
import {
  Canvas,
  Circle,
  FabricImage,
  IText,
  Pattern,
  Rect,
  Triangle
} from 'fabric';
import {
  CanvasEntity,
  DEFAULT_CANVAS_STATE,
  DEFAULT_SELECTION_STATE,
  EditorCanvasState,
  EditorPage,
  EditorSelectionState
} from './editor.models';

@Injectable()
export class EditorCanvasService {
  readonly selected = signal<CanvasEntity | null>(null);
  readonly textEditorVisible = signal(false);
  readonly figureEditorVisible = signal(false);
  readonly jsonPreview = signal('');
  readonly revision = signal(0);
  readonly zoom = signal(1);

  private canvas: Canvas | null = null;
  private drawingModeEnabled = false;
  private hydrating = false;
  private canvasElement: HTMLCanvasElement | null = null;

  initialize(element: HTMLCanvasElement, canvasState: EditorCanvasState): void {
    this.canvas?.dispose();
    this.canvasElement = element;
    this.canvas = new Canvas(element, {
      hoverCursor: 'pointer',
      selection: true,
      selectionBorderColor: '#2563eb',
      isDrawingMode: false
    });

    this.canvas.setDimensions({
      width: canvasState.width,
      height: canvasState.height
    });
    this.canvas.backgroundColor = canvasState.backgroundColor;

    this.canvas.on('selection:created', (event) => this.handleSelection(event.selected?.[0] ?? null));
    this.canvas.on('selection:updated', (event) => this.handleSelection(event.selected?.[0] ?? null));
    this.canvas.on('selection:cleared', () => this.handleSelection(null));
    this.canvas.on('object:added', () => this.touchRevision());
    this.canvas.on('object:modified', () => this.touchRevision());
    this.canvas.on('object:removed', () => this.touchRevision());
    this.canvas.on('text:changed', () => this.touchRevision());
    this.applyInteractionMode();
    this.canvas.requestRenderAll();
  }

  destroy(): void {
    this.canvas?.dispose();
    this.canvas = null;
    this.handleSelection(null);
  }

  setDrawingMode(enabled: boolean): void {
    this.drawingModeEnabled = enabled;
    this.applyInteractionMode();
  }

  getDrawingModeEnabled(): boolean {
    return this.drawingModeEnabled;
  }

  resizeCanvas(canvasState: EditorCanvasState): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.setDimensions({
      width: Number(canvasState.width) || DEFAULT_CANVAS_STATE.width,
      height: Number(canvasState.height) || DEFAULT_CANVAS_STATE.height
    });
    this.touchRevision();
    this.canvas.requestRenderAll();
  }

  addText(content: string): void {
    if (!this.canvas) {
      return;
    }

    const text = new IText(content.trim() || 'Text', {
      left: 24,
      top: 24,
      fontFamily: DEFAULT_SELECTION_STATE.fontFamily,
      fill: '#111827',
      fontSize: DEFAULT_SELECTION_STATE.fontSize,
      scaleX: 0.5,
      scaleY: 0.5,
      hasRotatingPoint: true
    });

    this.extend(text, this.randomId());
    this.canvas.add(text);
    this.selectItemAfterAdded(text);
  }

  addShape(shapeType: 'square' | 'triangle' | 'circle'): void {
    if (!this.canvas) {
      return;
    }

    let shape: CanvasEntity;
    switch (shapeType) {
      case 'square':
        shape = new Rect({ width: 100, height: 100, left: 24, top: 24, fill: '#059669' });
        break;
      case 'triangle':
        shape = new Triangle({ width: 100, height: 100, left: 24, top: 24, fill: '#0ea5e9' });
        break;
      case 'circle':
        shape = new Circle({ radius: 50, left: 24, top: 24, fill: '#f97316' });
        break;
    }

    this.extend(shape, this.randomId());
    this.canvas.add(shape);
    this.selectItemAfterAdded(shape);
  }

  addImage(url: string): void {
    if (!this.canvas || !url) {
      return;
    }

    FabricImage.fromURL(url).then((image) => {
      image.set({
        left: 24,
        top: 24,
        angle: 0,
        padding: 10,
        cornerSize: 10,
        hasRotatingPoint: true
      });
      image.scaleToWidth(220);
      image.scaleToHeight(220);
      this.extend(image, this.randomId());
      this.canvas?.add(image);
      this.selectItemAfterAdded(image);
    });
  }

  clearSelection(): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  removeSelected(): void {
    if (!this.canvas) {
      return;
    }

    const activeObjects = this.canvas.getActiveObjects();
    if (!activeObjects.length) {
      return;
    }

    this.canvas.discardActiveObject();
    activeObjects.forEach((object) => this.canvas?.remove(object));
    this.canvas.requestRenderAll();
    this.handleSelection(null);
  }

  cloneSelected(): void {
    const activeObject = this.canvas?.getActiveObject();
    if (!this.canvas || !activeObject) {
      return;
    }

    activeObject.clone().then((clone) => {
      clone.set({
        left: (clone.left ?? 0) + 20,
        top: (clone.top ?? 0) + 20
      });
      this.extend(clone as CanvasEntity, this.randomId());
      this.canvas?.add(clone);
      this.selectItemAfterAdded(clone as CanvasEntity);
    });
  }

  bringSelectionToFront(): void {
    const activeObjects = this.canvas?.getActiveObjects() ?? [];
    if (!this.canvas || !activeObjects.length) {
      return;
    }

    activeObjects.forEach((object) => this.canvas?.bringObjectToFront(object));
    this.canvas.requestRenderAll();
  }

  sendSelectionToBack(): void {
    const activeObjects = this.canvas?.getActiveObjects() ?? [];
    if (!this.canvas || !activeObjects.length) {
      return;
    }

    activeObjects.forEach((object) => this.canvas?.sendObjectToBack(object));
    this.canvas.requestRenderAll();
  }

  clearCanvas(backgroundColor: string): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.clear();
    this.canvas.backgroundColor = backgroundColor;
    this.canvas.requestRenderAll();
    this.handleSelection(null);
  }

  applyCanvasFill(backgroundColor: string, backgroundImage: string): void {
    if (!this.canvas || backgroundImage) {
      return;
    }

    this.canvas.backgroundColor = backgroundColor;
    this.touchRevision();
    this.canvas.requestRenderAll();
  }

  applyCanvasImage(backgroundImage: string, onApplied: () => void): void {
    if (!this.canvas || !backgroundImage) {
      return;
    }

    FabricImage.fromURL(backgroundImage).then((image) => {
      const pattern = new Pattern({
        source: image.getElement(),
        repeat: 'repeat'
      });

      this.canvas!.backgroundColor = pattern;
      this.touchRevision();
      this.canvas!.requestRenderAll();
      onApplied();
    });
  }

  serializeCanvas(): string {
    if (!this.canvas) {
      return '';
    }

    return JSON.stringify(this.canvas.toJSON());
  }

  async loadPage(page: EditorPage): Promise<void> {
    if (!this.canvas) {
      return;
    }

    this.hydrating = true;
    this.canvas.clear();
    this.canvas.setDimensions({
      width: page.canvasState.width,
      height: page.canvasState.height
    });

    if (page.canvasState.backgroundImage) {
      await this.applyCanvasImageToCanvas(page.canvasState.backgroundImage);
    } else {
      this.canvas.backgroundColor = page.canvasState.backgroundColor;
    }

    if (page.canvasJson) {
      await this.canvas.loadFromJSON(page.canvasJson);
    }

    this.applyInteractionMode();
    this.canvas.discardActiveObject();
    this.handleSelection(null);
    this.hydrating = false;
    this.touchRevision();
    this.canvas.requestRenderAll();
  }

  saveToLocalStorage(): void {
    if (!this.canvas) {
      return;
    }

    localStorage.setItem('Kanvas', JSON.stringify(this.canvas.toJSON()));
  }

  loadFromLocalStorage(): void {
    const saved = localStorage.getItem('Kanvas');
    if (!this.canvas || !saved) {
      return;
    }

    this.canvas.loadFromJSON(saved).then(() => {
      this.applyInteractionMode();
      this.canvas?.requestRenderAll();
    });
  }

  previewJson(): void {
    if (!this.canvas) {
      return;
    }

    this.jsonPreview.set(JSON.stringify(this.canvas.toJSON(), null, 2));
  }

  exportPng(): void {
    if (!this.canvas) {
      return;
    }

    const image = new Image();
    image.src = this.canvas.toDataURL({ format: 'png', multiplier: 1 });
    const popup = window.open('');
    popup?.document.write(image.outerHTML);
    this.downloadPng();
  }

  downloadPng(): void {
    if (!this.canvas) {
      return;
    }

    const data = this.canvas.toDataURL({ format: 'png', multiplier: 1 });
    const link = document.createElement('a');
    link.href = data;
    link.download = `${Date.now()}.png`;
    link.click();
  }

  exportPngData(multiplier = 2): string {
    if (!this.canvas) {
      return '';
    }

    return this.canvas.toDataURL({ format: 'png', multiplier });
  }

  exportSvg(): void {
    if (!this.canvas) {
      return;
    }

    const popup = window.open('');
    const svg = this.canvas.toSVG();
    popup?.document.write(svg);
    this.downloadSvg();
  }

  downloadSvg(): void {
    if (!this.canvas) {
      return;
    }

    const data = `data:image/svg+xml;utf8,${encodeURIComponent(this.canvas.toSVG())}`;
    const link = document.createElement('a');
    link.href = data;
    link.download = `${Date.now()}.svg`;
    link.click();
  }

  readSelectionState(): EditorSelectionState {
    const object = this.canvas?.getActiveObject();
    if (!object) {
      return { ...DEFAULT_SELECTION_STATE };
    }

    const decorations = [
      object.get('underline') ? 'underline' : '',
      object.get('overline') ? 'overline' : '',
      object.get('linethrough') ? 'line-through' : ''
    ].filter(Boolean);

    return {
      id: this.getObjectId(object),
      opacity: Math.round(Number(this.getActiveStyle<number>('opacity') || 1) * 100),
      fill: String(this.getActiveStyle('fill') || DEFAULT_SELECTION_STATE.fill),
      fontSize: Number(this.getActiveStyle('fontSize') || DEFAULT_SELECTION_STATE.fontSize),
      lineHeight: Number(this.getActiveStyle('lineHeight') || DEFAULT_SELECTION_STATE.lineHeight),
      charSpacing: Number(this.getActiveStyle('charSpacing') || DEFAULT_SELECTION_STATE.charSpacing),
      fontWeight: String(this.getActiveStyle('fontWeight') || ''),
      fontStyle: String(this.getActiveProp('fontStyle') || ''),
      textAlign: this.getActiveProp('textAlign') || DEFAULT_SELECTION_STATE.textAlign,
      fontFamily: this.getActiveProp('fontFamily') || DEFAULT_SELECTION_STATE.fontFamily,
      textDecoration: decorations.join(' '),
    };
  }

  updateSelectionId(id: string): void {
    const object = this.canvas?.getActiveObject();
    if (!object) {
      return;
    }

    const snapshot = object.toObject();
    object.toObject = () => ({
      ...snapshot,
      id
    });
  }

  setSelectionOpacity(opacity: number): void {
    this.setActiveStyle('opacity', Number(opacity) / 100);
  }

  setSelectionFill(fill: string): void {
    this.setActiveStyle('fill', fill);
  }

  setSelectionLineHeight(lineHeight: number): void {
    this.setActiveStyle('lineHeight', Number(lineHeight));
  }

  setSelectionCharSpacing(charSpacing: number): void {
    this.setActiveStyle('charSpacing', Number(charSpacing));
  }

  setSelectionFontSize(fontSize: number): void {
    this.setActiveStyle('fontSize', Number(fontSize));
  }

  setSelectionFontWeight(fontWeight: string): void {
    this.setActiveStyle('fontWeight', fontWeight || 'normal');
  }

  setSelectionFontStyle(fontStyle: string): void {
    this.setActiveStyle('fontStyle', fontStyle || 'normal');
  }

  setSelectionTextDecoration(textDecoration: string): void {
    this.setActiveStyle('textDecoration', textDecoration);
  }

  setSelectionTextAlign(textAlign: string): void {
    this.setActiveProp('textAlign', textAlign);
  }

  setSelectionFontFamily(fontFamily: string): void {
    this.setActiveProp('fontFamily', fontFamily);
  }

  private handleSelection(object: CanvasEntity | null): void {
    this.selected.set(object);
    this.textEditorVisible.set(false);
    this.figureEditorVisible.set(false);

    if (!object) {
      return;
    }

    object.set({
      hasRotatingPoint: true,
      transparentCorners: false,
      cornerColor: 'rgba(37, 99, 235, 0.7)'
    });

    switch (object.type) {
      case 'rect':
      case 'circle':
      case 'triangle':
        this.figureEditorVisible.set(true);
        break;
      case 'i-text':
      case 'textbox':
        this.textEditorVisible.set(true);
        break;
    }
  }

  private applyInteractionMode(): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.isDrawingMode = this.drawingModeEnabled;
    this.canvas.selection = !this.drawingModeEnabled;
    this.canvas.skipTargetFind = this.drawingModeEnabled;
    this.canvas.defaultCursor = this.drawingModeEnabled ? 'crosshair' : 'default';
    this.canvas.hoverCursor = this.drawingModeEnabled ? 'crosshair' : 'move';

    this.canvas.forEachObject((object) => {
      object.set({
        selectable: !this.drawingModeEnabled,
        evented: !this.drawingModeEnabled
      });
    });

    if (this.drawingModeEnabled) {
      this.canvas.discardActiveObject();
      this.handleSelection(null);
    }
  }

  private selectItemAfterAdded(obj: CanvasEntity): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.discardActiveObject();
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
    this.handleSelection(obj);
  }

  private extend(obj: CanvasEntity, id: number): void {
    const originalToObject = obj.toObject;
    obj.toObject = ((toObject) => () => ({
      ...toObject.call(obj),
      id
    }))(originalToObject);
  }

  private randomId(): number {
    return Math.floor(Math.random() * 999999) + 1;
  }

  private getObjectId(object: CanvasEntity): string {
    const serializableObject = object as CanvasEntity & {
      toObject(propertiesToInclude?: string[]): { id?: string | number };
    };
    const id = serializableObject.toObject(['id']).id;
    return id ? String(id) : '';
  }

  private getActiveStyle<T = string | number>(styleName: string): T | '' {
    const object = this.canvas?.getActiveObject() as IText | null;
    if (!object) {
      return '';
    }

    if ('getSelectionStyles' in object && object.isEditing) {
      const selectionStyle = object.getSelectionStyles()[0] as Record<string, T | undefined> | undefined;
      return selectionStyle?.[styleName] || '';
    }

    return (object.get(styleName as never) as T) || '';
  }

  private setActiveStyle(styleName: string, value: string | number): void {
    const object = this.canvas?.getActiveObject() as IText | null;
    if (!object) {
      return;
    }

    if ('setSelectionStyles' in object && object.isEditing) {
      if (typeof value === 'string') {
        object.setSelectionStyles({
          underline: value.includes('underline'),
          overline: value.includes('overline'),
          linethrough: value.includes('line-through')
        });
      }

      object.setSelectionStyles({ [styleName]: value } as never);
      object.setCoords();
    } else {
      if (typeof value === 'string') {
        object.set({
          underline: value.includes('underline'),
          overline: value.includes('overline'),
          linethrough: value.includes('line-through')
        } as never);
      }

      object.set(styleName as never, value as never);
    }

    object.setCoords();
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  private getActiveProp(name: string): string {
    const object = this.canvas?.getActiveObject();
    if (!object) {
      return '';
    }

    return String(object.get(name as never) ?? '');
  }

  private setActiveProp(name: string, value: unknown): void {
    const object = this.canvas?.getActiveObject();
    if (!object) {
      return;
    }

    object.set(name as never, value as never);
    object.setCoords();
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  private async applyCanvasImageToCanvas(backgroundImage: string): Promise<void> {
    if (!this.canvas || !backgroundImage) {
      return;
    }

    const image = await FabricImage.fromURL(backgroundImage);
    const pattern = new Pattern({
      source: image.getElement(),
      repeat: 'repeat'
    });

    this.canvas.backgroundColor = pattern;
  }

  private touchRevision(): void {
    if (this.hydrating) {
      return;
    }

    this.revision.update((value) => value + 1);
  }

  zoomIn(): void {
    const newZoom = Math.min(this.zoom() + 0.1, 3);
    this.setZoom(newZoom);
  }

  zoomOut(): void {
    const newZoom = Math.max(this.zoom() - 0.1, 0.3);
    this.setZoom(newZoom);
  }

  private setZoom(scale: number): void {
    this.zoom.set(scale);
    if (this.canvasElement) {
      this.canvasElement.style.setProperty('--canvas-zoom', String(scale));
    }
    this.canvas?.requestRenderAll();
  }
}
