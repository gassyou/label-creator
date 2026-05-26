# 标签设计器重构方案

## 概述

将模板设计器从多页架构改为单页标签设计，新增打印设置功能，支持批量生成标签 PDF。

## 1. 数据模型重构

### 1.1 核心模型

**LabelTemplate（标签模板）**

```typescript
interface LabelTemplate {
  id: string;
  name: string;
  width: number;              // 标签宽度 mm
  height: number;            // 标签高度 mm
  backgroundColor: string;
  backgroundImage?: string;
  canvasJson: string;        // Fabric.js 画布数据
  printSetting: PrintSetting;
  createdAt?: string;
  updatedAt?: string;
}
```

**PrintSetting（打印设置）**

```typescript
interface PrintSetting {
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
```

**纸张尺寸常量：**

```typescript
const PAPER_SIZES = {
  'A4': { width: 210, height: 297 },
  'A5': { width: 148, height: 210 },
  'letter': { width: 216, height: 279 }
};
```

### 1.2 删除的模型

- `LabelDocument` - 用 LabelTemplate 替代
- `LabelPage` - 多页概念移除
- `BaseElement`, `RectElement`, `CircleElement`, `TriangleElement`, `LineElement`
- `TextElement`, `BarcodeElement`, `QRCodeElement`, `ImageElement`, `TableElement`
- `TableColumn`, `TableHeader`, `TableBorder`
- `PageLayout`, `LabelTemplate` (旧), `ResourceAsset`, `LabelInstance`, `RuntimeElement`

### 1.3 页面尺寸预设

```typescript
const PAGE_SIZE_PRESETS: PageSizePreset[] = [
  { id: 'a4-portrait', name: 'A4 Portrait', widthMm: 210, heightMm: 297 },
  { id: 'a4-landscape', name: 'A4 Landscape', widthMm: 297, heightMm: 210 },
  { id: 'a5-portrait', name: 'A5 Portrait', widthMm: 148, heightMm: 210 },
  { id: 'a5-landscape', name: 'A5 Landscape', widthMm: 210, heightMm: 148 },
  { id: 'letter-portrait', name: 'Letter Portrait', widthMm: 216, heightMm: 279 },
  { id: 'letter-landscape', name: 'Letter Landscape', widthMm: 279, heightMm: 216 },
  { id: 'custom', name: 'Custom Size', widthMm: 100, heightMm: 100 }
];
```

## 2. 编辑器修改

### 2.1 属性面板 (LabelTemplate 设置)

移除 Document 属性区域的添加页、复制页按钮。

**保留的标签设置：**

| 字段 | 类型 | 说明 |
|------|------|------|
| 纸张预设 | dropdown | 选择预设尺寸 |
| 方向 | radio | portrait / landscape |
| 宽度 | number (mm) | 标签宽度 |
| 高度 | number (mm) | 标签高度 |
| 背景颜色 | color picker | 背景色 |
| 背景图片 | file upload | 上传背景图 |

### 2.2 顶部工具栏

- 添加「打印设置」按钮（icon: SettingOutlined）
- 点击弹出打印设置对话框

### 2.3 打印设置对话框

| 字段 | 类型 | 默认值 |
|------|------|--------|
| 纸张大小 | dropdown | A4 |
| 方向 | radio | portrait |
| 上边距 | number (mm) | 0 |
| 下边距 | number (mm) | 0 |
| 左边距 | number (mm) | 0 |
| 右边距 | number (mm) | 0 |
| 标签横向间距 | number (mm) | 0 |
| 标签纵向间距 | number (mm) | 0 |

### 2.4 Barcode/QRCode 元素

使用 `fabric.Image` 作为载体，存储以下自定义属性：

```typescript
interface BarcodeFabricObject {
  elementType: 'barcode';
  bindingValue: string;      // 如 "${productNO}"
  barcodeFormat: 'CODE128' | 'EAN13' | 'CODE39';
  showText: boolean;
}

interface QRCodeFabricObject {
  elementType: 'qrcode';
  bindingValue: string;      // 如 "${productNO}"
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
}
```

**预览机制：**
- 用户输入 `${fieldName}` 作为绑定值
- 预览时直接用 `${fieldName}` 文本生成条码/二维码图片显示
- 打印时解析并替换为实际数据

**扩展 toObject：**
```typescript
img.toObject = (function(originalToObject) {
  return function() {
    return fabric.util.object.extend(originalToObject.call(this), {
      elementType: this.elementType,
      bindingValue: this.bindingValue,
      barcodeFormat: this.barcodeFormat,
      showText: this.showText,
      errorCorrectionLevel: this.errorCorrectionLevel
    });
  };
})(img.toObject);
```

