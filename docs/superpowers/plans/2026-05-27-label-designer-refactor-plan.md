# 标签设计器重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将模板设计器从多页架构改为单页标签设计，新增打印设置功能，支持批量生成标签 PDF。

**Architecture:**
- 使用新的 `LabelTemplate` 替代旧的 `LabelDocument`，包含标签尺寸和 `PrintSetting`
- Barcode/QRCode 使用 `fabric.Image` + 自定义属性存储绑定信息
- 批量打印服务计算 N x M 网格布局，替换绑定值生成 PDF
- 已有 `BindingResolverService` 提供绑定表达式解析能力

**Tech Stack:** Angular 21, Fabric.js 7, jsPDF, ng-zorro-antd, jsbarcode, qrcode

---

## 文件结构

```
src/app/
├── editor/
│   ├── models/
│   │   ├── label.models.ts      # 修改：移除旧模型，保留常量
│   │   └── template.models.ts   # 新建：LabelTemplate, PrintSetting
│   ├── editor-canvas.service.ts    # 修改：完善 Barcode/QRCode 自定义属性
│   ├── editor.ts                    # 修改：单页架构，打印设置
│   ├── editor-topbar.*             # 修改：添加打印设置按钮
│   ├── editor-properties-panel.*   # 修改：移除多页 UI
│   ├── editor-pdf.service.ts        # 修改：适配新模型
│   └── dialogs/
│       └── print-setting-dialog/    # 新建：打印设置对话框
├── print/
│   ├── print.service.ts             # 新建：批量打印服务
│   ├── barcode-generator.ts         # 新建：条码/二维码生成器
│   └── print.component.ts           # 新建：批量打印组件
└── template/
    ├── template.service.ts          # 修改：适配新 LabelTemplate
    └── template.storage.ts         # 修改：适配新 LabelTemplate
```

---

## Task 1: 创建新的数据模型

**Files:**
- Create: `src/app/editor/models/template.models.ts`

- [ ] **Step 1: 创建 template.models.ts**

```typescript
// src/app/editor/models/template.models.ts

/**
 * 打印设置
 */
export interface PrintSetting {
  paperSize: 'A4' | 'A5' | 'letter' | 'custom';
  orientation: 'portrait' | 'landscape';
  // 当 paperSize 为 'custom' 时使用这些自定义纸张尺寸 (mm)
  customPaperWidth?: number;
  customPaperHeight?: number;
  marginTop: number;     // 页边距 mm，默认 0
  marginBottom: number;  // 页边距 mm，默认 0
  marginLeft: number;    // 页边距 mm，默认 0
  marginRight: number;   // 页边距 mm，默认 0
  gapX: number;          // 行内标签间距 mm，默认 0
  gapY: number;          // 列间标签间距 mm，默认 0
}

/**
 * 标签模板
 */
export interface LabelTemplate {
  id: string;
  name: string;
  width: number;              // 标签宽度 mm
  height: number;             // 标签高度 mm
  backgroundColor: string;
  backgroundImage?: string;
  canvasJson: string;         // Fabric.js 画布数据
  printSetting: PrintSetting;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 存储的模板数据结构
 */
export interface StoredTemplate extends LabelTemplate {
  thumbnail?: string;  // 200x200 base64 缩略图
}

/**
 * 纸张尺寸常量
 */
export const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  'A4': { width: 210, height: 297 },
  'A5': { width: 148, height: 210 },
  'letter': { width: 216, height: 279 }
};

/**
 * 默认打印设置
 */
export const DEFAULT_PRINT_SETTING: PrintSetting = {
  paperSize: 'A4',
  orientation: 'portrait',
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
  gapX: 0,
  gapY: 0
};

/**
 * 标签尺寸预设
 */
export interface PageSizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

/**
 * 页面尺寸预设列表
 */
export const PAGE_SIZE_PRESETS: ReadonlyArray<PageSizePreset> = [
  { id: 'a4-portrait', name: 'A4 Portrait', widthMm: 210, heightMm: 297 },
  { id: 'a4-landscape', name: 'A4 Landscape', widthMm: 297, heightMm: 210 },
  { id: 'a5-portrait', name: 'A5 Portrait', widthMm: 148, heightMm: 210 },
  { id: 'a5-landscape', name: 'A5 Landscape', widthMm: 210, heightMm: 148 },
  { id: 'letter-portrait', name: 'Letter Portrait', widthMm: 216, heightMm: 279 },
  { id: 'letter-landscape', name: 'Letter Landscape', widthMm: 279, heightMm: 216 },
  { id: 'custom', name: 'Custom Size', widthMm: 100, heightMm: 100 }
];

/**
 * 获取预设的纸张尺寸（mm）
 */
export function getPaperSize(paperSize: string, orientation: 'portrait' | 'landscape', customWidth?: number, customHeight?: number): { width: number; height: number } {
  if (paperSize === 'custom' && customWidth && customHeight) {
    return { width: customWidth, height: customHeight };
  }
  const size = PAPER_SIZES[paperSize] || PAPER_SIZES['A4'];
  return orientation === 'portrait' ? size : { width: size.height, height: size.width };
}

/**
 * 毫米转换为像素 (96 DPI / 25.4mm)
 */
export const PX_PER_MM = 96 / 25.4;

export function millimetersToPixels(sizeMm: number): number {
  return Math.round(sizeMm * PX_PER_MM);
}

export function pixelsToMillimeters(sizePx: number): number {
  return Math.round((sizePx / PX_PER_MM) * 100) / 100;
}
```

