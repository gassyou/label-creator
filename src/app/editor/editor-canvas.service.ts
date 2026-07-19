import { Injectable, inject, signal } from '@angular/core';
import { Canvas, FabricImage, IText, Pattern } from 'fabric';
import {
  DEFAULT_SELECTION_STATE,
  type LabelElement,
  TextElement,
  QRCodeElement,
  BarcodeElement,
  ImageElement,
  EditorSelectionState,
} from './models/editor.models';
import { Label, PX_PER_MM, millimetersToPixels } from './models/label.models';
import { LabelDocumentService } from './document';
import { BaseElement, type RenderContext } from './models/element-base';
import { ElementFactory } from './models/element-factory';
import { EditorCommand } from './commands/editor-command';
import { AddTextCommand } from './commands/add-text.command';
import { AddShapeCommand } from './commands/add-shape.command';
import { AddQRCodeCommand } from './commands/add-qrcode.command';
import { AddBarcodeCommand } from './commands/add-barcode.command';
import { AddImageCommand } from './commands/add-image.command';
import { DeleteSelectedCommand } from './commands/delete-selected.command';
import { ClearCanvasCommand } from './commands/clear-canvas.command';
import { FabricRenderer } from './render/fabric-renderer';

@Injectable()
export class EditorCanvasService {
  readonly selected = signal<BaseElement | null>(null);
  readonly textEditorVisible = signal(false);
  readonly figureEditorVisible = signal(false);
  readonly revision = signal(0);
  readonly zoom = signal(1);
  readonly canUndoSignal = signal(false);
  readonly canRedoSignal = signal(false);

  readonly doc = inject(LabelDocumentService);
  private readonly renderer = inject(FabricRenderer);

  /** Backwards-compatible accessor — delegates to the renderer. */
  get canvas(): Canvas | null {
    return this.renderer.getCanvas();
  }

  private drawingModeEnabled = false;
  private hydrating = false;

  // Element registry for tracking all elements on canvas
  // Delegates to the renderer; kept as a public field for legacy callers
  // (Phase 6 deletes this).
  public elementRegistry: Map<string, BaseElement> = new Map();

  constructor() {
    // Sync local elementRegistry view with the renderer-owned registry.
    // Phase 6 deletes elementRegistry entirely; until then this keeps the
    // legacy API (read/write elementRegistry) intact.
    this.elementRegistry = this.renderer.getElementRegistry() as Map<string, BaseElement>;
  }

  // Clipboard for copy/paste
  private clipboard: any[] = [];

  // Undo/Redo stacks
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxUndoLevels = 50;
  private undoInFlight = false;

  initialize(
    element: HTMLCanvasElement,
    canvasState: {
      width: number;
      height: number;
      backgroundColor: string;
      backgroundImage?: string;
    },
  ): void {
    this.renderer.initialize(element, canvasState);
    const canvas = this.renderer.getCanvas();
    if (!canvas) return;

    canvas.on('selection:created', () =>
      this.handleSelection(this.canvas?.getActiveObject() ?? null),
    );
    canvas.on('selection:updated', () =>
      this.handleSelection(this.canvas?.getActiveObject() ?? null),
    );
    canvas.on('selection:cleared', () => this.handleSelection(null));
    canvas.on('object:added', () => this.touchRevision());
    canvas.on('object:modified', () =>
      this.handleObjectModified(this.canvas?.getActiveObject() ?? null),
    );
    canvas.on('object:removed', () => this.touchRevision());
    canvas.on('text:changed', () =>
      this.handleSelection(this.canvas?.getActiveObject() ?? null),
    );
    this.applyInteractionMode();
    canvas.requestRenderAll();
  }

  destroy(): void {
    this.renderer.dispose();
    this.elementRegistry.clear();
    this.handleSelection(null);
  }

  setDrawingMode(enabled: boolean): void {
    this.drawingModeEnabled = enabled;
    this.applyInteractionMode();
  }

  execute(command: EditorCommand): Promise<void> {
    this.pushUndoSnapshot();
    this.redoStack.length = 0;
    this.syncUndoSignals();
    return Promise.resolve()
      .then(() => command.execute(this))
      .then(
        () => this.touchRevision(),
        (err) => {
          this.undoStack.pop();
          this.syncUndoSignals();
          throw err;
        },
      );
  }