## 3. 批量打印流程

### 3.1 输入

- 用户选择 LabelTemplate
- 用户粘贴 JSON 数据数组（已在其他 branch 实现）

### 3.2 排版计算

```typescript
function calculateLayout(
  paperWidth: number,
  paperHeight: number,
  labelWidth: number,
  labelHeight: number,
  printSetting: PrintSetting
): { colsPerRow: number; rowsPerColumn: number; labelsPerPage: number } {
  const { orientation, marginTop, marginBottom, marginLeft, marginRight, gapX, gapY } = printSetting;

  // A4 横纵向互换
  const effectivePaperWidth = orientation === 'landscape' ? paperHeight : paperWidth;
  const effectivePaperHeight = orientation === 'portrait' ? paperHeight : paperWidth;

  const availableWidth = effectivePaperWidth - marginLeft - marginRight;
  const availableHeight = effectivePaperHeight - marginTop - marginBottom;

  const colsPerRow = Math.floor((availableWidth + gapX) / (labelWidth + gapX));
  const rowsPerColumn = Math.floor((availableHeight + gapY) / (labelHeight + gapY));
  const labelsPerPage = colsPerRow * rowsPerColumn;

  return { colsPerRow, rowsPerColumn, labelsPerPage };
}
```

### 3.3 标签生成

对每条 JSON 数据记录：

1. 复制 LabelTemplate 的 canvasJson
2. 遍历所有对象：
   - **文本对象**: 替换 `${fieldName}` 为实际值
   - **Barcode 对象**: 根据 `bindingValue` 替换，生成 PNG 图片替换 src
   - **QRCode 对象**: 根据 `bindingValue` 替换，生成 SVG 转 DataURL 替换 src
3. 渲染到 PDF 指定位置

### 3.4 绑定替换逻辑

```typescript
function resolveBinding(value: string, data: Record<string, any>): string {
  return value.replace(/\$\{(\w+)\}/g, (_, field) => data[field] ?? '');
}

function resolveObject(obj: any, data: Record<string, any>): any {
  // 处理文本
  if (obj.text) {
    obj.text = resolveBinding(obj.text, data);
  }
  // 处理自定义绑定值
  if (obj.bindingValue) {
    obj.bindingValue = resolveBinding(obj.bindingValue, data);
  }
  return obj;
}
```

### 3.5 条码/二维码生成

**Barcode (JsBarcode):**
```typescript
function generateBarcode(format: string, value: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, { format });
  return canvas.toDataURL('image/png');
}
```

**QRCode (qrcode library):**
```typescript
function generateQRCode(value: string, size: number): string {
  const svg = QRCode.generateSVG(value, { width: size });
  // SVG 转 DataURL
  return 'data:image/svg+xml;base64,' + btoa(svg);
}
```

## 4. 文件变更

### 4.1 新建文件

- `src/app/editor/models/template.models.ts` - 新的 LabelTemplate 和 PrintSetting 定义
- `src/app/editor/dialogs/print-setting-dialog/` - 打印设置对话框组件
- `src/app/print/print.service.ts` - 批量打印服务
- `src/app/print/barcode-generator.ts` - 条码/二维码生成器

### 4.2 删除/重构文件

- `src/app/editor/models/label.models.ts` - 删除旧模型，保留必要常量
- `src/app/template/template.service.ts` - 适配新的 LabelTemplate 模型
- `src/app/template/template.storage.ts` - 适配新的 LabelTemplate 模型
- `src/app/editor/editor-properties-panel.*` - 移除多页相关 UI
- `src/app/editor/editor-pdf.service.ts` - 可保留或合并到 print.service.ts

### 4.3 修改文件

- `src/app/editor/editor.ts` - 适配单页架构，添加打印设置逻辑
- `src/app/editor/editor-canvas.service.ts` - 完善 Barcode/QRCode 自定义属性
- `src/app/editor/editor-topbar.*` - 添加打印设置按钮

## 5. 实现顺序

1. **模型重构** - 定义新的 LabelTemplate 和 PrintSetting
2. **编辑器基础调整** - 移除多页相关逻辑
3. **打印设置对话框** - UI 和保存逻辑
4. **Barcode/QRCode 元素** - 自定义属性和预览
5. **批量打印服务** - 排版计算和 PDF 生成

## 6. 依赖库

- `jsbarcode` - Barcode 生成
- `qrcode` - QRCode 生成
- `jspdf` - PDF 生成（已有）