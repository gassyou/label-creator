
# Fabric 标签模板设计器详细设计文档

## 1. 设计目标

本设计文档用于指导基于 Fabric.js 的工业级标签模板设计器开发。

系统目标：

- 支持 A4、热敏纸、连续纸等多种打印介质
- 支持单页多标签排版
- 支持标签模板复用
- 支持打印预览
- 支持 PDF/SVG/PNG/Canvas 多种输出
- 支持 Undo/Redo
- 支持运行时动态数据绑定
- 支持动态表格
- 支持批量打印
- 支持复杂分页布局

---

# 2. 总体架构

系统采用四层架构：

```text
Document Model
    ↓
Runtime Engine
    ↓
Layout Engine
    ↓
Renderer
```

详细结构：

```text
Template DSL
    +
Business Data
    ↓
BindingResolver
    ↓
Runtime Instance Tree
    ↓
Layout Engine
    ↓
Pagination
    ↓
Renderer
    ↓
Fabric/PDF/SVG/ZPL
```

---

# 3. 核心设计思想

系统采用三层模型：

## 3.1 Layout Model（布局模型）

负责：

- 纸张大小
- 页面方向
- 页边距
- 标签排列
- 分页

## 3.2 Template Model（模板模型）

负责：

- 单个标签结构
- 元素定义
- 数据绑定
- 样式定义

## 3.3 Render Model（渲染模型）

负责：

- Fabric Canvas 渲染
- PDF 渲染
- SVG 渲染

---

# 4. 为什么不能直接保存 Fabric JSON

Fabric JSON 不适合作为主数据模型。

原因：

- 强依赖 Fabric 版本
- 缺失业务语义
- 难以迁移到 PDF
- 后端难以消费
- 难以实现模板复用
- 难以做 Runtime Binding

正确做法：

```text
Document Model
    才是真正主数据
```

Fabric：

```text
只是运行时渲染层
```

---

# 5. 标签模板设计原则

标签模板：

```text
只描述单个标签
```

例如：

- 商品名
- 二维码
- 条形码
- 文本
- 图形
- 图片
- 背景颜色

不包含：

- A4
- 2x2 排版
- 页边距
- 打印方向

这些属于 Layout。

---

# 6. 页面布局设计原则

页面布局负责：

- A4
- portrait
- landscape
- 2x2
- 3x8
- gap
- margin

布局与模板必须解耦。

---

# 7. 推荐数据结构

```text
TemplateDocument
 ├── layouts
 ├── templates
 ├── pages
 └── resources
```

---

# 8. Layout Model

```ts
interface PageLayout {

  paper: 'A4';

  orientation: 'portrait' | 'landscape';

  rows: number;

  columns: number;

  marginTop: number;

  marginLeft: number;

  gapX: number;

  gapY: number;
}
```

---

# 9. LabelTemplate

```ts
interface LabelTemplate {

  id: string;

  width: number;

  height: number;

  background?: string;

  elements: BaseElement[];
}
```

---

# 10. Graphic Element System

标签元素统一抽象为：

```text
Graphic Element
```

推荐结构：

```text
BaseElement
 ├── ShapeElement
 │      ├── RectElement
 │      ├── CircleElement
 │      ├── TriangleElement
 │      └── LineElement
 │
 └── ContentElement
        ├── TextElement
        ├── BarcodeElement
        ├── QRCodeElement
        ├── ImageElement
        └── TableElement
```

---

# 11. BaseElement

```ts
interface BaseElement {

  id: string;

  type: ElementType;

  x: number;

  y: number;

  width: number;

  height: number;

  rotation?: number;

  visible?: boolean;

  lock?: boolean;

  zIndex?: number;

  opacity?: number;
}
```

---

# 12. Shape Elements

## RectElement

```ts
interface RectElement extends BaseElement {

  type: 'rect';

  fill?: string;

  stroke?: string;

  strokeWidth?: number;

  radius?: number;
}
```

## CircleElement

```ts
interface CircleElement extends BaseElement {

  type: 'circle';
}
```

## TriangleElement

```ts
interface TriangleElement extends BaseElement {

  type: 'triangle';
}
```

## LineElement

```ts
interface LineElement extends BaseElement {

  type: 'line';

  x1: number;
  y1: number;

  x2: number;
  y2: number;

  stroke: string;

  strokeWidth: number;
}
```

---

# 13. TextElement

```ts
interface TextElement extends BaseElement {

  type: 'text';

  text?: string;

  binding?: string;

  fontSize: number;

  fontFamily: string;

  fontWeight?: string;

  align?: 'left' | 'center' | 'right';

  color?: string;
}
```

---

# 14. BarcodeElement

```ts
interface BarcodeElement extends BaseElement {

  type: 'barcode';

  format:
    | 'CODE128'
    | 'EAN13'
    | 'CODE39';

  value?: string;

  binding?: string;

  showText?: boolean;
}
```

---

# 15. QRCodeElement

```ts
interface QRCodeElement extends BaseElement {

  type: 'qrcode';

  value?: string;

  binding?: string;

  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';

  foregroundColor?: string;

  backgroundColor?: string;
}
```

---

# 16. BindingResolver 设计

BindingResolver：

```text
负责将模板表达式解析为真实数据
```

例如：

模板：

```text
${name}
```

业务数据：

```json
{
  "name": "张三"
}
```

