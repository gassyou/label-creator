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
  OnInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { EditorCanvasService } from './editor-canvas.service';
import {
  LabelTemplate,
  PrintSetting,
  DEFAULT_PRINT_SETTING,
  PAGE_SIZE_PRESETS,
  getPaperSize,
  millimetersToPixels,
  DEFAULT_CANVAS_STATE,
  EditorCanvasState,
  EditorSelectionState,
  EditorTool,
  DEFAULT_SELECTION_STATE,
  getPresetById,
  createCanvasState
} from './models/label.models';
import { EditorPdfService } from './editor-pdf.service';
import { EditorPropertiesPanelComponent } from './editor-properties-panel';
import { EditorTopbarComponent } from './editor-topbar';
import { EditorToolStripComponent } from './editor-tool-strip';
import { TemplateService } from '../template/template.service';

@Component({
  selector: 'app-editor',
  imports: [FormsModule, EditorPropertiesPanelComponent, EditorTopbarComponent, EditorToolStripComponent],
  providers: [EditorCanvasService, EditorPdfService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor.html',
  styleUrl: './editor.scss'
})
export class EditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('htmlCanvas', { static: true }) htmlCanvas!: ElementRef<HTMLCanvasElement>;

  readonly canvasService = inject(EditorCanvasService);
  private readonly pdfService = inject(EditorPdfService);
  private readonly templateService = inject(TemplateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);

  readonly activeTool = signal<EditorTool>('select');
  readonly canvasState = signal<EditorCanvasState>(DEFAULT_CANVAS_STATE);
  readonly selectionState = signal<EditorSelectionState>({ ...DEFAULT_SELECTION_STATE });
  readonly templateName = signal('未命名');
  readonly isDirty = signal(false);
  readonly printSettingVisible = signal(false);

  /** Current editing template ID, null for new */
  private templateId: string | null = null;

  readonly pageSizePresets = PAGE_SIZE_PRESETS;
  readonly propsPanelVisible = computed(() => !!this.selectionState().id);
  readonly hasSelection = computed(() => !!this.selectionState().id);
  readonly textEditorVisible = this.canvasService.textEditorVisible.asReadonly();
  readonly figureEditorVisible = this.canvasService.figureEditorVisible.asReadonly();
  readonly jsonPreview = this.canvasService.jsonPreview.asReadonly();

  /** Single-page template signal */
  readonly template = signal<LabelTemplate>({
    id: '',
    name: '未命名',
    width: 210,
    height: 297,
    backgroundColor: '#ffffff',
    canvasJson: '',
    printSetting: { ...DEFAULT_PRINT_SETTING }
  });

  textString = '';
  private hasCanvasInitialized = false;

  constructor() {
    effect(() => {
      const selected = this.canvasService.selected();
      this.selectionState.set(
        selected ? this.canvasService.readSelectionState() : { ...DEFAULT_SELECTION_STATE }
      );
    });

    effect(() => {
      const revision = this.canvasService.revision();
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
    this.canvasService.initialize(this.htmlCanvas.nativeElement, this.canvasState());
    this.hasCanvasInitialized = true;

    // Load template after canvas is initialized
    if (this.templateId) {
      this.loadTemplate(this.templateId);
    }
  }

  ngOnDestroy(): void {
    this.canvasService.destroy();
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
      this.canvasService.copySelected();
      return;
    }

    if (modifier && event.key === 'v') {
      event.preventDefault();
      this.canvasService.pasteClipboard();
      return;
    }

    if (modifier && event.key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.canvasService.redo();
      } else {
        this.canvasService.undo();
      }
      return;
    }

    if (modifier && event.key === 'y') {
      event.preventDefault();
      this.canvasService.redo();
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
      this.removeSelected();
      return;
    }
  }

  activateTool(tool: EditorTool): void {
    this.activeTool.set(tool);

    switch (tool) {
      case 'select':
        this.canvasService.clearSelection();
        return;
      case 'text':
        this.canvasService.addText(this.textString);
        this.textString = 'Text';
        return;
      case 'square':
      case 'circle':
      case 'triangle':
      case 'line':
        this.canvasService.addShape(tool);
        return;
      case 'qrcode':
        this.canvasService.addQRCode();
        return;
      case 'barcode':
        this.canvasService.addBarcode('CODE128');
        return;
    }
  }

  updateCanvasFill(backgroundColor: string): void {
    this.canvasState.update((state) => ({ ...state, backgroundColor }));
    this.canvasService.applyCanvasFill(backgroundColor, this.canvasState().backgroundImage || '');
  }

  updateCanvasImage(backgroundImage: string): void {
    this.canvasState.update((state) => ({ ...state, backgroundImage }));
  }

  applyCanvasImage(): void {
    this.canvasService.applyCanvasImage(this.canvasState().backgroundImage || '', () => {
      this.isDirty.set(true);
    });
  }

  updateSelectionId(id: string): void {
    this.selectionState.update((state) => ({ ...state, id }));
    this.canvasService.updateSelectionId(id);
  }

  updateSelectionOpacity(opacity: number): void {
    this.selectionState.update((state) => ({ ...state, opacity: Number(opacity) }));
    this.canvasService.setSelectionOpacity(opacity);
  }

  updateSelectionFill(fill: string): void {
    this.selectionState.update((state) => ({ ...state, fill }));
    this.canvasService.setSelectionFill(fill);
  }

  updateSelectionStroke(stroke: string): void {
    this.selectionState.update((state) => ({ ...state, stroke }));
    this.canvasService.setSelectionStroke(stroke);
  }

  updateSelectionStrokeWidth(strokeWidth: number): void {
    this.selectionState.update((state) => ({ ...state, strokeWidth: Number(strokeWidth) }));
    this.canvasService.setSelectionStrokeWidth(strokeWidth);
  }

  updateSelectionColor(color: string): void {
    this.selectionState.update((state) => ({ ...state, color }));
    this.canvasService.setSelectionColor(color);
  }

  updateSelectionText(text: string): void {
    this.selectionState.update((state) => ({ ...state, text }));
  }

  updateBinding(binding: string): void {
    this.selectionState.update((state) => ({ ...state, binding }));
  }

  updateBarcodeFormat(format: string): void {
    this.selectionState.update((state) => ({ ...state, barcodeFormat: format as any }));
    this.canvasService.updateBarcodeProperties(format, this.selectionState().showText ?? true);
  }

  updateBarcodeShowText(showText: boolean): void {
    this.selectionState.update((state) => ({ ...state, showText }));
    this.canvasService.updateBarcodeProperties(this.selectionState().barcodeFormat ?? 'CODE128', showText);
  }

  updateErrorCorrectionLevel(level: string): void {
    this.selectionState.update((state) => ({ ...state, errorCorrectionLevel: level as any }));
    this.canvasService.updateQRCodeProperties(
      this.selectionState().foregroundColor ?? '#000000',
      this.selectionState().backgroundColor ?? '#ffffff',
      level
    );
  }

  updateForegroundColor(color: string): void {
    this.selectionState.update((state) => ({ ...state, foregroundColor: color }));
    this.canvasService.updateQRCodeProperties(
      color,
      this.selectionState().backgroundColor ?? '#ffffff',
      this.selectionState().errorCorrectionLevel ?? 'M'
    );
  }

  updateBackgroundColor(color: string): void {
    this.selectionState.update((state) => ({ ...state, backgroundColor: color }));
    this.canvasService.updateQRCodeProperties(
      this.selectionState().foregroundColor ?? '#000000',
      color,
      this.selectionState().errorCorrectionLevel ?? 'M'
    );
  }

  alignObjects(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    this.canvasService.alignSelectedObjects(direction);
  }

  distributeObjects(direction: 'horizontal' | 'vertical'): void {
    this.canvasService.distributeSelectedObjects(direction);
  }

  hasMultiSelection(): boolean {
    return this.canvasService.hasMultiSelection();
  }

  updateSelectionFontFamily(fontFamily: string): void {
    this.selectionState.update((state) => ({ ...state, fontFamily }));
    this.canvasService.setSelectionFontFamily(fontFamily);
  }

  updateSelectionTextAlign(textAlign: string): void {
    this.selectionState.update((state) => ({ ...state, textAlign }));
    this.canvasService.setSelectionTextAlign(textAlign);
  }

  toggleBold(): void {
    const fontWeight = this.selectionState().fontWeight ? '' : 'bold';
    this.selectionState.update((state) => ({ ...state, fontWeight }));
    this.canvasService.setSelectionFontWeight(fontWeight);
  }

  toggleItalic(): void {
    const fontStyle = this.selectionState().fontStyle ? '' : 'italic';
    this.selectionState.update((state) => ({ ...state, fontStyle }));
    this.canvasService.setSelectionFontStyle(fontStyle);
  }

  toggleTextDecoration(value: string): void {
    const current = (this.selectionState().textDecoration || '')
      .split(' ')
      .map((item) => item.trim())
      .filter(Boolean);
    const textDecoration = current.includes(value)
      ? current.filter((item) => item !== value).join(' ')
      : [...current, value].join(' ');

    this.selectionState.update((state) => ({ ...state, textDecoration }));
    this.canvasService.setSelectionTextDecoration(textDecoration);
  }

  updateSelectionFontSize(fontSize: number): void {
    this.selectionState.update((state) => ({ ...state, fontSize: Number(fontSize) }));
    this.canvasService.setSelectionFontSize(fontSize);
  }

  updateSelectionLineHeight(lineHeight: number): void {
    this.selectionState.update((state) => ({ ...state, lineHeight: Number(lineHeight) }));
    this.canvasService.setSelectionLineHeight(lineHeight);
  }

  updateSelectionCharSpacing(charSpacing: number): void {
    this.selectionState.update((state) => ({ ...state, charSpacing: Number(charSpacing) }));
    this.canvasService.setSelectionCharSpacing(charSpacing);
  }

  cloneSelection(): void {
    this.canvasService.cloneSelected();
  }

  bringSelectionToFront(): void {
    this.canvasService.bringSelectionToFront();
  }

  sendSelectionToBack(): void {
    this.canvasService.sendSelectionToBack();
  }

  clearSelection(): void {
    this.canvasService.clearSelection();
  }

  removeSelected(): void {
    this.canvasService.removeSelected();
    this.selectionState.set({ ...DEFAULT_SELECTION_STATE });
  }

  /**
   * 保存模板到存储
   */
  saveToTemplate(): void {
    const labelTemplate = this.buildLabelTemplate();
    const name = this.templateName() || `模板 ${new Date().toLocaleString()}`;

    this.templateService.saveTemplate(name, labelTemplate, undefined, this.templateId ?? undefined).subscribe({
      next: (template) => {
        this.templateId = template.id;
        this.isDirty.set(false);
        this.message.success('保存成功');
      },
      error: () => this.message.error('保存失败')
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
        const labelTemplate = template.document as LabelTemplate;
        this.template.set(labelTemplate);
        const widthMm = labelTemplate.width || 210;
        const heightMm = labelTemplate.height || 297;
        this.canvasState.set({
          width: millimetersToPixels(widthMm),
          height: millimetersToPixels(heightMm),
          backgroundColor: labelTemplate.backgroundColor || '#ffffff',
          backgroundImage: labelTemplate.backgroundImage
        });
        if (labelTemplate.canvasJson) {
          await this.canvasService.loadPage({
            id: 'loaded-page',
            name: 'Loaded Page',
            widthMm,
            heightMm,
            backgroundColor: labelTemplate.backgroundColor || '#ffffff',
            backgroundImage: labelTemplate.backgroundImage,
            canvasState: this.canvasState(),
            canvasJson: labelTemplate.canvasJson
          });
        }
      },
      error: () => this.message.error('加载模板失败')
    });
  }

  updateTemplateName(name: string): void {
    this.templateName.set(name || '未命名');
  }

  private buildLabelTemplate(): LabelTemplate {
    return {
      id: this.templateId || `tpl-${Date.now()}`,
      name: this.templateName(),
      width: Math.round(this.canvasState().width / (96 / 25.4)),
      height: Math.round(this.canvasState().height / (96 / 25.4)),
      backgroundColor: this.canvasState().backgroundColor,
      backgroundImage: this.canvasState().backgroundImage,
      canvasJson: this.canvasService.serializeCanvas(),
      printSetting: this.template().printSetting
    };
  }

  saveCanvasToJSON(): void {
    localStorage.setItem('KanvasDocument', JSON.stringify(this.buildLabelTemplate()));
  }

  async loadCanvasFromJSON(): Promise<void> {
    const saved = localStorage.getItem('KanvasDocument');
    if (!saved) {
      return;
    }

    const labelTemplate = JSON.parse(saved) as LabelTemplate;
    this.template.set(labelTemplate);
    const widthMm = labelTemplate.width || 210;
    const heightMm = labelTemplate.height || 297;
    this.canvasState.set({
      width: millimetersToPixels(widthMm),
      height: millimetersToPixels(heightMm),
      backgroundColor: labelTemplate.backgroundColor || '#ffffff',
      backgroundImage: labelTemplate.backgroundImage
    });
    if (labelTemplate.canvasJson) {
      await this.canvasService.loadPage({
        id: 'loaded-page',
        name: 'Loaded Page',
        widthMm,
        heightMm,
        backgroundColor: labelTemplate.backgroundColor || '#ffffff',
        backgroundImage: labelTemplate.backgroundImage,
        canvasState: this.canvasState(),
        canvasJson: labelTemplate.canvasJson
      });
    }
  }

  rasterize(): void {
    this.canvasService.exportPng();
  }

  rasterizeSVG(): void {
    this.canvasService.exportSvg();
  }

  zoomIn(): void {
    this.canvasService.zoomIn();
  }

  zoomOut(): void {
    this.canvasService.zoomOut();
  }

  async exportPdf(): Promise<void> {
    const labelTemplate = this.buildLabelTemplate();
    const widthMm = labelTemplate.width;
    const heightMm = labelTemplate.height;
    await this.pdfService.exportDocument([{
      id: 'export-page',
      name: 'Export Page',
      widthMm,
      heightMm,
      backgroundColor: labelTemplate.backgroundColor,
      backgroundImage: labelTemplate.backgroundImage,
      canvasState: this.canvasState(),
      canvasJson: labelTemplate.canvasJson
    }], 'label-document.pdf');
  }

  openPrintSettingDialog(): void {
    this.printSettingVisible.set(true);
  }
}