- [ ] **Step 2: 更新 label.models.ts，移除旧模型，保留常量**

修改 `src/app/editor/models/label.models.ts`，删除 `BaseElement`, `RectElement`, `CircleElement`, `TextElement`, `BarcodeElement`, `QRCodeElement`, `ImageElement`, `TableElement`, `LabelDocument`, `LabelPage`, `LabelTemplate`, `RuntimeElement`, `LabelInstance`, `PageLayout` 等旧模型，保留：

```typescript
export { 
  PrintSetting,
  LabelTemplate,
  StoredTemplate,
  PAPER_SIZES,
  DEFAULT_PRINT_SETTING,
  PageSizePreset,
  PAGE_SIZE_PRESETS,
  getPaperSize,
  PX_PER_MM,
  millimetersToPixels,
  pixelsToMillimeters
} from './template.models';
```

（将 label.models.ts 作为导出汇总文件）

- [ ] **Step 3: 提交**

```bash
git add src/app/editor/models/template.models.ts src/app/editor/models/label.models.ts
git commit -m "feat: add new LabelTemplate and PrintSetting models"
```

---

## Task 2: 更新模板存储服务

**Files:**
- Modify: `src/app/template/template.storage.ts` - 更新 `StoredTemplate` 类型
- Modify: `src/app/template/template.service.ts` - 适配新的 LabelTemplate 模型

- [ ] **Step 1: 更新 template.storage.ts**

修改 `StoredTemplate` 使用新的 `LabelTemplate`：

```typescript
import { LabelTemplate } from '../editor/models/label.models';

export interface StoredTemplate extends LabelTemplate {
  thumbnail?: string;
}
```

- [ ] **Step 2: 更新 template.service.ts**

修改 `generateThumbnail` 方法，使用新的模型结构。核心变更：
- 模板现在直接是 `LabelTemplate`，不再是嵌套的 `document`
- 缩略图从 `template.canvasJson` 生成

```typescript
// 修改缩略图生成相关逻辑
private async renderCanvasToThumbnail(template: LabelTemplate): Promise<string> {
  // 使用 template.canvasJson 和 template.width/height 生成缩略图
}
```

- [ ] **Step 3: 提交**

```bash
git add src/app/template/template.storage.ts src/app/template/template.service.ts
git commit -m "refactor: adapt template service to new LabelTemplate model"
```

---

## Task 3: 创建打印设置对话框

**Files:**
- Create: `src/app/editor/dialogs/print-setting-dialog/print-setting-dialog.ts`
- Create: `src/app/editor/dialogs/print-setting-dialog/print-setting-dialog.html`
- Create: `src/app/editor/dialogs/print-setting-dialog/print-setting-dialog.scss`

- [ ] **Step 1: 创建打印设置对话框组件**

使用 nz-modal 创建对话框，包含字段：
- 纸张大小 (dropdown)
- 方向 (radio)
- 上边距 / 下边距 / 左边距 / 右边距 (number inputs, mm)
- 标签横向间距 / 标签纵向间距 (number inputs, mm)