运行结果：

```text
张三
```

---

# 17. 模板表达式机制

支持：

## 简单变量

```text
${name}
```

## 多变量

```text
${name}-${age}
```

## 前后拼接

```text
po:${productOrder}
```

## 表达式

```text
${price * qty}
```

## 函数

```text
${upper(name)}
```

---

# 18. BindingResolver 推荐架构

```text
BindingResolver
 ├── VariableResolver
 ├── ExpressionResolver
 ├── FunctionResolver
 └── Formatter
```

---

# 19. BindingResolver 示例实现

```ts
function resolveTemplate(
  template: string,
  data: Record<string, any>
) {

  return template.replace(
    /\$\{(.*?)\}/g,
    (_, key) => {
      return data[key.trim()] ?? '';
    }
  );
}
```

---

# 20. 二维码运行机制

模板：

```ts
{
  type: 'qrcode',

  value: 'po:${productOrder}'
}
```

业务数据：

```json
{
  "productOrder": "A0001"
}
```

BindingResolver 输出：

```text
po:A0001
```

QRCodeRenderer：

```text
生成二维码图片
```

然后：

```text
放入模板指定位置和大小
```

---

# 21. Runtime Element

模板元素：

```ts
{
  type: 'text',
  binding: '${name}'
}
```

运行时：

```ts
{
  type: 'text',
  value: '张三'
}
```

---

# 22. LabelInstance

```ts
interface LabelInstance {

  id: string;

  templateId: string;

  recordId: string;

  resolvedElements: RuntimeElement[];
}
```

---

# 23. 批量生成标签

运行流程：

```text
Template
    +
Business Data
    ↓
BindingResolver
    ↓
LabelInstance
    ↓
LayoutEngine
    ↓
Renderer
```

---

# 24. 分页机制

例如：

A4 2x2

每页：

```text
4 labels
```

如果：

```text
1000 records
```

自动：

```text
250 pages
```

---

# 25. Runtime Engine

推荐：

```text
TemplateEngine
 ├── BindingResolver
 ├── ExpressionResolver
 ├── LayoutEngine
 ├── PaginationEngine
 └── RenderEngine
```

---

# 26. Renderer 架构

```text
RenderEngine
 ├── FabricRenderer
 ├── PDFRenderer
 ├── SVGRenderer
```

---

# 27. Fabric Renderer

Fabric 只负责：

- 拖拽
- 缩放
- 旋转
- 对齐
- hover
- selection

Fabric 不负责：

- 主数据
- 业务语义
- 模板存储

---

# 28. TableElement（动态表格）

表格不是普通元素。

而是：

```text
Repeat Container
```

---

# 29. TableElement 模型

```ts
interface TableElement extends BaseElement {

  type: 'table';

  dataSource: string;

  columns: TableColumn[];

  rowHeight?: number;

  header?: TableHeader;

  border?: TableBorder;
}
```

---

# 30. TableColumn

```ts
interface TableColumn {

  title: string;

  field: string;

  width: number;

  align?: 'left' | 'center' | 'right';

  formatter?: string;
}
```

---

# 31. Table Binding 示例

业务数据：

```json
{
  "items": [
    {
      "name": "苹果",
      "qty": 2,
      "price": 10
    },
    {
      "name": "香蕉",
      "qty": 3,
      "price": 5
    }
  ]
}
```

模板：

```ts
{
  type: 'table',

  dataSource: 'items'
}
```

---

# 32. Runtime Table

运行时：

```ts
{
  rows: [
    ['苹果', 2, 10],
    ['香蕉', 3, 5]
  ]
}
```

---

# 33. Table Renderer

```text
TableRenderer
 ├── HeaderRenderer
 ├── RowRenderer
 └── CellRenderer
```

最终：

```text
转换为 Primitive Elements
```

---

# 34. Dynamic Layout Engine

复杂表格必须支持：

- 自动分页
- 自动换页
- 表头重复
- 动态行高
- 自动截断

---

# 35. Command System

所有操作必须通过 Command：

```text
MoveElementCommand
ResizeElementCommand
DeleteElementCommand
CreateQRCodeCommand
```

这样才能支持：

- Undo/Redo
- 协同编辑
- 历史记录

---

# 36. 推荐目录结构

```text
/editor
   /models
   /renderers
   /fabric
   /commands
   /services
   /panels
   /engines
```

---

# 37. 单位系统

业务层：

```text
统一使用 mm
```

Fabric：

```text
使用 pixel
```

转换：

```text
pixel = mm * DPI / 25.4
```

---

# 38. A4 四联标签最佳实践

推荐：

LabelTemplate：

```text
95mm x 140mm
```

Layout：

```text
A4
portrait
2x2
```

设计器：

```text
只编辑单个 LabelTemplate
```

预览时：

```text
自动生成 4 个 placement
```

---

# 39. 最终工业级架构总结

真正成熟的标签系统：

```text
Template DSL
    +
Business Data
    ↓
BindingResolver
    ↓
Runtime Instance Tree
    ↓
Layout Engine
    ↓
Pagination
    ↓
Renderer
    ↓
Fabric/PDF/SVG
```

核心思想：

- Template 描述结构
- Data 提供内容
- Runtime Engine 负责实例化
- Layout Engine 负责分页
- Renderer 负责渲染
- Fabric 负责交互
