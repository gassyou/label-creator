# 标签模板管理功能设计文档

## 1. 概述

实现标签模板管理功能，支持模板的增删改查，为未来批量打印功能预留数据结构。

### 1.1 功能场景

- **添加模板**：点击添加按钮 → 进入设计器 → 保存返回列表
- **编辑模板**：选择模板 → 点击编辑 → 进入设计器 → 保存返回列表
- **删除模板**：选择模板 → 点击删除 → 确认后删除

### 1.2 存储方案

- 使用 localStorage
- 抽象 `TemplateStorageService` 接口，未来可切换为 HTTP 服务端存储

---

## 2. 数据模型

### 2.1 统一文档结构

```typescript
// 页面结构
export interface LabelPage {
  id: string;
  name: string;
  templateId?: string;
  layoutId?: string;
  widthMm: number;
  heightMm: number;
  backgroundColor: string;
  backgroundImage?: string;
  canvasJson?: string;      // Fabric 运行时数据，编辑时使用
  elements?: LabelElement[]; // 语义化元素，批量打印时使用
}

// 完整文档
export interface LabelDocument {
  id: string;
  name: string;
  version: string;
  layouts: PageLayout[];
  templates: LabelTemplate[];
  pages: LabelPage[];
  resources: ResourceAsset[];
}
```

### 2.2 存储的模板结构

```typescript
interface StoredTemplate {
  id: string;
  name: string;
  thumbnail?: string;         // 200x200 base64 缩略图
  document: LabelDocument;    // 完整文档结构
  createdAt: string;
  updatedAt: string;
}
```

### 2.3 批量打印支持

`LabelDocument` 结构支持批量打印：

| 结构 | 作用 |
|------|------|
| `templates[].elements[].binding` | `${name}` 绑定字段 |
| `layouts[].rows × columns` | 每页标签数量 |
| `layouts[].paper/orientation` | 纸张大小 |

---

## 3. 服务设计

### 3.1 服务接口

```typescript
@Injectable()
export interface TemplateStorageService {
  getAll(): Observable<StoredTemplate[]>;
  getById(id: string): Observable<StoredTemplate | null>;
  save(template: StoredTemplate): Observable<void>;
  delete(id: string): Observable<void>;
}
```

### 3.2 本地存储实现

```typescript
@Injectable()
export class LocalStorageTemplateService implements TemplateStorageService {
  private readonly STORAGE_KEY = 'label-templates';

  getAll(): Observable<StoredTemplate[]> { ... }
  getById(id: string): Observable<StoredTemplate | null> { ... }
  save(template: StoredTemplate): Observable<void> { ... }
  delete(id: string): Observable<void> { ... }
}
```

### 3.3 主服务（组件使用）

```typescript
@Injectable({ providedIn: 'root' })
export class TemplateService {
  constructor(private storage: TemplateStorageService) {}

  getTemplates(): Observable<StoredTemplate[]>
  getTemplate(id: string): Observable<StoredTemplate | null>
  saveTemplate(template: StoredTemplate): Observable<void>
  deleteTemplate(id: string): Observable<void>
  generateThumbnail(document: LabelDocument): string  // 生成缩略图
}
```

### 3.4 切换到服务端

只需在 `app.config.ts` 中替换注入：

```typescript
// 当前
{ provide: TemplateStorageService, useClass: LocalStorageTemplateService }

// 未来
{ provide: TemplateStorageService, useClass: HttpTemplateStorageService }
```

---

## 4. 组件设计

### 4.1 模板列表页 (TemplateListComponent)

**路由**: `/` (首页)

**功能**:
- 卡片网格展示模板（200x200 缩略图）
- 新建按钮 → 跳转 `/editor`
- 编辑按钮 → 跳转 `/editor/:id`
- 删除按钮 → 确认对话框

**布局**: ng-zorro `nz-card` 网格布局

### 4.2 设计器页面 (EditorComponent)

**路由**:
- `/editor` - 新建模板
- `/editor/:id` - 编辑模板

**功能**:
- 保存时生成缩略图
- 保存到 localStorage
- 返回按钮 → 回到列表页

---

## 5. 路由配置

```typescript
const routes: Routes = [
  { path: '', component: TemplateListComponent },
  { path: 'editor', component: EditorComponent },
  { path: 'editor/:id', component: EditorComponent },
];
```

---

## 6. 模型文件简化

### 6.1 合并 `editor.models.ts` 到 `label.models.ts`

**移除**:
- `EditorPage` → 使用 `LabelPage`
- `EditorDocumentState` → 使用 `EditorState`（仅运行时）
- `EditorCanvasState` → 合并到 `LabelPage`

**保留**（仅编辑器内部使用）:
- `EditorSelectionState`
- `EditorTool`
- `PAGE_SIZE_PRESETS`

### 6.2 最终文件结构

```
src/app/editor/
├── models/
│   └── label.models.ts  ← 统一模型文件
├── editor.ts
├── editor-canvas.service.ts
├── editor-pdf.service.ts
└── ...

src/app/template/
├── template-list/
│   ├── template-list.ts
│   ├── template-list.html
│   └── template-list.scss
├── template.service.ts  ← TemplateService
└── template.storage.ts  ← LocalStorageTemplateService
```

---

## 7. 实现计划

### Phase 1: 模型简化
1. 合并 `label.models.ts` 和 `editor.models.ts`
2. 更新所有引用

### Phase 2: 存储服务
1. 创建 `TemplateStorageService` 接口
2. 实现 `LocalStorageTemplateService`
3. 创建 `TemplateService`

### Phase 3: 模板列表页
1. 创建 `TemplateListComponent`
2. 实现卡片视图
3. 实现增删操作

### Phase 4: 编辑器集成
1. 添加路由参数支持
2. 保存时生成缩略图
3. 保存到 localStorage
4. 返回按钮功能

---

## 8. 技术选型

- **UI 组件**: ng-zorro-antd
- **存储**: localStorage
- **缩略图**: Canvas toDataURL 生成 base64
- **架构**: 依赖注入，可切换存储实现