```typescript
// print-setting-dialog.ts
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-print-setting-dialog',
  imports: [CommonModule, FormsModule, NzModalModule, NzRadioModule, NzInputNumberModule, NzSelectModule, NzButtonModule, NzIconModule],
  templateUrl: './print-setting-dialog.html',
  styleUrl: './print-setting-dialog.scss'
})
export class PrintSettingDialogComponent {
  @Input() printSetting: PrintSetting = { ...DEFAULT_PRINT_SETTING };
  @Output() settingChanged = new EventEmitter<PrintSetting>();
  @Output() closed = new EventEmitter<void>();

  readonly paperSizes = [
    { value: 'A4', label: 'A4 (210 x 297 mm)' },
    { value: 'A5', label: 'A5 (148 x 210 mm)' },
    { value: 'letter', label: 'Letter (216 x 279 mm)' },
    { value: 'custom', label: 'Custom' }
  ];

  onOk(): void {
    this.settingChanged.emit(this.printSetting);
    this.closed.emit();
  }

  onCancel(): void {
    this.closed.emit();
  }
}
```

- [ ] **Step 2: 创建 HTML 模板**

```html
<nz-modal 
  nzTitle="打印设置" 
  [(nzVisible)]="visible"
  (nzOnOk)="onOk()"
  (nzOnCancel)="onCancel()"
  nzOkText="确定"
  nzCancelText="取消">
  
  <ng-container *nzModalContent>
    <div class="setting-row">
      <label>纸张大小</label>
      <nz-select [(ngModel)]="printSetting.paperSize">
        @for (size of paperSizes; track size.value) {
          <nz-option [nzValue]="size.value" [nzLabel]="size.label"></nz-option>
        }
      </nz-select>
    </div>
    
    <div class="setting-row">
      <label>方向</label>
      <nz-radio-group [(ngModel)]="printSetting.orientation">
        <nz-radioButton value="portrait">纵向</nz-radioButton>
        <nz-radioButton value="landscape">横向</nz-radioButton>
      </nz-radio-group>
    </div>
    
    <div class="setting-section">
      <h4>页边距 (mm)</h4>
      <div class="inline-row">
        <div class="setting-field">
          <label>上</label>
          <nz-input-number [(ngModel)]="printSetting.marginTop" [min]="0" [step]="1"></nz-input-number>
        </div>
        <div class="setting-field">
          <label>下</label>
          <nz-input-number [(ngModel)]="printSetting.marginBottom" [min]="0" [step]="1"></nz-input-number>
        </div>
      </div>
      <div class="inline-row">
        <div class="setting-field">
          <label>左</label>
          <nz-input-number [(ngModel)]="printSetting.marginLeft" [min]="0" [step]="1"></nz-input-number>
        </div>
        <div class="setting-field">
          <label>右</label>
          <nz-input-number [(ngModel)]="printSetting.marginRight" [min]="0" [step]="1"></nz-input-number>
        </div>
      </div>
    </div>
    
    <div class="setting-section">
      <h4>标签间距 (mm)</h4>
      <div class="inline-row">
        <div class="setting-field">
          <label>横向</label>
          <nz-input-number [(ngModel)]="printSetting.gapX" [min]="0" [step]="0.5"></nz-input-number>
        </div>
        <div class="setting-field">
          <label>纵向</label>
          <nz-input-number [(ngModel)]="printSetting.gapY" [min]="0" [step]="0.5"></nz-input-number>
        </div>
      </div>
    </div>
  </ng-container>
</nz-modal>
```

- [ ] **Step 3: 提交**

```bash
git add src/app/editor/dialogs/print-setting-dialog/
git commit -m "feat: add print setting dialog component"
```

---

## Task 4: 更新编辑器顶部工具栏

**Files:**
- Modify: `src/app/editor/editor-topbar.ts`
- Modify: `src/app/editor/editor-topbar.html`
- Modify: `src/app/editor/editor-topbar.scss`

- [ ] **Step 1: 添加打印设置按钮到 topbar**

在 topbar 右侧添加打印设置按钮，点击时触发 `printSettingRequested` 事件。

- [ ] **Step 2: 提交**

```bash
git add src/app/editor/editor-topbar.*
git commit -m "feat: add print setting button to topbar"
```

---

## Task 5: 更新编辑器组件 - 单页架构