  undo(): void {
    if (this.undoInFlight) return;
    if (this.undoStack.length === 0 || !this.canvas) return;
    const current = JSON.stringify(this.canvas.toJSON());
    this.redoStack.push(current);
    const snapshot = this.undoStack.pop()!;
    this.undoInFlight = true;
    this.hydrating = true;
    this.canvas.loadFromJSON(snapshot).then(() => {
      this.canvas?.discardActiveObject();
      this.applyInteractionMode();
      this.hydrating = false;
      this.touchRevision();
      this.canvas?.requestRenderAll();
      this.syncUndoSignals();
      this.undoInFlight = false;
    });
  }

  redo(): void {
    if (this.undoInFlight) return;
    if (this.redoStack.length === 0 || !this.canvas) return;
    const current = JSON.stringify(this.canvas.toJSON());
    this.undoStack.push(current);
    const snapshot = this.redoStack.pop()!;
    this.undoInFlight = true;
    this.hydrating = true;
    this.canvas.loadFromJSON(snapshot).then(() => {
      this.canvas?.discardActiveObject();
      this.applyInteractionMode();
      this.hydrating = false;
      this.touchRevision();
      this.canvas?.requestRenderAll();
      this.syncUndoSignals();
      this.undoInFlight = false;
    });
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private pushUndoSnapshot(): void {
    if (!this.canvas) return;
    const snapshot = JSON.stringify(this.canvas.toJSON());
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxUndoLevels) this.undoStack.shift();
    this.syncUndoSignals();
  }

  private syncUndoSignals(): void {
    this.canUndoSignal.set(this.undoStack.length > 0);
    this.canRedoSignal.set(this.redoStack.length > 0);
  }

  getDrawingModeEnabled(): boolean {
    return this.drawingModeEnabled;
  }

  /**
   * Returns the Fabric canvas's serializable JSON projection (plain object).
   * Returns `null` when the Fabric canvas has not yet been initialised.
   *
   * Consumers (e.g. the JSON preview pane) read this directly instead of
   * subscribing to a `jsonPreview` signal, so the projection is computed
   * on-demand and not pushed to every subscriber.
   */
  toCanvasJson(): Record<string, unknown> | null {
    if (!this.canvas) return null;
    return this.canvas.toJSON() as unknown as Record<string, unknown>;
  }

  /**
   * Builds a narrow RenderContext that element render() methods can use to
   * create Fabric objects, attach ids, and register custom serialization
   * properties — without exposing the rest of EditorCanvasService.
   */
  getRenderContext(): RenderContext {
    if (!this.canvas) throw new Error('Canvas not initialized');
    return {
      canvas: this.canvas,
      extend: (obj, id) => this.extend(obj, id),
      extendWithCustomProperties: (obj, props) => this.extendWithCustomProperties(obj, props),
      randomId: () => this.randomId(),
    };
  }

  /**
   * Returns the element registry map for read/write access by element classes.
   * The returned type is narrowed to BaseElement so callers cannot assume
   * concrete element shapes.
   */
  getElementRegistry(): Map<string, BaseElement> {
    return this.elementRegistry;
  }

  // ============================================================
  // Element Creation Methods
  // ============================================================

  async addText(content: string): Promise<TextElement> {
    const cmd = new AddTextCommand(content);
    await this.execute(cmd);
    return cmd.element!;
  }

  async addShape(shapeType: 'square' | 'triangle' | 'circle' | 'line'): Promise<BaseElement> {
    const cmd = new AddShapeCommand(shapeType);
    await this.execute(cmd);
    return cmd.element!;
  }

  async addQRCode(bindingValue?: string): Promise<QRCodeElement> {
    const cmd = new AddQRCodeCommand(bindingValue);
    await this.execute(cmd);
    return cmd.element!;
  }

