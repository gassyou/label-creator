import { Injectable, signal } from '@angular/core';
import {
  Canvas,
  Circle,
  FabricImage,
  IText,
  Line,
  Pattern,
  Rect,
  Triangle,
  util as fabricUtil
} from 'fabric';
import {
  BarcodeElement,
  CircleElement,
  DEFAULT_CANVAS_STATE,
  DEFAULT_SELECTION_STATE,
  EditorCanvasState,
  EditorSelectionState,
  ElementType,
  LabelElement,
  LabelPage,
  LineElement,
  millimetersToPixels,
  QRCodeElement,
  TextElement,
  TriangleElement,
  RectElement
} from './models/label.models';

@Injectable()
export class EditorCanvasService {
  readonly selected = signal<LabelElement | null>(null);
  readonly textEditorVisible = signal(false);
  readonly figureEditorVisible = signal(false);
  readonly jsonPreview = signal('');
  readonly revision = signal(0);
  readonly zoom = signal(1);

  private canvas: Canvas | null = null;
  private drawingModeEnabled = false;
  private hydrating = false;
  private canvasElement: HTMLCanvasElement | null = null;

  // Element registry for tracking all elements on canvas
  private elementRegistry: Map<string, LabelElement> = new Map();

  // Clipboard for copy/paste
  private clipboard: any[] = [];

  // Undo/Redo stacks
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxUndoLevels = 50;

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