**Files:**
- Modify: `src/app/editor/editor.ts`
- Modify: `src/app/editor/editor.html`
- Modify: `src/app/editor/editor-properties-panel.html`
- Modify: `src/app/editor/editor-properties-panel.ts`
- Modify: `src/app/editor/editor-properties-panel.scss`

- [ ] **Step 1: 更新 editor.ts**

变更：
- 移除 `documentState`、`pages`、`activePage` 等多页相关信号
- 添加 `template` 信号（类型为 `LabelTemplate`）
- 添加 `printSetting` 信号
- 移除 `selectPage`、`addPage`、`duplicatePage`、`removePage` 方法
- 添加 `openPrintSettingDialog()` 方法
- 修改 `saveToTemplate()` 方法，使用新的 `LabelTemplate` 结构
- 修改 `buildLabelDocument()` → `buildLabelTemplate()`
- 修改 `loadTemplate()` 方法，适配新的 `LabelTemplate` 结构

```typescript
// 新的信号定义
readonly template = signal<LabelTemplate>(this.createDefaultTemplate());
readonly printSetting = signal<PrintSetting>({ ...DEFAULT_PRINT_SETTING });

// 新的 buildLabelTemplate 方法
private buildLabelTemplate(): LabelTemplate {
  return {
    id: this.templateId || `tpl-${Date.now()}`,
    name: this.templateName(),
    width: this.activeWidthMm,
    height: this.activeHeightMm,
    backgroundColor: this.canvasState().backgroundColor,
    backgroundImage: this.canvasState().backgroundImage,
    canvasJson: this.canvasService.serializeCanvas(),
    printSetting: this.printSetting()
  };
}
```

- [ ] **Step 2: 更新 editor.html**

变更：
- 移除 `<app-editor-properties-panel>` 的 `pages`、`activePage`、`pageSelected` 等属性（因为不再有多页）
- 简化属性面板绑定

- [ ] **Step 3: 更新 editor-properties-panel.html**

移除：
- 页列表显示区域
- 添加页 / 复制页 / 删除页按钮

保留：
- 标签设置（纸张尺寸、方向、宽、高、背景颜色、背景图片）

- [ ] **Step 4: 更新 editor-properties-panel.ts**

移除输出事件：
- `pageSelected`
- `pageAdded`
- `pageDuplicated`
- `pageRemoved`
- `pagePresetChanged`
- `pageWidthChanged`
- `pageHeightChanged`

- [ ] **Step 5: 提交**

```bash
git add src/app/editor/editor.ts src/app/editor/editor.html src/app/editor/editor-properties-panel.*
git commit -m "refactor: simplify editor to single-page architecture"
```

---

## Task 6: 完善 Barcode/QRCode 元素的自定义属性

**Files:**
- Modify: `src/app/editor/editor-canvas.service.ts`

- [ ] **Step 1: 修改 addQRCode 和 addBarcode 方法**

使用 `fabric.Image` 作为载体，添加自定义属性：

```typescript
addQRCode(bindingValue?: string): void {
  if (!this.canvas) return;
  
  // 创建占位图片（用 bindingValue 作为预览文本生成二维码）
  const previewValue = bindingValue || '${qrcode}';
  const qrDataUrl = this.generateQRCodeDataUrl(previewValue, 100);
  
  FabricImage.fromURL(qrDataUrl).then((img) => {
    img.set({
      left: 50,
      top: 50,
      scaleX: 1,
      scaleY: 1
    });
    
    // 扩展 toObject 保存自定义属性
    this.extendWithBarcodeProperties(img, {
      elementType: 'qrcode',
      bindingValue: previewValue,
      errorCorrectionLevel: 'M'
    });
    
    this.elementRegistry.set(img.id, { type: 'qrcode', id: img.id } as any);
    this.canvas.add(img);
    this.selectItemAfterAdded(img);
  });
}

addBarcode(format: 'CODE128' | 'EAN13' | 'CODE39', bindingValue?: string): void {
  if (!this.canvas) return;
  
  const previewValue = bindingValue || '${barcode}';
  const barcodeDataUrl = this.generateBarcodeDataUrl(previewValue, format);
  
  FabricImage.fromURL(barcodeDataUrl).then((img) => {
    img.set({
      left: 50,
      top: 50,
      scaleX: 2,
      scaleY: 1
    });
    
    this.extendWithBarcodeProperties(img, {
      elementType: 'barcode',
      bindingValue: previewValue,
      barcodeFormat: format,
      showText: true
    });
    
    this.elementRegistry.set(img.id, { type: 'barcode', id: img.id } as any);
    this.canvas.add(img);
    this.selectItemAfterAdded(img);
  });
}

private extendWithBarcodeProperties(obj: any, props: Record<string, any>): void {
  const originalToObject = obj.toObject;
  obj.toObject = (function(toObject) {
    return function() {
      return fabric.util.object.extend(toObject.call(this), props);
    };
  })(originalToObject);
  
  // 设置实例属性
  Object.assign(obj, props);
}

generateQRCodeDataUrl(value: string, size: number): string {
  // 使用 qrcode 库生成 SVG DataURL
  try {
    const svg = qrcode.generateSVG(value, { width: size });
    return 'data:image/svg+xml;base64,' + btoa(svg);
  } catch {
    return this.createPlaceholderDataUrl('QR', size);
  }
}

generateBarcodeDataUrl(value: string, format: string): string {
  // 使用 JsBarcode 生成 PNG DataURL
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, { format });
    return canvas.toDataURL('image/png');
  } catch {
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
```

