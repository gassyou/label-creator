import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorCanvasService } from './editor-canvas.service';
import {
  createCanvasState,
  createEditorPage,
  DEFAULT_SELECTION_STATE,
  EditorCanvasState,
  EditorDocumentState,
  EditorPage,
  EditorSelectionState,
  EditorTool,
  getPresetById,
  LabelElement,
  PAGE_SIZE_PRESETS,
  BarcodeElement
} from './editor.models';
import { EditorPdfService } from './editor-pdf.service';
import { EditorPropertiesPanelComponent } from './editor-properties-panel';
import { EditorTopbarComponent } from './editor-topbar';
import { EditorToolStripComponent } from './editor-tool-strip';

@Component({
  selector: 'app-editor',
  imports: [FormsModule, EditorPropertiesPanelComponent, EditorTopbarComponent, EditorToolStripComponent],
  providers: [EditorCanvasService, EditorPdfService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor.html',
  styleUrl: './editor.scss'
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('htmlCanvas', { static: true }) htmlCanvas!: ElementRef<HTMLCanvasElement>;

  readonly canvasService = inject(EditorCanvasService);
  private readonly pdfService = inject(EditorPdfService);

  readonly activeTool = signal<EditorTool>('select');
  readonly documentState = signal<EditorDocumentState>(this.createInitialDocument());
  readonly canvasState = signal<EditorCanvasState>(this.documentState().pages[0].canvasState);
  readonly selectionState = signal<EditorSelectionState>({ ...DEFAULT_SELECTION_STATE });

  readonly pageSizePresets = PAGE_SIZE_PRESETS;
  readonly propsPanelVisible = computed(() => !!this.canvasService.selected());
  readonly textEditorVisible = this.canvasService.textEditorVisible.asReadonly();
  readonly figureEditorVisible = this.canvasService.figureEditorVisible.asReadonly();
  readonly jsonPreview = this.canvasService.jsonPreview.asReadonly();
  readonly pages = computed(() => this.documentState().pages);
  readonly activePage = computed(
    () =>
      this.documentState().pages.find((page) => page.id === this.documentState().activePageId) ??
      this.documentState().pages[0]
  );

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
      this.canvasService.revision();
      if (!this.hasCanvasInitialized) {
        return;
      }

      untracked(() => this.persistCurrentPageSnapshot());
    });
  }

  ngAfterViewInit(): void {
    const page = this.activePage();
    this.canvasService.initialize(this.htmlCanvas.nativeElement, page.canvasState);
    this.hasCanvasInitialized = true;
    this.persistCurrentPageSnapshot();
  }

  ngOnDestroy(): void {
    this.canvasService.destroy();
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
    this.updateActivePage((page) => ({
      ...page,
      canvasState: { ...page.canvasState, backgroundColor }
    }));
    this.canvasService.applyCanvasFill(backgroundColor, this.canvasState().backgroundImage);
  }

  updateCanvasImage(backgroundImage: string): void {
    this.canvasState.update((state) => ({ ...state, backgroundImage }));
    this.updateActivePage((page) => ({
      ...page,
      canvasState: { ...page.canvasState, backgroundImage }
    }));
  }

  applyCanvasImage(): void {
    this.canvasService.applyCanvasImage(this.canvasState().backgroundImage, () => {
      this.persistCurrentPageSnapshot();
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
    const current = this.selectionState()
      .textDecoration.split(' ')
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

  saveCanvasToJSON(): void {
    this.persistCurrentPageSnapshot();
    localStorage.setItem('KanvasDocument', JSON.stringify(this.documentState()));
  }

  async loadCanvasFromJSON(): Promise<void> {
    const saved = localStorage.getItem('KanvasDocument');
    if (!saved) {
      return;
    }

    const documentState = JSON.parse(saved) as EditorDocumentState;
    const activePage = documentState.pages.find((page) => page.id === documentState.activePageId) ?? documentState.pages[0];
    this.documentState.set(documentState);
    this.canvasState.set(activePage.canvasState);
    this.selectionState.set({ ...DEFAULT_SELECTION_STATE });
    await this.canvasService.loadPage(activePage);
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
    this.persistCurrentPageSnapshot();
    await this.pdfService.exportDocument(this.documentState().pages, 'label-document.pdf');
  }

  async selectPage(pageId: string): Promise<void> {
    if (pageId === this.activePage().id) {
      return;
    }

    this.persistCurrentPageSnapshot();
    const page = this.pages().find((item) => item.id === pageId);
    if (!page) {
      return;
    }

    this.documentState.update((state) => ({ ...state, activePageId: pageId }));
    this.canvasState.set(page.canvasState);
    this.selectionState.set({ ...DEFAULT_SELECTION_STATE });
    await this.canvasService.loadPage(page);
  }

  async addPage(): Promise<void> {
    this.persistCurrentPageSnapshot();
    const page = createEditorPage(this.pages().length + 1, this.activePage().presetId);

    this.documentState.update((state) => ({
      activePageId: page.id,
      pages: [...state.pages, page]
    }));

    this.canvasState.set(page.canvasState);
    this.selectionState.set({ ...DEFAULT_SELECTION_STATE });
    await this.canvasService.loadPage(page);
  }

  async duplicatePage(): Promise<void> {
    this.persistCurrentPageSnapshot();
    const source = this.activePage();
    const page: EditorPage = {
      ...source,
      id: `page-${Date.now()}-${this.pages().length + 1}`,
      name: `${source.name} Copy`,
      canvasState: { ...source.canvasState }
    };

    this.documentState.update((state) => ({
      activePageId: page.id,
      pages: [...state.pages, page]
    }));

    this.canvasState.set(page.canvasState);
    this.selectionState.set({ ...DEFAULT_SELECTION_STATE });
    await this.canvasService.loadPage(page);
  }

  async removePage(pageId: string): Promise<void> {
    if (this.pages().length === 1) {
      return;
    }

    this.persistCurrentPageSnapshot();
    const remainingPages = this.pages().filter((page) => page.id !== pageId);
    const nextPage = remainingPages[Math.max(0, this.pages().findIndex((page) => page.id === pageId) - 1)] ?? remainingPages[0];

    this.documentState.set({
      activePageId: nextPage.id,
      pages: remainingPages
    });

    this.canvasState.set(nextPage.canvasState);
    this.selectionState.set({ ...DEFAULT_SELECTION_STATE });
    await this.canvasService.loadPage(nextPage);
  }

  async updatePagePreset(presetId: string): Promise<void> {
    const preset = getPresetById(presetId);
    await this.updatePageSize(preset.widthMm, preset.heightMm, preset.id);
  }

  async updatePageWidthMm(widthMm: number): Promise<void> {
    await this.updatePageSize(Number(widthMm), this.activePage().heightMm, 'custom');
  }

  async updatePageHeightMm(heightMm: number): Promise<void> {
    await this.updatePageSize(this.activePage().widthMm, Number(heightMm), 'custom');
  }

  private async updatePageSize(widthMm: number, heightMm: number, presetId: string): Promise<void> {
    const nextCanvasState = {
      ...this.canvasState(),
      ...createCanvasState(widthMm, heightMm),
      backgroundColor: this.canvasState().backgroundColor,
      backgroundImage: this.canvasState().backgroundImage
    };

    this.canvasState.set(nextCanvasState);
    this.updateActivePage((page) => ({
      ...page,
      presetId,
      widthMm: widthMm || page.widthMm,
      heightMm: heightMm || page.heightMm,
      canvasState: nextCanvasState
    }));

    this.canvasService.resizeCanvas(nextCanvasState);
    this.persistCurrentPageSnapshot();
  }

  private createInitialDocument(): EditorDocumentState {
    const firstPage = createEditorPage(1);
    return {
      activePageId: firstPage.id,
      pages: [firstPage]
    };
  }

  private persistCurrentPageSnapshot(): void {
    const activePageId = this.activePage().id;
    const canvasJson = this.canvasService.serializeCanvas();
    const currentCanvasState = this.canvasState();

    this.documentState.update((state) => ({
      ...state,
      pages: state.pages.map((page) =>
        page.id === activePageId
          ? {
              ...page,
              canvasState: { ...currentCanvasState },
              canvasJson
            }
          : page
      )
    }));
  }

  private updateActivePage(updater: (page: EditorPage) => EditorPage): void {
    const activePageId = this.activePage().id;
    this.documentState.update((state) => ({
      ...state,
      pages: state.pages.map((page) => (page.id === activePageId ? updater(page) : page))
    }));
  }
}