  async addBarcode(
    format: BarcodeElement['format'],
    bindingValue?: string,
  ): Promise<BarcodeElement> {
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

  async deleteSelected(): Promise<void> {
    await this.execute(new DeleteSelectedCommand());
  }

  async clearCanvas(): Promise<void> {
    await this.execute(new ClearCanvasCommand());
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
      // Mirror removal into the central document so doc consumers stay in sync.
      if (id && this.doc.elements().has(id)) {
        this.doc.removeElement(id);
      }
      this.canvas?.remove(object);
    });
    this.canvas.requestRenderAll();
    this.handleSelection(null);
  }

  deleteSelectedInternal(): void {
    this.removeSelected();
  }

  clearCanvasInternal(): void {
    if (!this.canvas) return;
    const objects = this.canvas.getObjects().slice();
    for (const obj of objects) this.canvas.remove(obj);
    // Mirror the wipe into the central document. LabelDocumentService has no
    // batch-clear method, so loop with the existing removeElement API.
    for (const id of this.elementRegistry.keys()) {
      if (this.doc.elements().has(id)) {
        this.doc.removeElement(id);
      }
    }
    this.elementRegistry.clear();
    this.handleSelection(null);
    this.touchRevision();
  }

  cloneSelected(): void {
    const activeObject = this.canvas?.getActiveObject();
    if (!this.canvas || !activeObject) {
      return;
    }

    activeObject.clone().then((clone) => {
      clone.set({
        left: (clone.left ?? 0) + 20,
        top: (clone.top ?? 0) + 20,
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
    Promise.all(activeObjects.map((obj) => obj.clone())).then((clones) => {
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
        top: (clone.top ?? 0) + 20,
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

  resetCanvas(backgroundColor: string): void {
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

  resizeCanvas(widthMm: number, heightMm: number): void {
    if (!this.canvas) {
      return;
    }

    const widthPx = millimetersToPixels(widthMm);
    const heightPx = millimetersToPixels(heightMm);
    this.canvas.setDimensions({ width: widthPx, height: heightPx });
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
        repeat: 'repeat',
      });

      this.canvas!.backgroundColor = pattern;
      this.touchRevision();
      this.canvas!.requestRenderAll();
      onApplied();
    });
  }

  /**
   * Compress image data URL to max dimension and return compressed data URL
   */
  private compressImageDataUrl(dataUrl: string, maxDimension: number = 1920): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale down if larger than max dimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // ============================================================
  // Serialization
  // ============================================================

  serializeCanvas(): string {
    if (!this.canvas) {
      return '';
    }

    this.normalizeTextStylesFontFamily();

    // 对 image 元素（barcode/qrcode 等）不做归一化：
    // setSelectionWidth/Height 已经把 obj.width/height 锁定为 elementRegistry
    // 里的业务字段（设计尺寸），scaleX/scaleY 反映用户的视觉调整。
    // 如果这里归一化为 obj.width = 视觉宽度，会丢失业务字段，
    // 让 PDF 路径上的比例偏离用户设计。
    //
    // 对其他元素（text/shape 等）保留原 Fabric 序列化（width × scaleX
    // 的派生组合由 Fabric 自己处理，编辑器加载后能正确还原）。
    return JSON.stringify(this.canvas.toJSON());
  }

  /**
   * 保存前归一化：把每个文本对象 styles 数组中所有区段的 fontFamily
   * 强制覆盖为外层 fontFamily，避免 styles 内遗留旧字体（如 Arial）
   * 导致 PDF 渲染中文时回退失败。
   */
  private normalizeTextStylesFontFamily(): void {
    if (!this.canvas) return;

    for (const obj of this.canvas.getObjects() as any[]) {
      if (!obj || (obj.type !== 'text' && obj.type !== 'i-text' && obj.type !== 'textbox')) {
        continue;
      }
      const outerFont = obj.fontFamily as string | undefined;
      if (!outerFont) continue;

      // 同样要通过 fabric API，否则 fabric 序列化时会还原为内部存储的旧值
      if (typeof (obj as any).setSelectionStyles === 'function') {
        const text = (obj.text ?? '') as string;
        if (text.length === 0) continue;

        // 只在 styles 中存在与外层不一致的字体时才调 setSelectionStyles
        const styles = (obj as any).styles as
          Array<{ style?: Record<string, unknown> }> | undefined;
        if (!Array.isArray(styles) || styles.length === 0) continue;

        const hasInconsistent = styles.some(
          (r) => r?.style && r.style['fontFamily'] && r.style['fontFamily'] !== outerFont,
        );
        if (hasInconsistent) {
          (obj as any).setSelectionStyles({ fontFamily: outerFont }, 0, text.length);
        }
      }
    }
  }

  /**
   * Serialize to TemplateDocument format (Section 7)
   * This is the proper format for storing, not raw Fabric JSON
   */
  serializeToTemplate(): string {
    const elements: BaseElement[] = [];
    this.elementRegistry.forEach((element) => {
      elements.push(element);
    });

    const template = {
      id: `tpl-${Date.now()}`,
      name: 'Template',
      width: this.canvas?.width ?? 0,
      height: this.canvas?.height ?? 0,
      elements,
    };

    return JSON.stringify(template, null, 2);
  }

  async loadPage(label: Label): Promise<void> {
    if (!this.canvas) {
      return;
    }

    // 将毫米转换为像素
    const widthPx = millimetersToPixels(label.width);
    const heightPx = millimetersToPixels(label.height);

    this.hydrating = true;
    this.canvas.clear();
    this.elementRegistry.clear();
    this.canvas.setDimensions({
      width: widthPx,
      height: heightPx,
    });

    if (label.backgroundImage) {
      await this.applyCanvasImageToCanvas(label.backgroundImage);
    } else {
      this.canvas.backgroundColor = label.backgroundColor;
    }

    if (label.canvasJson) {
      await this.canvas.loadFromJSON(label.canvasJson);

      // Rebuild element registry and extend objects with IDs after loading
      let index = 0;
      this.canvas.forEachObject((object) => {
        const existingId = this.getObjectId(object);
        const id = existingId || `loaded-${Date.now()}-${index++}`;

        // Re-apply barcode/qrcode properties FIRST (before id extension, as it overwrites toObject)
        const elementType = (object as any).elementType;
        if (elementType === 'qrcode' || elementType === 'barcode') {
          this.extendWithCustomProperties(object, {
            elementType,
            bindingValue: (object as any).bindingValue ?? '',
            foregroundColor: (object as any).foregroundColor ?? '#000000',
            backgroundColor: (object as any).backgroundColor ?? '#ffffff',
            errorCorrectionLevel: (object as any).errorCorrectionLevel ?? 'M',
            barcodeFormat: (object as any).barcodeFormat ?? 'CODE128',
            showText: (object as any).showText ?? true,
          });
        }

        // Then apply id extension (preserves id in toObject)
        if (!existingId) {
          this.extend(object, id);
        } else {
          // Re-apply toObject extension for loaded objects (since loadFromJSON recreates objects)
          const originalToObject = object.toObject;
          object.toObject = () => ({
            ...originalToObject.call(object),
            id,
          });
        }

        // Create basic element model for registry
        const element = ElementFactory.fromFabricObject(object, id);
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

  // ============================================================
  // Selection Operations
  // ============================================================

  readSelectionState(): EditorSelectionState {
    const object = this.canvas?.getActiveObject();
    if (!object) {
      return { ...DEFAULT_SELECTION_STATE };
    }

    // Handle multi-selection (ActiveSelection)
    if (object.type?.toLowerCase() === 'activeselection') {
      return {
        ...DEFAULT_SELECTION_STATE,
        id: 'multi-select',
        type: undefined,
      };
    }

    const decorations = [
      object.get('underline') ? 'underline' : '',
      object.get('overline') ? 'overline' : '',
      object.get('linethrough') ? 'line-through' : '',
    ].filter(Boolean);

    const objectType = this.getElementType(object);
    const fabricObj = object as any;
    const effectiveFontSize =
      objectType === 'text'
        ? Math.round(
            ((fabricObj as any).fontSize || DEFAULT_SELECTION_STATE.fontSize) *
              ((fabricObj as any).scaleX || 1),
          )
        : Number(this.getActiveStyle('fontSize') || DEFAULT_SELECTION_STATE.fontSize);
    const baseState = {
      id: this.getObjectId(object),
      type: objectType,
      opacity: Math.round(Number(this.getActiveStyle<number>('opacity') || 1) * 100),
      width: Math.round((object.width || 0) * (object.scaleX || 1)),
      height: Math.round((object.height || 0) * (object.scaleY || 1)),
      fill: String(this.getActiveStyle('fill') || DEFAULT_SELECTION_STATE.fill),
      stroke: String(object.get('stroke') || ''),
      strokeWidth: Number(object.get('strokeWidth') || 0),
      fontSize: effectiveFontSize,
      lineHeight: Number(this.getActiveStyle('lineHeight') || DEFAULT_SELECTION_STATE.lineHeight),
      charSpacing: Number(
        this.getActiveStyle('charSpacing') || DEFAULT_SELECTION_STATE.charSpacing,
      ),
      fontWeight: String(this.getActiveStyle('fontWeight') || ''),
      fontStyle: String(this.getActiveProp('fontStyle') || ''),
      textAlign: this.getActiveProp('textAlign') || DEFAULT_SELECTION_STATE.textAlign,
      fontFamily: this.getActiveProp('fontFamily') || DEFAULT_SELECTION_STATE.fontFamily,
      textDecoration: decorations.join(' '),
    };

    // Add type-specific properties
    switch (objectType) {
      case 'line':
        // Calculate line length from points
        const lineObj = object as any;
        const x1 = lineObj.x1 || 0,
          y1 = lineObj.y1 || 0;
        const x2 = lineObj.x2 || 0,
          y2 = lineObj.y2 || 0;
        const length = Math.round(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2));
        return { ...baseState, length };
    }

    // Add type-specific properties
    switch (objectType) {
      case 'text':
        return {
          ...baseState,
          text: (object as IText).text ?? '',
          color: String(object.get('fill') || '#000000'),
          originY: String(object.get('originY') || 'top'),
        };
      case 'barcode':
        // For FabricImage-based barcode, read properties directly from object
        if (object.type === 'image') {
          return {
            ...baseState,
            // 与 qrcode 分支保持一致：把 bindingValue 暴露为 text，
            // 属性面板 Value 字段（[ngModel]="selectionState().text"）才能显示
            text: (object as any).bindingValue ?? '',
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
            text: (object as any).bindingValue ?? '',
            foregroundColor: (object as any).foregroundColor ?? '#000000',
            backgroundColor: (object as any).backgroundColor ?? '#ffffff',
            errorCorrectionLevel: (object as any).errorCorrectionLevel ?? 'M',
          };
        }
        const qrEl = this.getObjectElement(object) as QRCodeElement | undefined;
        return {
          ...baseState,
          text: qrEl?.value ?? '',
          foregroundColor: qrEl?.foregroundColor ?? '#000000',
          backgroundColor: qrEl?.backgroundColor ?? '#ffffff',
          errorCorrectionLevel: qrEl?.errorCorrectionLevel ?? 'M',
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

  private getObjectElement(object: any): BaseElement | undefined {
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
      id,
    });
  }

  setSelectionOpacity(opacity: number): void {
    this.setActiveStyle('opacity', Number(opacity) / 100);
  }

  setSelectionWidth(width: number): void {
    const object = this.canvas?.getActiveObject();
    if (!object) return;
    const visualWidth = Number(width);
    if ((object as any).type === 'image') {
      // 改 W：当前 obj 视觉宽设为输入值，视觉高保持不变（obj.height × obj.scaleY）。
      // 然后把视觉尺寸整体作为新的 designW/designH，scaleX/Y=1。
      // 这样 elementRegistry.width/height 永远是"用户最新设计尺寸"，
      // PDF 路径用 designW/designH（也就是 obj.width/obj.height）比例渲染，不被拉伸。
      const visualHeight = (object.height || 1) * (object.scaleY || 1);
      object.set({
        width: visualWidth,
        height: visualHeight,
        scaleX: 1,
        scaleY: 1,
      });
      this.updateElementSize(object, visualWidth, visualHeight);
    } else {
      object.set({ width: visualWidth, scaleX: 1 });
    }
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  setSelectionHeight(height: number): void {
    const object = this.canvas?.getActiveObject();
    if (!object) return;
    const visualHeight = Number(height);
    if ((object as any).type === 'image') {
      const visualWidth = (object.width || 1) * (object.scaleX || 1);
      object.set({
        width: visualWidth,
        height: visualHeight,
        scaleX: 1,
        scaleY: 1,
      });
      this.updateElementSize(object, visualWidth, visualHeight);
    } else {
      object.set({ height: visualHeight, scaleY: 1 });
    }
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  /**
   * 把 obj 当前的视觉尺寸同步到 elementRegistry（用户设计字段）。
   * 同步 width/height + x/y，让 PDF 路径按最新设计渲染。
   */
  private updateElementSize(object: any, designW: number, designH: number): void {
    const el = this.getObjectElement(object);
    if (!el) return;
    (el as any).width = designW;
    (el as any).height = designH;
    (el as any).x = object.left;
    (el as any).y = object.top;
  }

  setSelectionLength(length: number): void {
    const object = this.canvas?.getActiveObject();
    if (!object || object.type !== 'line') return;
    const lineObj = object as any;
    const currentLength = Math.sqrt(
      (lineObj.x2 - lineObj.x1) ** 2 + (lineObj.y2 - lineObj.y1) ** 2,
    );
    if (currentLength === 0) return;
    const scale = Number(length) / currentLength;
    const dx = (lineObj.x2 - lineObj.x1) * scale;
    const dy = (lineObj.y2 - lineObj.y1) * scale;
    lineObj.set({ x2: lineObj.x1 + dx, y2: lineObj.y1 + dy });
    this.canvas?.requestRenderAll();
    this.touchRevision();
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
    const object = this.canvas?.getActiveObject();
    if (!object) return;

    // Reset scaleX/scaleY when changing font size directly
    object.set({ fontSize: Number(fontSize), scaleX: 1, scaleY: 1 });
    this.canvas?.requestRenderAll();
    this.touchRevision();
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

  setSelectionVerticalTextAlign(verticalAlign: string): void {
    this.setActiveProp('originY', verticalAlign);
  }

  setSelectionFontFamily(fontFamily: string): void {
    const object = this.canvas?.getActiveObject() as IText | null;
    if (!object) {
      this.setActiveProp('fontFamily', fontFamily);
      return;
    }

    // 1. 改外层 fontFamily
    object.set('fontFamily', fontFamily);

    // 2. 用 fabric 官方 API 改写整个文本的 styles（覆盖 0..text.length 全部字符）
    //    直接改 obj.styles[i].style.fontFamily 不会真正生效，
    //    因为 fabric 内部用 TextStyleDeclaration 维护状态，外部修改 array 元素会被忽略
    if (typeof (object as any).setSelectionStyles === 'function') {
      const text = (object.text ?? '') as string;
      if (text.length > 0) {
        (object as any).setSelectionStyles({ fontFamily }, 0, text.length);
      }
    }

    object.setCoords();
    this.canvas?.requestRenderAll();
    this.touchRevision();
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

  updateBarcodeProperties(format?: string, showText?: boolean, bindingValue?: string): void {
    const object = this.canvas?.getActiveObject();
    if (!object) return;
    const element = this.getObjectElement(object) as BarcodeElement | undefined;
    if (element) {
      if (format) {
        element.format = format as BarcodeElement['format'];
      }
      if (showText) {
        element.showText = showText;
      }

      if (bindingValue) {
        element.value = bindingValue;
      }
    }
    // Also update the Fabric object properties directly for serialization
    if (format) {
      (object as any).barcodeFormat = format;
    }
    if (showText) {
      (object as any).showText = showText;
    }
    if (bindingValue) {
      (object as any).bindingValue = bindingValue;
    }
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  updateQRCodeProperties(
    foregroundColor: string,
    backgroundColor: string,
    errorCorrectionLevel: string,
    bindingValue?: string,
  ): void {
    const object = this.canvas?.getActiveObject();
    if (!object) return;
    const element = this.getObjectElement(object) as QRCodeElement | undefined;
    if (element) {
      element.foregroundColor = foregroundColor;
      element.backgroundColor = backgroundColor;
      element.errorCorrectionLevel = errorCorrectionLevel as QRCodeElement['errorCorrectionLevel'];
      if (bindingValue !== undefined) {
        element.value = bindingValue;
      }
    }
    // Also update the Fabric object properties directly for serialization
    (object as any).foregroundColor = foregroundColor;
    (object as any).backgroundColor = backgroundColor;
    (object as any).errorCorrectionLevel = errorCorrectionLevel;
    if (bindingValue !== undefined) {
      (object as any).bindingValue = bindingValue;
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
    // while preserving their visual position
    objects.forEach((obj) => {
      const currentLeft = obj.left ?? 0;
      const currentTop = obj.top ?? 0;
      const width = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const height = (obj.height ?? 0) * (obj.scaleY ?? 1);

      // Calculate visual left/top based on current origin
      const visualLeft =
        obj.originX === 'center'
          ? currentLeft - width / 2
          : obj.originX === 'right'
            ? currentLeft - width
            : currentLeft;
      const visualTop =
        obj.originY === 'center'
          ? currentTop - height / 2
          : obj.originY === 'bottom'
            ? currentTop - height
            : currentTop;

      obj.set({
        originX: 'left',
        originY: 'top',
        left: visualLeft,
        top: visualTop,
      });
      obj.setCoords();
    });

    // Calculate actual bounds for each object
    const objectData = objects.map((obj) => {
      const left = obj.left ?? 0;
      const top = obj.top ?? 0;
      const width = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const height = (obj.height ?? 0) * (obj.scaleY ?? 1);
      return { obj, left, top, width, height };
    });

    // Calculate bounding extremes from selected objects
    const minLeft = Math.min(...objectData.map((d) => d.left));
    const maxRight = Math.max(...objectData.map((d) => d.left + d.width));
    const minTop = Math.min(...objectData.map((d) => d.top));
    const maxBottom = Math.max(...objectData.map((d) => d.top + d.height));

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
    objects.forEach((obj) => obj.setCoords());
    this.canvas?.requestRenderAll();
    this.touchRevision();
  }

  distributeSelectedObjects(direction: 'horizontal' | 'vertical'): void {
    const objects = this.canvas?.getActiveObjects();
    if (!objects || objects.length < 3) return;

    // Normalize all objects to originX='left' and originY='top' first
    objects.forEach((obj) => {
      const currentLeft = obj.left ?? 0;
      const currentTop = obj.top ?? 0;
      const scaleX = obj.scaleX ?? 1;
      const scaleY = obj.scaleY ?? 1;
      const width = (obj.width ?? 0) * scaleX;
      const height = (obj.height ?? 0) * scaleY;

      // Calculate visual left/top based on current origin
      const visualLeft =
        obj.originX === 'center'
          ? currentLeft - width / 2
          : obj.originX === 'right'
            ? currentLeft - width
            : currentLeft;
      const visualTop =
        obj.originY === 'center'
          ? currentTop - height / 2
          : obj.originY === 'bottom'
            ? currentTop - height
            : currentTop;

      // Set origin to left/top
      obj.set({
        originX: 'left',
        originY: 'top',
      });

      // Keep the same visual position using calculated visual values
      obj.set({
        left: visualLeft,
        top: visualTop,
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
    const objectData: ObjData[] = objects.map((obj) => ({
      obj,
      left: obj.left ?? 0,
      top: obj.top ?? 0,
      width: (obj.width ?? 0) * (obj.scaleX ?? 1),
      height: (obj.height ?? 0) * (obj.scaleY ?? 1),
    }));

    // Sort objects along the axis
    const sorted = [...objectData].sort((a, b) =>
      direction === 'horizontal' ? a.left - b.left : a.top - b.top,
    );

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const firstEdge = direction === 'horizontal' ? first.left : first.top;
    const lastEdge = direction === 'horizontal' ? last.left + last.width : last.top + last.height;
    const totalSpace = lastEdge - firstEdge;
    const totalSize = sorted.reduce(
      (sum, d) => (direction === 'horizontal' ? sum + d.width : sum + d.height),
      0,
    );
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

  isEditingText(): boolean {
    const activeObject = this.canvas?.getActiveObject();
    if (!activeObject) {
      return false;
    }
    // Check if the object is a text-based object that is currently being edited
    return (activeObject as any).isEditing === true;
  }

  // ============================================================
  // Element Registry
  // ============================================================

  getElementById(id: string): BaseElement | undefined {
    return this.elementRegistry.get(id);
  }

  getAllElements(): BaseElement[] {
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
      this.doc.selectElement(null);
      return;
    }

    // Check if this is an ActiveSelection (multi-select)
    const isMultiSelect = object.type?.toLowerCase() === 'activeselection';

    object.set({
      hasRotatingPoint: true,
      transparentCorners: false,
      cornerColor: 'rgba(37, 99, 235, 0.7)',
    });

    if (isMultiSelect) {
      // For multi-selection, set a marker that selection exists
      const dummyElement: LabelElement = {
        type: 'rect',
        id: 'multi-select-marker',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
      this.selected.set(dummyElement as unknown as BaseElement);
      this.textEditorVisible.set(false);
      this.figureEditorVisible.set(false);
      this.doc.selectElement(null);
    } else {
      const id = this.getObjectId(object);
      const element = this.elementRegistry.get(id) ?? null;
      this.selected.set(element);

      // NEW: backfill doc.elements for elements that pre-date the
      // LabelDocumentService refactor (e.g. elements hydrated from a saved
      // template via loadPage). Without this, the central document's
      // `selection` computed returns null and the property panel renders
      // its muted placeholder instead of the element's properties.
      if (element && !this.doc.elements().has(id)) {
        this.doc.addElement(element as LabelElement);
      }

      this.textEditorVisible.set(false);
      this.figureEditorVisible.set(false);

      const type = object.type;
      if (type === 'rect' || type === 'circle' || type === 'triangle' || type === 'line') {
        this.figureEditorVisible.set(true);
      } else if (type === 'i-text' || type === 'textbox') {
        this.textEditorVisible.set(true);
      }

      // Mirror selection into the central document so doc consumers can
      // observe it. The local signals above are kept for the legacy panel
      // (Task 15 migrates them).
      this.doc.selectElement(id || null);
    }
  }

  /**
   * Fabric `object:modified` handler. Writes the new geometry back to the
   * central document so doc consumers (and the doc → fabric effect) stay
   * in sync. ActiveSelection (multi-select) is ignored — it has no single id.
   */
  private handleObjectModified(object: any): void {
    // Delegate the doc-write (and the cycle guard) to the renderer. The
    // renderer flips `syncDirection` to 'fabric-to-doc' across the write
    // and resets it on the way out, suppressing the echo back from the
    // doc → fabric effect.
    const wrote = this.renderer.handleObjectModified(object);
    if (wrote) {
      this.handleSelection(object);
      return;
    }

    if (!object) {
      this.handleSelection(null);
      return;
    }

    // Echoes of doc-driven updates, null, or multi-select: just refresh
    // the selection state without writing to the document.
    this.handleSelection(this.canvas?.getActiveObject() ?? null);
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
        evented: !this.drawingModeEnabled,
      });
    });

    if (this.drawingModeEnabled) {
      this.canvas.discardActiveObject();
      this.handleSelection(null);
    }
  }

  /**
   * Selects and activates a Fabric object right after it has been added to
   * the canvas, triggering selection handlers and editor visibility updates.
   * Used by element render() / add helpers to give the user immediate feedback.
   */
  public selectItemAfterAdded(obj: any): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.discardActiveObject();
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
    this.handleSelection(obj);
  }

  /**
   * Called by element render() methods to attach element id to Fabric object.
   * Delegates to the renderer (single source of truth for serialization helpers).
   */
  protected extend(obj: any, id: string | number): void {
    this.renderer.extend(obj, id);
  }

  /**
   * Attaches custom business properties to a Fabric object and extends
   * its toObject so the custom fields survive serialization. Called by element
   * render() methods via the RenderContext. Used for barcode/qrcode elements
   * and any other element that carries business-specific custom fields.
   * Delegates to the renderer.
   */
  protected extendWithCustomProperties(obj: any, props: Record<string, any>): void {
    this.renderer.extendWithCustomProperties(obj, props);
  }

  /**
   * Generates a small gray placeholder PNG data URL used as the initial image
   * for barcode/qrcode elements before any binding value is rendered. Exposed
   * via RenderContext so elements can call it during render().
   * Delegates to the renderer.
   */
  protected createPlaceholderDataUrl(text: string, w: number, h: number): string {
    return this.renderer.createPlaceholderDataUrl(text, w, h);
  }

  /**
   * Generates a unique element id. Exposed via RenderContext so element
   * render() methods can assign ids without depending on internals.
   * Delegates to the renderer.
   */
  public randomId(): string {
    return this.renderer.randomId();
  }

  private getObjectId(object: any): string {
    return this.renderer.getObjectId(object);
  }

  private getActiveStyle<T = string | number>(styleName: string): T | '' {
    const object = this.canvas?.getActiveObject() as IText | null;
    if (!object) {
      return '';
    }

    if ('getSelectionStyles' in object && object.isEditing) {
      const selectionStyle = object.getSelectionStyles()[0] as
        Record<string, T | undefined> | undefined;
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
          linethrough: value.includes('line-through'),
        });
      }

      object.setSelectionStyles({ [styleName]: value } as never);
      object.setCoords();
    } else {
      if (typeof value === 'string') {
        object.set({
          underline: value.includes('underline'),
          overline: value.includes('overline'),
          linethrough: value.includes('line-through'),
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
      repeat: 'repeat',
    });

    this.canvas.backgroundColor = pattern;
    this.canvas.requestRenderAll();
  }

  private touchRevision(): void {
    if (this.hydrating) {
      return;
    }

    this.revision.update((value) => value + 1);
  }

  /**
   * Compress image and apply as background
   */
  compressAndApplyBackgroundImage(
    dataUrl: string,
    onApplied: (compressedDataUrl: string) => void,
  ): void {
    if (!this.canvas) {
      return;
    }

    this.compressImageDataUrl(dataUrl, 1920).then((compressed) => {
      FabricImage.fromURL(compressed).then((image) => {
        const pattern = new Pattern({
          source: image.getElement(),
          repeat: 'repeat',
        });

        this.canvas!.backgroundColor = pattern;
        this.touchRevision();
        this.canvas!.requestRenderAll();
        onApplied(compressed);
      });
    });
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
    const element = this.renderer.getCanvasElement();
    if (element) {
      element.style.setProperty('--canvas-zoom', String(scale));
    }
    this.canvas?.requestRenderAll();
  }
}