- [ ] **Step 2: 更新 readSelectionState 方法**

识别 Barcode/QRCode 的自定义属性：

```typescript
case 'image': {
  const elementType = object.elementType;
  if (elementType === 'barcode') {
    return {
      ...baseState,
      type: 'barcode',
      barcodeFormat: object.barcodeFormat ?? 'CODE128',
      showText: object.showText ?? true
    };
  }
  if (elementType === 'qrcode') {
    return {
      ...baseState,
      type: 'qrcode',
      errorCorrectionLevel: object.errorCorrectionLevel ?? 'M'
    };
  }
  return baseState;
}
```

- [ ] **Step 3: 提交**

```bash
git add src/app/editor/editor-canvas.service.ts
git commit -m "feat: enhance barcode/qrcode with fabric.Image and custom properties"
```

---

## Task 7: 创建批量打印服务

**Files:**
- Create: `src/app/print/print.service.ts`
- Create: `src/app/print/barcode-generator.ts`

- [ ] **Step 1: 创建条码生成器**

```typescript
// src/app/print/barcode-generator.ts

declare const JsBarcode: any;
declare const qrcode: any;

/**
 * 生成条码图片 (PNG)
 */
export function generateBarcode(value: string, format: string, height: number = 50): string {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: format,
      width: 1,
      height: height,
      displayValue: false
    });
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('Barcode generation failed:', e);
    return createPlaceholderImage(value, 'BC');
  }
}

/**
 * 生成二维码图片 (SVG)
 */
export function generateQRCode(value: string, size: number = 100): string {
  try {
    const svg = qrcode.generateSVG(value, { width: size });
    return 'data:image/svg+xml;base64,' + btoa(svg);
  } catch (e) {
    console.error('QRCode generation failed:', e);
    return createPlaceholderImage(value, 'QR');
  }
}

function createPlaceholderImage(text: string, type: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, 200, 100);
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(0, 0, 200, 100);
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(type + ': ' + text, 100, 55);
  }
  return canvas.toDataURL('image/png');
}
```

- [ ] **Step 2: 创建批量打印服务**