    this.canvas.on('selection:created', () => this.handleSelection(this.canvas?.getActiveObject() ?? null));
    this.canvas.on('selection:updated', () => this.handleSelection(this.canvas?.getActiveObject() ?? null));
    this.canvas.on('selection:cleared', () => this.handleSelection(null));
    this.canvas.on('object:added', () => this.touchRevision());
    this.canvas.on('object:modified', () => this.touchRevision());
    this.canvas.on('object:removed', () => this.touchRevision());
    this.canvas.on('text:changed', () => this.touchRevision());
    this.applyInteractionMode();
    this.canvas.requestRenderAll();
    this.jsonPreview.set(JSON.stringify(this.canvas.toJSON(), null, 2));
  }

  destroy(): void {
    this.canvas?.dispose();
    this.canvas = null;
    this.elementRegistry.clear();
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

  // ============================================================
  // Element Creation Methods
  // ============================================================

  addText(content: string): LabelElement {
    if (!this.canvas) {
      throw new Error('Canvas not initialized');
    }

    const id = this.randomId();
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

    this.extend(text, id);

    // Create and track the element model BEFORE adding to canvas
    const element = this.createElementModel(text, 'text') as TextElement;
    this.elementRegistry.set(element.id, element);

    this.canvas.add(text);
    this.selectItemAfterAdded(text);

    return element;
  }

  addShape(shapeType: 'square' | 'triangle' | 'circle' | 'line'): LabelElement {
    if (!this.canvas) {
      throw new Error('Canvas not initialized');
    }

    let shape: LabelElement;

    switch (shapeType) {
      case 'square':
        shape = {
          type: 'rect',
          id: this.randomId(),
          x: 24,
          y: 24,
          width: 100,
          height: 100,
          fill: '#059669',
          stroke: '#374151',
          strokeWidth: 2
        } as RectElement;
        break;
      case 'triangle':
        shape = {
          type: 'triangle',
          id: this.randomId(),
          x: 24,
          y: 24,
          width: 100,
          height: 100,
          fill: '#0ea5e9',
          stroke: '#374151',
          strokeWidth: 2
        } as TriangleElement;
        break;
      case 'circle':
        shape = {
          type: 'circle',
          id: this.randomId(),
          x: 24,
          y: 24,
          width: 100,
          height: 100,
          fill: '#f97316',
          stroke: '#374151',
          strokeWidth: 2
        } as CircleElement;
        break;
      case 'line':
        shape = {
          type: 'line',
          id: this.randomId(),
          x: 24,
          y: 24,
          x1: 24,
          y1: 24,
          x2: 124,
          y2: 24,
          stroke: '#000000',
          strokeWidth: 2
        } as LineElement;
        break;
    }

    // Register element before adding to canvas
    this.elementRegistry.set(shape.id, shape);

    const fabricShape = this.createFabricShape(shape);
    this.extend(fabricShape, shape.id);
    this.canvas.add(fabricShape);
    this.selectItemAfterAdded(fabricShape);

    return shape;
  }

  addQRCode(bindingValue?: string): QRCodeElement {
    if (!this.canvas) {
      throw new Error('Canvas not initialized');
    }

    const previewValue = bindingValue || '${qrcode}';
    const qrElement: QRCodeElement = {
      type: 'qrcode',
      id: this.randomId(),
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      value: previewValue,
      errorCorrectionLevel: 'M',
      foregroundColor: '#000000',
      backgroundColor: '#ffffff'
    };

    // Use FabricImage with custom properties for barcode/qrcode
    const qrDataUrl = this.generateQRCodeDataUrl(previewValue, 100);

    FabricImage.fromURL(qrDataUrl).then((img) => {
      img.set({
        left: qrElement.x,
        top: qrElement.y,
        scaleX: 1,
        scaleY: 1
      });

      // Set custom properties for barcode/qrcode
      (img as any).elementType = 'qrcode';
      (img as any).bindingValue = previewValue;
      (img as any).errorCorrectionLevel = 'M';
      (img as any).foregroundColor = '#000000';
      (img as any).backgroundColor = '#ffffff';

      // Extend toObject to persist these properties
      this.extendWithBarcodeProperties(img, {
        elementType: 'qrcode',
        bindingValue: previewValue,
        errorCorrectionLevel: 'M',
        foregroundColor: '#000000',
        backgroundColor: '#ffffff'
      });

      this.extend(img, qrElement.id);
      this.elementRegistry.set(qrElement.id, qrElement);
      this.canvas!.add(img);
      this.selectItemAfterAdded(img);
    });

    return qrElement;
  }

  addBarcode(format: BarcodeElement['format'], bindingValue?: string): BarcodeElement {
    if (!this.canvas) {
      throw new Error('Canvas not initialized');
    }

    const previewValue = bindingValue || '${barcode}';
    const barcodeElement: BarcodeElement = {
      type: 'barcode',
      id: this.randomId(),
      x: 50,
      y: 50,
      width: 200,
      height: 80,
      format,
      value: previewValue,
      showText: true
    };

    // Use FabricImage with custom properties for barcode
    const barcodeDataUrl = this.generateBarcodeDataUrl(previewValue, format);

    FabricImage.fromURL(barcodeDataUrl).then((img) => {
      img.set({
        left: barcodeElement.x,
        top: barcodeElement.y,
        scaleX: 1,
        scaleY: 1
      });

      // Set custom properties
      (img as any).elementType = 'barcode';
      (img as any).bindingValue = previewValue;
      (img as any).barcodeFormat = format;
      (img as any).showText = true;

      // Extend toObject
      this.extendWithBarcodeProperties(img, {
        elementType: 'barcode',
        bindingValue: previewValue,
        barcodeFormat: format,
        showText: true
      });

      this.extend(img, barcodeElement.id);
      this.elementRegistry.set(barcodeElement.id, barcodeElement);
      this.canvas!.add(img);
      this.selectItemAfterAdded(img);
    });

    return barcodeElement;
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

  // ============================================================
  // Element CRUD Operations
  // ============================================================

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
    activeObjects.forEach((object) => {
      const id = this.getObjectId(object);
      this.elementRegistry.delete(id);
      this.canvas?.remove(object);
    });
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
      this.extend(clone as any, this.randomId());
      this.canvas?.add(clone);
      this.selectItemAfterAdded(clone as any);
    });
  }

  copySelected(): void {
    const activeObjects = this.canvas?.getActiveObjects();
    if (!this.canvas || !activeObjects || activeObjects.length === 0) {
      return;
    }

    this.clipboard = [];
    Promise.all(activeObjects.map(obj => obj.clone())).then((clones) => {
      this.clipboard = clones;
    });
  }

  pasteClipboard(): void {
    if (!this.canvas || this.clipboard.length === 0) {
      return;
    }

    this.saveUndoState();
    const newObjects: any[] = [];

    this.clipboard.forEach((clone) => {
      clone.set({
        left: (clone.left ?? 0) + 20,
        top: (clone.top ?? 0) + 20
      });
      this.extend(clone, this.randomId());
      this.canvas?.add(clone);
      newObjects.push(clone);
    });

    if (newObjects.length === 1) {
      this.canvas?.setActiveObject(newObjects[0]);
    } else if (newObjects.length > 1) {
      import('fabric').then(({ ActiveSelection }) => {
        const selection = new ActiveSelection(newObjects, { canvas: this.canvas! });
        this.canvas?.setActiveObject(selection);
        this.canvas?.requestRenderAll();
      });
    }
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  undo(): void {
    if (!this.canvas || this.undoStack.length === 0) {
      return;
    }

    const currentState = JSON.stringify(this.canvas.toJSON());
    this.redoStack.push(currentState);

    const previousState = this.undoStack.pop();
    if (previousState) {
      this.canvas.loadFromJSON(previousState).then(() => {
        this.canvas?.requestRenderAll();
        this.touchRevision();
      });
    }
  }

  redo(): void {
    if (!this.canvas || this.redoStack.length === 0) {
      return;
    }

    const currentState = JSON.stringify(this.canvas.toJSON());
    this.undoStack.push(currentState);

    const nextState = this.redoStack.pop();
    if (nextState) {
      this.canvas.loadFromJSON(nextState).then(() => {
        this.canvas?.requestRenderAll();
        this.touchRevision();
      });
    }
  }

  private saveUndoState(): void {
    if (!this.canvas || this.hydrating) {
      return;
    }

    const state = JSON.stringify(this.canvas.toJSON());
    this.undoStack.push(state);

    if (this.undoStack.length > this.maxUndoLevels) {
      this.undoStack.shift();
    }

    this.redoStack = [];
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
    this.elementRegistry.clear();
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

  // ============================================================
  // Serialization
  // ============================================================

  serializeCanvas(): string {
    if (!this.canvas) {
      return '';
    }

    return JSON.stringify(this.canvas.toJSON());
  }

  /**
   * Serialize to TemplateDocument format (Section 7)
   * This is the proper format for storing, not raw Fabric JSON
   */
  serializeToTemplate(): string {
    const elements: LabelElement[] = [];
    this.elementRegistry.forEach((element) => {
      elements.push(element);
    });

    const template = {
      id: `tpl-${Date.now()}`,
      name: 'Template',
      width: this.canvas?.width ?? 0,
      height: this.canvas?.height ?? 0,
      elements
    };

    return JSON.stringify(template, null, 2);
  }

  async loadPage(page: LabelPage): Promise<void> {
    if (!this.canvas) {
      return;
    }

    const canvasState = page.canvasState ?? DEFAULT_CANVAS_STATE;
    this.hydrating = true;
    this.canvas.clear();
    this.elementRegistry.clear();
    this.canvas.setDimensions({
      width: canvasState.width,
      height: canvasState.height
    });

    if (canvasState.backgroundImage) {
      await this.applyCanvasImageToCanvas(canvasState.backgroundImage);
    } else {
      this.canvas.backgroundColor = canvasState.backgroundColor;
    }

    if (page.canvasJson) {
      await this.canvas.loadFromJSON(page.canvasJson);

      // Rebuild element registry and extend objects with IDs after loading
      let index = 0;
      this.canvas.forEachObject((object) => {
        const existingId = this.getObjectId(object);
        const id = existingId || `loaded-${Date.now()}-${index++}`;
        if (!existingId) {
          this.extend(object, id);
        }
        // Create basic element model for registry
        const elementType = this.getElementType(object);
        const element = this.createElementModel(object, elementType);
        this.elementRegistry.set(id, element);
      });
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

  // ============================================================
  // Selection Operations
  // ============================================================

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

    const objectType = this.getElementType(object);
    const baseState = {
      id: this.getObjectId(object),
      type: objectType,
      opacity: Math.round(Number(this.getActiveStyle<number>('opacity') || 1) * 100),
      fill: String(this.getActiveStyle('fill') || DEFAULT_SELECTION_STATE.fill),
      stroke: String(object.get('stroke') || ''),
      strokeWidth: Number(object.get('strokeWidth') || 0),
      fontSize: Number(this.getActiveStyle('fontSize') || DEFAULT_SELECTION_STATE.fontSize),
      lineHeight: Number(this.getActiveStyle('lineHeight') || DEFAULT_SELECTION_STATE.lineHeight),
      charSpacing: Number(this.getActiveStyle('charSpacing') || DEFAULT_SELECTION_STATE.charSpacing),
      fontWeight: String(this.getActiveStyle('fontWeight') || ''),
      fontStyle: String(this.getActiveProp('fontStyle') || ''),
      textAlign: this.getActiveProp('textAlign') || DEFAULT_SELECTION_STATE.textAlign,
      fontFamily: this.getActiveProp('fontFamily') || DEFAULT_SELECTION_STATE.fontFamily,
      textDecoration: decorations.join(' '),
    };

    // Add type-specific properties
    switch (objectType) {
      case 'text':
        return {
          ...baseState,
          text: (object as IText).text ?? '',
          color: String(object.get('fill') || '#000000'),
        };
      case 'barcode':
        // For FabricImage-based barcode, read properties directly from object
        if (object.type === 'image') {
          return {
            ...baseState,
            barcodeFormat: (object as any).barcodeFormat ?? 'CODE128',
            showText: (object as any).showText ?? true,
          };
        }
        const barcodeEl = this.getObjectElement(object) as BarcodeElement | undefined;
        return {
          ...baseState,
          barcodeFormat: barcodeEl?.format ?? 'CODE128',
          showText: barcodeEl?.showText ?? true,
        };
      case 'qrcode':
        // For FabricImage-based qrcode, read properties directly from object
        if (object.type === 'image') {
          return {
            ...baseState,
            foregroundColor: (object as any).foregroundColor ?? '#000000',
            backgroundColor: (object as any).backgroundColor ?? '#ffffff',
            errorCorrectionLevel: (object as any).errorCorrectionLevel ?? 'M',
          };
        }
        const qrEl = this.getObjectElement(object) as QRCodeElement | undefined;
        return {
          ...baseState,
          foregroundColor: qrEl?.foregroundColor ?? '#000000',
          backgroundColor: qrEl?.backgroundColor ?? '#ffffff',
        };
      default:
        return baseState;
    }
  }

  private getElementType(object: any): EditorSelectionState['type'] {
    const type = object.type;
    if (type === 'i-text' || type === 'textbox') return 'text';
    if (type === 'line') return 'line';
    if (type === 'rect') {
      const element = this.getObjectElement(object);
      if (element?.type === 'barcode') return 'barcode';
      if (element?.type === 'qrcode') return 'qrcode';
      return 'shape';
    }
    if (type === 'circle' || type === 'triangle') return 'shape';
    if (type === 'image') {
      // Check for barcode/qrcode custom property
      const elementType = (object as any).elementType;
      if (elementType === 'barcode') return 'barcode';
      if (elementType === 'qrcode') return 'qrcode';
      return 'image';
    }
    return 'shape';
  }

  private getObjectElement(object: any): LabelElement | undefined {
    const id = this.getObjectId(object);
    return this.elementRegistry.get(id);
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
    // Update selection state after font change
    this.handleSelection(this.canvas?.getActiveObject() ?? null);
  }

  setSelectionFontStyle(fontStyle: string): void {
    this.setActiveStyle('fontStyle', fontStyle || 'normal');
    // Update selection state after font change
    this.handleSelection(this.canvas?.getActiveObject() ?? null);
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

  setSelectionStroke(stroke: string): void {
    const object = this.canvas?.getActiveObject();
    if (!object) return;
    object.set('stroke', stroke);
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  setSelectionStrokeWidth(strokeWidth: number): void {
    const object = this.canvas?.getActiveObject();
    if (!object) return;
    object.set('strokeWidth', strokeWidth);
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  setSelectionColor(color: string): void {
    this.setActiveStyle('fill', color);
  }

  updateBarcodeProperties(format: string, showText: boolean): void {
    const object = this.canvas?.getActiveObject();
    if (!object) return;
    const element = this.getObjectElement(object) as BarcodeElement | undefined;
    if (element) {
      element.format = format as BarcodeElement['format'];
      element.showText = showText;
    }
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  updateQRCodeProperties(foregroundColor: string, backgroundColor: string, errorCorrectionLevel: string): void {
    const object = this.canvas?.getActiveObject();
    if (!object) return;
    const element = this.getObjectElement(object) as QRCodeElement | undefined;
    if (element) {
      element.foregroundColor = foregroundColor;
      element.backgroundColor = backgroundColor;
      element.errorCorrectionLevel = errorCorrectionLevel as QRCodeElement['errorCorrectionLevel'];
    }
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  // ============================================================
  // Multi-Selection Alignment
  // ============================================================

  alignSelectedObjects(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    const objects = this.canvas?.getActiveObjects();
    if (!objects || objects.length === 0) return;

    // Get canvas dimensions for page-based alignment
    const canvasWidth = this.canvas?.width ?? 0;
    const canvasHeight = this.canvas?.height ?? 0;

    // Normalize all objects to have originX='left' and originY='top'
    // This ensures left/top represents the actual bounding box edges
    objects.forEach(obj => {
      obj.set({
        originX: 'left',
        originY: 'top'
      });
      obj.setCoords();
    });

    // Calculate actual bounds for each object
    const objectData = objects.map(obj => {
      const left = obj.left ?? 0;
      const top = obj.top ?? 0;
      const width = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const height = (obj.height ?? 0) * (obj.scaleY ?? 1);
      return { obj, left, top, width, height };
    });

    // Calculate bounding extremes from selected objects
    const minLeft = Math.min(...objectData.map(d => d.left));
    const maxRight = Math.max(...objectData.map(d => d.left + d.width));
    const minTop = Math.min(...objectData.map(d => d.top));
    const maxBottom = Math.max(...objectData.map(d => d.top + d.height));

    // Calculate target bounds - use canvas/page for alignment reference
    let targetLeft: number, targetRight: number, targetTop: number, targetBottom: number;
    let targetCenterX: number, targetCenterY: number;

    if (objects.length === 1) {
      // Single selection: align to canvas/page
      targetLeft = 0;
      targetRight = canvasWidth;
      targetTop = 0;
      targetBottom = canvasHeight;
      targetCenterX = canvasWidth / 2;
      targetCenterY = canvasHeight / 2;
    } else {
      // Multi-selection: align to bounding box of selected objects
      targetLeft = minLeft;
      targetRight = maxRight;
      targetTop = minTop;
      targetBottom = maxBottom;
      targetCenterX = (minLeft + maxRight) / 2;
      targetCenterY = (minTop + maxBottom) / 2;
    }

    // Calculate new positions
    const newPositions: Map<any, { left?: number; top?: number }> = new Map();
    for (const data of objectData) {
      const newPos: { left?: number; top?: number } = {};
      switch (direction) {
        case 'left':
          newPos.left = targetLeft;
          break;
        case 'center':
          newPos.left = targetCenterX - data.width / 2;
          break;
        case 'right':
          newPos.left = targetRight - data.width;
          break;
        case 'top':
          newPos.top = targetTop;
          break;
        case 'middle':
          newPos.top = targetCenterY - data.height / 2;
          break;
        case 'bottom':
          newPos.top = targetBottom - data.height;
          break;
      }
      newPositions.set(data.obj, newPos);
    }

    // Apply all position changes at once
    for (const data of objectData) {
      const newPos = newPositions.get(data.obj);
      if (newPos) {
        data.obj.set(newPos);
      }
    }

    // Update coordinates and render
    objects.forEach(obj => obj.setCoords());
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  distributeSelectedObjects(direction: 'horizontal' | 'vertical'): void {
    const objects = this.canvas?.getActiveObjects();
    if (!objects || objects.length < 3) return;

    // Normalize all objects to originX='left' and originY='top' first
    objects.forEach(obj => {
      const currentLeft = obj.left ?? 0;
      const currentTop = obj.top ?? 0;
      const scaleX = obj.scaleX ?? 1;
      const scaleY = obj.scaleY ?? 1;
      const width = (obj.width ?? 0) * scaleX;
      const height = (obj.height ?? 0) * scaleY;

      // Calculate visual left/top based on current origin
      const visualLeft = obj.originX === 'center' ? currentLeft - width / 2 :
                         obj.originX === 'right' ? currentLeft - width : currentLeft;
      const visualTop = obj.originY === 'center' ? currentTop - height / 2 :
                        obj.originY === 'bottom' ? currentTop - height : currentTop;

      // Set origin to left/top
      obj.set({
        originX: 'left',
        originY: 'top'
      });

      // Keep the same visual position using calculated visual values
      obj.set({
        left: visualLeft,
        top: visualTop
      });
      obj.setCoords();
    });

    // Now get bounds after normalization
    interface ObjData {
      obj: any;
      left: number;
      top: number;
      width: number;
      height: number;
    }
    const objectData: ObjData[] = objects.map(obj => ({
      obj,
      left: obj.left ?? 0,
      top: obj.top ?? 0,
      width: (obj.width ?? 0) * (obj.scaleX ?? 1),
      height: (obj.height ?? 0) * (obj.scaleY ?? 1)
    }));

    // Sort objects along the axis
    const sorted = [...objectData].sort((a, b) =>
      direction === 'horizontal'
        ? a.left - b.left
        : a.top - b.top
    );

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const firstEdge = direction === 'horizontal' ? first.left : first.top;
    const lastEdge = direction === 'horizontal'
      ? last.left + last.width
      : last.top + last.height;
    const totalSpace = lastEdge - firstEdge;
    const totalSize = sorted.reduce((sum, d) =>
      direction === 'horizontal' ? sum + d.width : sum + d.height, 0);
    const availableSpace = totalSpace - totalSize;
    const gap = availableSpace / (sorted.length - 1);

    let currentEdge = firstEdge + (direction === 'horizontal' ? first.width : first.height) + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      const data = sorted[i];
      if (direction === 'horizontal') {
        data.obj.set({ left: currentEdge });
      } else {
        data.obj.set({ top: currentEdge });
      }
      currentEdge += (direction === 'horizontal' ? data.width : data.height) + gap;
      data.obj.setCoords();
    }

    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  hasMultiSelection(): boolean {
    const objects = this.canvas?.getActiveObjects();
    return objects ? objects.length > 1 : false;
  }

  hasSelection(): boolean {
    return !!this.canvas?.getActiveObject();
  }

  // ============================================================
  // Element Registry
  // ============================================================

  getElementById(id: string): LabelElement | undefined {
    return this.elementRegistry.get(id);
  }

  getAllElements(): LabelElement[] {
    return Array.from(this.elementRegistry.values());
  }

  // ============================================================
  // Private Methods
  // ============================================================

  private handleSelection(object: any): void {
    if (!object) {
      this.selected.set(null);
      this.textEditorVisible.set(false);
      this.figureEditorVisible.set(false);
      return;
    }

    object.set({
      hasRotatingPoint: true,
      transparentCorners: false,
      cornerColor: 'rgba(37, 99, 235, 0.7)'
    });

    const id = this.getObjectId(object);
    const element = this.elementRegistry.get(id) ?? null;
    this.selected.set(element);

    this.textEditorVisible.set(false);
    this.figureEditorVisible.set(false);

    const type = object.type;
    if (type === 'rect' || type === 'circle' || type === 'triangle' || type === 'line') {
      this.figureEditorVisible.set(true);
    } else if (type === 'i-text' || type === 'textbox') {
      this.textEditorVisible.set(true);
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

  private selectItemAfterAdded(obj: any): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.discardActiveObject();
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
    this.handleSelection(obj);
  }

  private extend(obj: any, id: string | number): void {
    const originalToObject = obj.toObject;
    obj.toObject = ((toObject) => () => ({
      ...toObject.call(obj),
      id
    }))(originalToObject);
  }

  private extendWithBarcodeProperties(obj: any, props: Record<string, any>): void {
    const originalToObject = obj.toObject;
    const objRef = obj;
    obj.toObject = () => {
      return fabricUtil.object.extend(originalToObject.call(objRef), props);
    };

    // Set instance properties
    Object.assign(obj, props);
  }

  generateQRCodeDataUrl(value: string, size: number): string {
    try {
      // Use qrcode library to generate SVG
      const svg = (window as any).qrcode.generateSVG(value, { width: size });
      return 'data:image/svg+xml;base64,' + btoa(svg);
    } catch (e) {
      console.error('QR code generation failed:', e);
      return this.createPlaceholderDataUrl('QR', size);
    }
  }

  generateBarcodeDataUrl(value: string, format: string): string {
    try {
      const canvas = document.createElement('canvas');
      (window as any).JsBarcode(canvas, value, { format });
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Barcode generation failed:', e);
      return this.createPlaceholderDataUrl('BC', 200);
    }
  }

  private createPlaceholderDataUrl(text: string, size: number): string {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, size, size / 2);
      ctx.fillStyle = '#999';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(text, size / 2, size / 4);
    }
    return canvas.toDataURL('image/png');
  }

  private randomId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getObjectId(object: any): string {
    try {
      const serializableObject = object as any;
      const id = serializableObject.toObject(['id']).id;
      return id ? String(id) : '';
    } catch {
      return '';
    }
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
    this.jsonPreview.set(JSON.stringify(this.canvas?.toJSON() ?? {}, null, 2));
  }

  // ============================================================
  // Element Model Creation
  // ============================================================

  private createElementModel(object: any, type: EditorSelectionState['type']): LabelElement {
    const base = {
      id: this.getObjectId(object),
      type: type as ElementType,
      x: object.left ?? 0,
      y: object.top ?? 0,
      width: (object.width ?? 100) * (object.scaleX ?? 1),
      height: (object.height ?? 100) * (object.scaleY ?? 1),
      rotation: object.angle ?? 0,
      opacity: object.opacity ?? 1,
      visible: object.visible ?? true,
      lock: !object.selectable
    };

    switch (type) {
      case 'text':
        return {
          ...base,
          type: 'text',
          text: (object as IText).text ?? '',
          fontSize: object.fontSize ?? 16,
          fontFamily: object.fontFamily ?? 'Helvetica',
          fontWeight: object.fontWeight ?? '',
          fontStyle: object.fontStyle ?? '',
          align: object.textAlign ?? 'left',
          color: object.fill ?? '#000000',
          lineHeight: object.lineHeight ?? 1.16,
          charSpacing: object.charSpacing ?? 0
        } as TextElement;
      case 'shape':
        return {
          ...base,
          type: 'rect',
          fill: object.fill ?? '#000000',
          stroke: object.stroke ?? '',
          strokeWidth: object.strokeWidth ?? 0,
          radius: object.rx ?? 0
        } as RectElement;
      case 'line':
        return {
          ...base,
          type: 'line',
          stroke: object.stroke ?? '#000000',
          strokeWidth: object.strokeWidth ?? 1
        } as LineElement;
      default:
        return base as LabelElement;
    }
  }

  private createFabricShape(element: LabelElement): any {
    switch (element.type) {
      case 'rect':
        return new Rect({
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          fill: (element as RectElement).fill ?? '#000000',
          stroke: (element as RectElement).stroke || undefined,
          strokeWidth: (element as RectElement).strokeWidth || 0,
          rx: (element as RectElement).radius
        });
      case 'circle':
        return new Circle({
          left: element.x,
          top: element.y,
          radius: element.width / 2,
          fill: (element as CircleElement).fill ?? '#000000',
          stroke: (element as CircleElement).stroke || undefined,
          strokeWidth: (element as CircleElement).strokeWidth || 0
        });
      case 'triangle':
        return new Triangle({
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          fill: (element as TriangleElement).fill ?? '#000000',
          stroke: (element as TriangleElement).stroke || undefined,
          strokeWidth: (element as TriangleElement).strokeWidth || 0
        });
      case 'qrcode':
        return new Rect({
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          fill: (element as QRCodeElement).backgroundColor ?? '#ffffff',
          stroke: (element as QRCodeElement).foregroundColor ?? '#000000',
          strokeWidth: 2
        });
      case 'barcode':
        return new Rect({
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          fill: '#ffffff',
          stroke: '#000000',
          strokeWidth: 1
        });
      case 'line': {
        const lineEl = element as LineElement;
        const line = new Line([0, 0, lineEl.x2 - lineEl.x1, lineEl.y2 - lineEl.y1], {
          left: lineEl.x1,
          top: lineEl.y1,
          stroke: lineEl.stroke || '#000000',
          strokeWidth: lineEl.strokeWidth || 1,
          originX: 'left',
          originY: 'top'
        });
        return line;
      }
      default:
        return new Rect({
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          fill: '#cccccc'
        });
    }
  }

  // ============================================================
  // Zoom
  // ============================================================

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