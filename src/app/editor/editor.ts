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
import { EditorCanvasService } from './editor-canvas.service';
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
  pixelsToMillimeters,
} from './models/label.models';
import { webFontLoader } from '../print/generators/web-font-loader';
import { LabelDocumentService } from './document';

@Component({
  selector: 'app-editor',
  imports: [
    FormsModule,
    PropertiesPanelComponent,
    EditorTopbarComponent,
    EditorToolStripComponent,
    PrintSettingDialogComponent,
  ],
  providers: [EditorCanvasService, LabelDocumentService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class EditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('htmlCanvas', { static: true }) htmlCanvas!: ElementRef<HTMLCanvasElement>;

  readonly canvasService = inject(EditorCanvasService);
  private readonly templateService = inject(TemplateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);
  private readonly labelGeneratorService = inject(LabelGeneratorService);

  readonly activeTool = signal<EditorTool>('select');
  readonly templateName = signal('未命名');
  readonly isDirty = signal(false);
  readonly printSettingVisible = signal(false);

  /** Current editing template ID, null for new */
  private templateId: string | null = null;

  readonly pageSizePresets = PAGE_SIZE_PRESETS;
  readonly hasSelection = computed(
    () => this.canvasService.hasSelection() || this.canvasService.hasMultiSelection(),
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
    // 字体先行：先把 Liberation Sans / Noto Sans SC 加载到 document.fonts，
    // 这样 Fabric 在 loadFromJSON 排版文字时就能用上正确字体，
    // 不会回退到系统默认导致设计与 PDF 不一致。
    // 失败不阻塞（设计器仍可用，只是字体回退到系统默认）
    void webFontLoader.ensureLoaded().catch((err) => {
      console.warn('[Editor] Print fonts failed to load, falling back to system fonts:', err);
    });

    this.canvasService.initialize(this.htmlCanvas.nativeElement, this.canvasState());
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
      // 如果用户正在编辑文本框内的内容，让 Fabric.js 处理粘贴
      if (this.canvasService.isEditingText()) {
        return;
      }
      event.preventDefault();
      this.canvasService.pasteClipboard();
      return;
    }

    if (modifier && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) {
        void this.canvasService.redo();
      } else {
        void this.canvasService.undo();
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
      void this.canvasService.deleteSelected();
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
        void this.canvasService.addText(this.textString);
        this.textString = 'Text';
        return;
      case 'square':
      case 'circle':
      case 'triangle':
      case 'line':
        void this.canvasService.addShape(tool);
        return;
      case 'qrcode':
        void this.canvasService.addQRCode();
        return;
      case 'barcode':
        void this.canvasService.addBarcode('CODE128');
        return;
    }
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

  cloneSelection(): void {
    this.canvasService.cloneSelected();
  }

  bringSelectionToFront(): void {
    this.canvasService.bringSelectionToFront();
  }

  sendSelectionToBack(): void {
    this.canvasService.sendSelectionToBack();
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
          await this.canvasService.loadPage(labelTemplate.label);
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
    return {
      id: this.templateId || undefined,
      name: this.templateName(),
      label: {
        id: `label-${Date.now()}`,
        width: Math.round(pixelsToMillimeters(this.canvasState().width)),
        height: Math.round(pixelsToMillimeters(this.canvasState().height)),
        backgroundColor: this.canvasState().backgroundColor,
        backgroundImage: this.canvasState().backgroundImage,
        canvasJson: this.canvasService.serializeCanvas(),
      },
      printSetting: this.template().printSetting,
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

    try {
      const labelTemplate = JSON.parse(saved) as LabelTemplate;
      // Ensure printSetting has default values for missing properties
      const printSetting = {
        ...DEFAULT_PRINT_SETTING,
        ...labelTemplate.printSetting,
      };
      this.template.set({ ...labelTemplate, printSetting });
      if (labelTemplate.label.canvasJson) {
        await this.canvasService.loadPage(labelTemplate.label);
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
    this.canvasService.zoomIn();
  }

  zoomOut(): void {
    this.canvasService.zoomOut();
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