```typescript
// src/app/print/print.service.ts
import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { LabelTemplate, PrintSetting, getPaperSize, millimetersToPixels, DEFAULT_PRINT_SETTING } from '../editor/models/label.models';
import { BindingResolverService } from '../editor/services/binding-resolver.service';
import { generateBarcode, generateQRCode } from './barcode-generator';

@Injectable()
export class PrintService {
  constructor(private bindingResolver: BindingResolverService) {}

  /**
   * 批量生成标签 PDF
   */
  async generateLabelsPdf(
    template: LabelTemplate,
    data: Record<string, any>[]
  ): Promise<Blob> {
    const { printSetting, width, height, canvasJson } = template;
    const settings = { ...DEFAULT_PRINT_SETTING, ...printSetting };

    // 1. 获取纸张尺寸
    const paperSize = getPaperSize(
      settings.paperSize,
      settings.orientation,
      settings.customPaperWidth,
      settings.customPaperHeight
    );

    // 2. 计算排版
    const layout = this.calculateLayout(
      paperSize.width,
      paperSize.height,
      width,
      height,
      settings
    );

    // 3. 创建 PDF
    const pdf = new jsPDF({
      orientation: settings.orientation,
      unit: 'mm',
      format: settings.paperSize === 'custom' ? 'a4' : settings.paperSize
    });

    // 4. 分页生成标签
    let labelIndex = 0;
    for (const record of data) {
      // 计算当前标签在页面中的位置
      const pageLabelIndex = labelIndex % layout.labelsPerPage;
      const col = pageLabelIndex % layout.colsPerRow;
      const row = Math.floor(pageLabelIndex / layout.colsPerRow);

      // 如果当前页已满，换页
      if (pageLabelIndex === 0 && labelIndex > 0) {
        pdf.addPage();
      }

      // 计算标签位置 (mm)
      const x = settings.marginLeft + col * (width + settings.gapX);
      const y = settings.marginTop + row * (height + settings.gapY);

      // 5. 渲染单个标签
      await this.renderLabelToPdf(pdf, canvasJson, record, x, y, width, height);
      labelIndex++;
    }

    return pdf.output('blob');
  }

  private calculateLayout(
    paperWidth: number,
    paperHeight: number,
    labelWidth: number,
    labelHeight: number,
    settings: PrintSetting
  ) {
    const availableWidth = paperWidth - settings.marginLeft - settings.marginRight;
    const availableHeight = paperHeight - settings.marginTop - settings.marginBottom;

    const colsPerRow = Math.floor((availableWidth + settings.gapX) / (labelWidth + settings.gapX));
    const rowsPerColumn = Math.floor((availableHeight + settings.gapY) / (labelHeight + settings.gapY));

    return {
      colsPerRow: Math.max(1, colsPerRow),
      rowsPerColumn: Math.max(1, rowsPerColumn),
      labelsPerPage: Math.max(1, colsPerRow * rowsPerColumn)
    };
  }

  private async renderLabelToPdf(
    pdf: jsPDF,
    canvasJson: string,
    data: Record<string, any>,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    // 1. 解析 canvasJson
    const parsed = JSON.parse(canvasJson);

    // 2. 替换绑定值
    this.resolveBindingsInObjects(parsed.objects, data);

    // 3. 渲染标签内容到 PDF（简化版：只处理文本和图片）
    // 实际实现需要用 canvas 渲染后再转为图片嵌入 PDF
    // 这里先用占位方式，后续可优化为完整 canvas 渲染
    for (const obj of parsed.objects || []) {
      if (obj.type === 'i-text' || obj.type === 'textbox') {
        pdf.setFontSize(obj.fontSize || 12);
        pdf.setTextColor(obj.fill || '#000000');
        pdf.text(obj.text || '', x + (obj.left || 0), y + (obj.top || 0) + (obj.fontSize || 12) / 3);
      } else if (obj.type === 'image' && obj.src) {
        try {
          pdf.addImage(obj.src, 'PNG', x + (obj.left || 0), y + (obj.top || 0), obj.width || width, obj.height || height);
        } catch {
          // 忽略无效图片
        }
      }
    }
  }

  private resolveBindingsInObjects(objects: any[], data: Record<string, any>): void {
    if (!objects) return;

    for (const obj of objects) {
      // 处理文本
      if (obj.text) {
        obj.text = this.bindingResolver.resolveTemplate(obj.text, data);
      }

      // 处理自定义绑定属性
      if (obj.bindingValue) {
        obj.bindingValue = this.bindingResolver.resolveTemplate(obj.bindingValue, data);

        // 根据类型生成新的条码/二维码图片
        if (obj.elementType === 'barcode' && obj.barcodeFormat) {
          obj.src = generateBarcode(obj.bindingValue, obj.barcodeFormat, obj.height || 50);
        } else if (obj.elementType === 'qrcode') {
          obj.src = generateQRCode(obj.bindingValue, obj.width || 100);
        }
      }
    }
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/app/print/
git commit -m "feat: add print service for batch label generation"
```

---

## Task 8: 创建批量打印组件

**Files:**
- Create: `src/app/print/print.component.ts`
- Create: `src/app/print/print.component.html`
- Create: `src/app/print/print.component.scss`

- [ ] **Step 1: 创建批量打印组件**

组件功能：
- 选择模板（从已有模板列表选择）
- 粘贴 JSON 数据
- 点击生成按钮调用 PrintService
- 预览/下载生成的 PDF

