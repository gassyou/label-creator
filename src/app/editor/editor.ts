import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { EditorTool } from './models/editor.models';
import { PropertiesPanelComponent } from './properties/properties-panel.component';
import { EditorTopbarComponent } from './editor-topbar';
import { EditorToolStripComponent } from './editor-tool-strip';
import { PrintSettingDialogComponent } from './dialogs/print-setting-dialog/print-setting-dialog';
import { TemplateService } from '../template/template.service';
import { LabelGeneratorService } from '../print/label-generator.service';
import {
  PrintSetting,
  DEFAULT_PRINT_SETTING,
  LabelTemplate,
  Label,
  millimetersToPixels,
  PAGE_SIZE_PRESETS,
} from './models/label.models';
import { webFontLoader } from '../print/generators/web-font-loader';
import { LabelDocumentService } from './document';
import { OperationsService } from './editor/operations.service';
import { SelectionService } from './editor/selection.service';
import { UndoRedoService } from './editor/undo-redo.service';
import { FabricRenderer } from './render/fabric-renderer';
import { LabelConverter } from './persistence/label-converter';

@Component({
  selector: 'app-editor',
  imports: [
    FormsModule,
    PropertiesPanelComponent,
    EditorTopbarComponent,
    EditorToolStripComponent,
    PrintSettingDialogComponent,
  ],
  providers: [LabelDocumentService, OperationsService, SelectionService, UndoRedoService, FabricRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class EditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('htmlCanvas', { static: true }) htmlCanvas!: ElementRef<HTMLCanvasElement>;

  /**
   * Editor-layer dependencies. Injected directly — the legacy
   * `EditorCanvasService` facade was removed in Phase 10. Each service
   * owns a single concern:
   *
   *   - `FabricRenderer` — Fabric canvas lifecycle, doc → fabric reconcile,
   *     revision signal, JSON projection.
   *   - `OperationsService` — element creation / deletion / alignment /
   *     z-order / clipboard. Builds the `EditorCommandContext` for each
   *     command.
   *   - `SelectionService` — Fabric-event → selection-state signals.
   *   - `UndoRedoService` — snapshot stacks + the command-execution
   *     wrapper.
   */
  private readonly operations = inject(OperationsService);
  private readonly selection = inject(SelectionService);
  private readonly undoRedo = inject(UndoRedoService);
  private readonly renderer = inject(FabricRenderer);
  private readonly templateService = inject(TemplateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);
  private readonly labelGeneratorService = inject(LabelGeneratorService);
  private readonly doc = inject(LabelDocumentService);

  readonly activeTool = signal<EditorTool>('select');
  readonly templateName = signal('未命名');
  readonly isDirty = signal(false);
  readonly printSettingVisible = signal(false);

  /** Current editing template ID, null for new */
  private templateId: string | null = null;

  readonly pageSizePresets = PAGE_SIZE_PRESETS;
  readonly hasSelection = computed(
    () => this.selection.hasSelection() || this.selection.hasMultiSelection(),
  );

  /** Single-page template signal */
  readonly template = signal<LabelTemplate>({
    id: '',
    name: '未命名',
    label: {
      id: '',
      width: 210,
      height: 297,
      backgroundColor: '#ffffff',
      canvasJson: '',
    },
    printSetting: { ...DEFAULT_PRINT_SETTING },
  });

  /** Canvas state derived from template (px) - auto-synced with template */
  readonly canvasState = computed(() => {
    const t = this.template();
    // Defensive: handle both old flat structure and new nested structure
    const label = t?.label ?? {
      width: 210,
      height: 297,
      backgroundColor: '#ffffff',
      backgroundImage: '',
    };
    return {
      width: millimetersToPixels(label.width ?? 210),
      height: millimetersToPixels(label.height ?? 297),
      backgroundColor: label.backgroundColor ?? '#ffffff',
      backgroundImage: label.backgroundImage || '',
    };
  });

  textString = '';
  private hasCanvasInitialized = false;

  constructor() {
    effect(() => {
      const revision = this.renderer.revision();
      if (!this.hasCanvasInitialized) {
        return;
      }

      untracked(() => {
        this.isDirty.set(true);
      });
    });
  }

  ngOnInit(): void {
    // Check route for template ID
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.templateId = id;
    }
  }

  ngAfterViewInit(): void {
    // 字体先行：先把 Liberation Sans / Noto Sans SC 加载到 document.fonts，
    // 这样 Fabric 在 loadFromJSON 排版文字时就能用上正确字体，
    // 不会回退到系统默认导致设计与 PDF 不一致。
    // 失败不阻塞（设计器仍可用，只是字体回退到系统默认）
    void webFontLoader.ensureLoaded().catch((err) => {
      console.warn('[Editor] Print fonts failed to load, falling back to system fonts:', err);
    });

    this.initializeCanvas(this.htmlCanvas.nativeElement, this.canvasState());
    this.hasCanvasInitialized = true;

    // [DEBUG] 注册调试入口到 window，方便控制台调用
    (window as any).debugDownloadQrImages = () => this.debugDownloadQrImages();
    console.info('[Editor] 调试入口已注册：await window.debugDownloadQrImages()');

    // Load template after canvas is initialized
    if (this.templateId) {
      this.loadTemplate(this.templateId);
    }
  }

  ngOnDestroy(): void {
    this.destroyCanvas();
  }

  /**
   * Builds the Fabric canvas, wires editor-layer Fabric events, and
   * hands the canvas to the UndoRedoService. Replaces the legacy
   * `EditorCanvasService.initialize()`.
   */
  private initializeCanvas(
    element: HTMLCanvasElement,
    canvasState: {
      width: number;
      height: number;
      backgroundColor: string;
      backgroundImage?: string;
    },
  ): void {
    this.renderer.initialize(element, canvasState, {
      onSelectionCreated: (obj) => this.selection.handleFabricSelection(obj),
      onSelectionUpdated: (obj) => this.selection.handleFabricSelection(obj),
      onSelectionCleared: () => this.selection.handleFabricSelection(null),
      onObjectAdded: () => this.renderer.touchRevision(),
      onObjectModified: (obj) => this.selection.handleFabricModification(obj),
      onObjectRemoved: () => this.renderer.touchRevision(),
      onTextChanged: (obj) => this.selection.handleFabricSelection(obj),
    });
    this.undoRedo.setCanvas(this.renderer.getCanvas());
  }

  /**
   * Tears down the Fabric canvas and clears the editor-layer state.
   * Replaces the legacy `EditorCanvasService.destroy()`.
   */
  private destroyCanvas(): void {
    this.undoRedo.reset();
    this.undoRedo.setCanvas(null);
    this.renderer.dispose();
    this.doc.setElements(new Map());
    this.selection.handleFabricSelection(null);
  }

  /**
   * Loads a saved LabelDocument into the editor. Wipes the canvas,
   * rehydrates dimensions, applies the background image / color, and
   * restores the Fabric JSON (rebuilding the central document alongside).
   * Replaces the legacy `EditorCanvasService.loadPage()`.
   */
  private async loadPage(label: Label): Promise<void> {
    const canvas = this.renderer.getCanvas();
    if (!canvas) return;

    const widthPx = millimetersToPixels(label.width);
    const heightPx = millimetersToPixels(label.height);

    this.renderer.setHydrating(true);
    canvas.clear();
    this.doc.setElements(new Map());
    canvas.setDimensions({ width: widthPx, height: heightPx });

    if (label.backgroundImage) {
      await this.applyBackgroundImage(label.backgroundImage);
    } else {
      canvas.backgroundColor = label.backgroundColor;
    }

    if (label.canvasJson) {
      await canvas.loadFromJSON(label.canvasJson);
      let index = 0;
      canvas.forEachObject((object) => {
        const existingId = this.renderer.getObjectId(object);
        const id = existingId || `loaded-${Date.now()}-${index++}`;
        const elementType = (object as any).elementType;
        if (elementType === 'qrcode' || elementType === 'barcode') {
          this.renderer.extendWithCustomProperties(object, {
            elementType,
            bindingValue: (object as any).bindingValue ?? '',
            foregroundColor: (object as any).foregroundColor ?? '#000000',
            backgroundColor: (object as any).backgroundColor ?? '#ffffff',
            errorCorrectionLevel: (object as any).errorCorrectionLevel ?? 'M',
            barcodeFormat: (object as any).barcodeFormat ?? 'CODE128',
            showText: (object as any).showText ?? true,
          });
        }
        if (!existingId) {
          this.renderer.extend(object, id);
        } else {
          const originalToObject = object.toObject;
          object.toObject = () => ({
            ...originalToObject.call(object),
            id,
          });
        }
      });
    }

    canvas.discardActiveObject();
    this.selection.handleFabricSelection(null);
    this.renderer.setHydrating(false);
    this.renderer.touchRevision();
    canvas.requestRenderAll();
  }

  /** Applies a background image (data URL) to the Fabric canvas. */
  private async applyBackgroundImage(backgroundImage: string): Promise<void> {
    const canvas = this.renderer.getCanvas();
    if (!canvas || !backgroundImage) return;
    const { FabricImage, Pattern } = await import('fabric');
    const image = await FabricImage.fromURL(backgroundImage);
    const pattern = new Pattern({ source: image.getElement(), repeat: 'repeat' });
    canvas.backgroundColor = pattern;
    canvas.requestRenderAll();
  }

  /** Returns the Fabric canvas's JSON projection as a string for saving.
   *  Replaces the legacy `EditorCanvasService.serializeCanvas()`. */
  private serializeCanvas(): string {
    const json = this.renderer.toCanvasJson();
    if (!json) return '';
    // Normalize font-family on text objects before serialization so
    // PDF rendering doesn't fall back to the wrong font.
    this.normalizeTextStylesFontFamily();
    return JSON.stringify(json);
  }

  /**
   * Pre-save normalization: force every text-object styles entry's
   * `fontFamily` to the object's outer `fontFamily` so stale per-char
   * fonts (e.g. Arial) don't override the design's chosen font.
   */
  private normalizeTextStylesFontFamily(): void {
    const canvas = this.renderer.getCanvas();
    if (!canvas) return;
    for (const obj of canvas.getObjects() as any[]) {
      if (!obj || (obj.type !== 'text' && obj.type !== 'i-text' && obj.type !== 'textbox')) {
        continue;
      }
      const outerFont = obj.fontFamily as string | undefined;
      if (!outerFont) continue;
      if (typeof obj.setSelectionStyles === 'function') {
        const text = (obj.text ?? '') as string;
        if (text.length === 0) continue;
        const styles = obj.styles as Array<{ style?: Record<string, unknown> }> | undefined;
        if (!Array.isArray(styles) || styles.length === 0) continue;
        const hasInconsistent = styles.some(
          (r) => r?.style && r.style['fontFamily'] && r.style['fontFamily'] !== outerFont,
        );
        if (hasInconsistent) {
          obj.setSelectionStyles({ fontFamily: outerFont }, 0, text.length);
        }
      }
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? event.metaKey : event.ctrlKey;

    if (modifier && event.key === 's') {
      event.preventDefault();
      this.saveToTemplate();
      return;
    }

    if (modifier && event.key === 'c') {
      event.preventDefault();
      this.operations.copySelected();
      return;
    }

    if (modifier && event.key === 'v') {
      // 如果用户正在编辑文本框内的内容，让 Fabric.js 处理粘贴
      if (this.isEditingText()) {
        return;
      }
      event.preventDefault();
      this.operations.pasteClipboard();
      return;
    }

    if (modifier && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) {
        void this.undoRedo.redo();
      } else {
        void this.undoRedo.undo();
      }
      return;
    }

    if (modifier && event.key === 'y') {
      event.preventDefault();
      void this.undoRedo.redo();
      return;
    }

    // Delete key - remove selected elements
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Don't trigger if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      event.preventDefault();
      void this.operations.deleteSelected();
      return;
    }
  }

  activateTool(tool: EditorTool): void {
    this.activeTool.set(tool);

    switch (tool) {
      case 'select':
        this.renderer.getCanvas()?.discardActiveObject();
        this.renderer.getCanvas()?.requestRenderAll();
        return;
      case 'text':
        void this.operations.addText(this.textString);
        this.textString = 'Text';
        return;
      case 'square':
      case 'circle':
      case 'triangle':
      case 'line':
        void this.operations.addShape(tool);
        return;
      case 'qrcode':
        void this.operations.addQRCode();
        return;
      case 'barcode':
        void this.operations.addBarcode('CODE128');
        return;
    }
  }

  alignObjects(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    this.operations.alignSelectedObjects(direction);
  }

  distributeObjects(direction: 'horizontal' | 'vertical'): void {
    this.operations.distributeSelectedObjects(direction);
  }

  undo(): void {
    void this.undoRedo.undo();
  }

  redo(): void {
    void this.undoRedo.redo();
  }

  hasMultiSelection(): boolean {
    return this.selection.hasMultiSelection();
  }

  cloneSelection(): void {
    this.operations.cloneSelected();
  }

  bringSelectionToFront(): void {
    this.operations.bringSelectionToFront();
  }

  sendSelectionToBack(): void {
    this.operations.sendSelectionToBack();
  }

  /**
   * 保存模板到存储
   */
  saveToTemplate(): void {
    const labelTemplate = this.buildLabelTemplate();
    const name = this.templateName() || `模板 ${new Date().toLocaleString()}`;

    this.templateService
      .saveTemplate(name, labelTemplate, undefined, this.templateId ?? undefined)
      .subscribe({
        next: (template) => {
          this.isDirty.set(false);
          this.message.success('保存成功');
        },
        error: () => this.message.error('保存失败'),
      });
  }

  /**
   * 返回列表页
   */
  backToList(): void {
    this.router.navigate(['/']);
  }

  /**
   * 加载模板到编辑器
   */
  private async loadTemplate(id: string): Promise<void> {
    this.templateService.getTemplate(id).subscribe({
      next: async (template) => {
        if (!template) {
          this.message.error('模板不存在');
          return;
        }
        this.templateName.set(template.name || '未命名');
        const labelTemplate = template as unknown as LabelTemplate;
        // Ensure printSetting has default values for missing properties
        const printSetting = {
          ...DEFAULT_PRINT_SETTING,
          ...labelTemplate.printSetting,
        };
        this.template.set({ ...labelTemplate, printSetting });
        if (labelTemplate.label?.canvasJson) {
          await this.loadPage(labelTemplate.label);
        }
      },
      error: () => this.message.error('加载模板失败'),
    });
  }

  updateTemplateName(name: string): void {
    this.templateName.set(name || '未命名');
  }

  /**
   * [DEBUG] 提取当前模板里所有 QR 码图片，下载为独立 PNG
   * 用于对比"二维码图片本身"和"PDF 里的二维码"是否一致
   *
   * 不经过 Fabric 渲染，直接从 JSON 拿原始 src 下载。
   * 打开浏览器控制台调用：await window.debugDownloadQrImages()
   */
  private async debugDownloadQrImages(): Promise<void> {
    const current = this.template();
    const label = current?.label;
    if (!label?.canvasJson) {
      console.error('[debugDownloadQrImages] 当前模板没有 canvasJson');
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(label.canvasJson);
    } catch (e) {
      console.error('[debugDownloadQrImages] canvasJson 解析失败:', e);
      return;
    }
    const qrs: any[] = (parsed.objects || []).filter((o: any) => o.elementType === 'qrcode');
    console.log(`[debugDownloadQrImages] 在 canvasJson 里找到 ${qrs.length} 个 QR 码`);

    for (let i = 0; i < qrs.length; i++) {
      const qr = qrs[i];
      const src: string | undefined = qr.src;
      if (!src) {
        console.warn(`[debugDownloadQrImages] QR #${i + 1} 没有 src`);
        continue;
      }

      try {
        const a = document.createElement('a');
        a.href = src;
        a.download = `qr-original-${i + 1}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log(
          `[debugDownloadQrImages] 已下载原始 PNG: qr-original-${i + 1}.png（来源：JSON.src，未经任何处理）`,
        );
      } catch (e) {
        console.error(`[debugDownloadQrImages] 下载 QR #${i + 1} 失败:`, e);
      }
    }
  }

  private buildLabelTemplate(): LabelTemplate {
    // Page fields come from the live `LabelDocumentService.page()` signal so
    // edits made via PagePropertiesComponent (which writes only to the doc)
    // are reflected on save. `canvasJson` comes from the Fabric canvas.
    // The conversion lives in `LabelConverter` (persistence layer).
    return LabelConverter.buildLabelTemplate(
      this.doc.page(),
      this.serializeCanvas(),
      this.templateId,
      this.templateName(),
      this.template().printSetting,
    );
  }

  saveCanvasToJSON(): void {
    localStorage.setItem('KanvasDocument', JSON.stringify(this.buildLabelTemplate()));
  }

  async loadCanvasFromJSON(): Promise<void> {
    const saved = localStorage.getItem('KanvasDocument');
    if (!saved) {
      return;
    }

    try {
      const labelTemplate = JSON.parse(saved) as LabelTemplate;
      // Ensure printSetting has default values for missing properties
      const printSetting = {
        ...DEFAULT_PRINT_SETTING,
        ...labelTemplate.printSetting,
      };
      this.template.set({ ...labelTemplate, printSetting });
      if (labelTemplate.label.canvasJson) {
        await this.loadPage(labelTemplate.label);
      }
    } catch (e) {
      console.error('Failed to load canvas from JSON:', e);
    }
  }

  rasterize(): void {
    const label = this.buildLabelTemplate().label;
    this.labelGeneratorService.generateSinglePng(label).then((blob) => {
      this.labelGeneratorService.download(blob, 'label.png');
    });
  }

  rasterizeSVG(): void {
    const label = this.buildLabelTemplate().label;
    this.labelGeneratorService.generateSingleSvg(label).then((svg) => {
      this.labelGeneratorService.downloadSvg(svg, 'label.svg');
    });
  }

  zoomIn(): void {
    const newZoom = Math.min(this.zoom() + 0.1, 3);
    this.setZoom(newZoom);
  }

  zoomOut(): void {
    const newZoom = Math.max(this.zoom() - 0.1, 0.3);
    this.setZoom(newZoom);
  }

  /** Current zoom factor (1 = 100%). */
  readonly zoom = signal(1);

  private setZoom(scale: number): void {
    this.zoom.set(scale);
    const element = this.renderer.getCanvasElement();
    if (element) {
      element.style.setProperty('--canvas-zoom', String(scale));
    }
    this.renderer.getCanvas()?.requestRenderAll();
  }

  /** True if a text object is currently in Fabric's edit mode. Used by the
   *  Ctrl+V keyboard handler to let Fabric handle paste inside text boxes. */
  private isEditingText(): boolean {
    const activeObject = this.renderer.getCanvas()?.getActiveObject();
    if (!activeObject) return false;
    return (activeObject as any).isEditing === true;
  }

  async exportPdf(): Promise<void> {
    const labelTemplate = this.buildLabelTemplate();
    const labelData: Label = {
      id: labelTemplate.label.id,
      width: labelTemplate.label.width,
      height: labelTemplate.label.height,
      backgroundColor: labelTemplate.label.backgroundColor,
      backgroundImage: labelTemplate.label.backgroundImage,
      canvasJson: labelTemplate.label.canvasJson,
    };

    const blob = await this.labelGeneratorService.generateSinglePdf(labelData);
    this.labelGeneratorService.download(blob, 'label-document.pdf');
  }

  openPrintSettingDialog(): void {
    this.printSettingVisible.set(true);
  }

  updatePrintSetting(printSetting: PrintSetting): void {
    this.template.update((t) => ({
      ...t,
      printSetting: { ...printSetting },
    }));
  }
}