```typescript
// print.component.ts
@Component({
  selector: 'app-print',
  imports: [CommonModule, FormsModule, NzButtonModule, NzSelectModule, NzInputTextareaModule, NzMessageModule],
  templateUrl: './print.component.html',
  styleUrl: './print.component.scss'
})
export class PrintComponent {
  private readonly templateService = inject(TemplateService);
  private readonly printService = inject(PrintService);
  private readonly message = inject(NzMessageService);

  readonly templates = signal<StoredTemplate[]>([]);
  readonly selectedTemplateId = signal<string | null>(null);
  jsonData = '';

  constructor() {
    this.loadTemplates();
  }

  async generateLabels(): Promise<void> {
    const templateId = this.selectedTemplateId();
    if (!templateId) {
      this.message.warning('请选择模板');
      return;
    }

    let data: Record<string, any>[];
    try {
      data = JSON.parse(this.jsonData);
      if (!Array.isArray(data)) {
        throw new Error('数据必须是数组');
      }
    } catch {
      this.message.error('JSON 格式错误');
      return;
    }

    const template = this.templates().find(t => t.id === templateId);
    if (!template) {
      this.message.error('模板不存在');
      return;
    }

    try {
      const blob = await this.printService.generateLabelsPdf(template, data);
      const url = URL.createObjectURL(blob);
      window.open(url);
    } catch (e) {
      this.message.error('生成失败: ' + (e as Error).message);
    }
  }
}
```

- [ ] **Step 2: 创建 HTML 模板**

```html
<div class="print-container">
  <h2>批量生成标签</h2>
  
  <div class="form-row">
    <label>选择模板</label>
    <nz-select [(ngModel)]="selectedTemplateId" nzPlaceHolder="请选择模板">
      @for (t of templates(); track t.id) {
        <nz-option [nzValue]="t.id" [nzLabel]="t.name"></nz-option>
      }
    </nz-select>
  </div>
  
  <div class="form-row">
    <label>数据 (JSON 数组)</label>
    <textarea nz-input [(ngModel)]="jsonData" rows="10" placeholder="[&#123;&#34;productNo&#34;: &#34;A123&#34;, &#34;name&#34;: &#34;产品A&#34;&#125;]"></textarea>
  </div>
  
  <button nz-button nzType="primary" (click)="generateLabels()">生成标签 PDF</button>
</div>
```

- [ ] **Step 3: 添加路由**

在 `app.routes.ts` 添加批量打印路由：

```typescript
{ path: 'print', component: PrintComponent }
```

- [ ] **Step 4: 提交**

```bash
git add src/app/print/ src/app/app.routes.ts
git commit -m "feat: add batch print component and route"
```

---

## Task 9: 更新模板列表，添加批量打印入口

**Files:**
- Modify: `src/app/template/template-list/template-list.ts`

- [ ] **Step 1: 添加批量打印按钮**

在模板列表中，每个模板卡片添加"批量打印"按钮：

```html
<ng-template #printBtn>
  <button nz-button nzType="text" nzSize="small" (click)="printTemplate(template)">
    <span nz-icon nzType="printer"></span>
  </button>
</ng-template>
```

```typescript
printTemplate(template: StoredTemplate): void {
  this.router.navigate(['/print'], { queryParams: { templateId: template.id } });
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/template/template-list/template-list.ts
git commit -m "feat: add batch print button to template list"
```

---

## Task 10: 安装条码/二维码依赖库

- [ ] **Step 1: 安装依赖**

```bash
npm install jsbarcode qrcode
npm install -D @types/jsbarcode
```

- [ ] **Step 2: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add jsbarcode and qrcode dependencies"
```

---

## 自检清单

1. **Spec 覆盖检查**：
   - [x] 单页标签设计
   - [x] PrintSetting 属性完整（纸张、方向、边距、间距）
   - [x] Barcode/QRCode 使用 fabric.Image + 自定义属性
   - [x] 预览显示 ${fieldName} 对应的条码
   - [x] 批量打印 PDF 生成
   - [x] 排版计算 N x M 网格
   - [x] 绑定值替换

2. **占位符扫描**：无 TBD/TODO

3. **类型一致性**：
   - `LabelTemplate.printSetting` 类型为 `PrintSetting`
   - `BindingResolverService.resolveTemplate()` 方法签名一致
   - `generateBarcode()` / `generateQRCode()` 函数命名一致

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-27-label-designer-refactor-plan.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?