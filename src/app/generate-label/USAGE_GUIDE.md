# 标签生成功能使用说明

## 功能概述

标签生成功能允许用户根据已创建的模板，通过输入产品信息和批次数据，自动生成标签数据，并支持打印和导出功能。

## 工作流程

### 1. 进入标签列表画面
- 启动应用后，用户会看到标签模板列表
- 显示所有已保存的模板卡片，包括模板缩略图和更新时间

### 2. 选择模板并打开生成标签对话框
- 在模板卡片上点击"生成标签"按钮
- 系统打开数据输入对话框

## 数据输入对话框

数据输入对话框分为三个部分：

### 第一部分：共同信息部分

这部分包含 8 个必填或可选的字段：

| 字段名 | 说明 | 是否必填 |
|-------|------|--------|
| 产品名 | 标签上显示的产品名称 | 是 |
| 材料编号 | 产品的材料编号 | 是 |
| 材料描述 | 对材料的描述信息 | 否 |
| 客户名称 | 购买客户的名称 | 否 |
| 客户采购订单 | 客户的 PO 号 | 否 |
| 交货时间 | 交货的日期，支持多种格式 | 是 |
| 单位装箱数 | 每箱包含的产品数量 | 是 |
| 位置 | 存储位置或其他位置信息 | 否 |

### 第二部分：批次信息部分

这部分允许添加一条或多条批次信息。每条批次信息包含：

| 字段 | 说明 |
|-----|------|
| 批号 | 批次的编号 |
| 数量 | 该批次的产品数量 |
| 箱数 | 自动计算，根据数量 ÷ 单位装箱数 |
| 起始箱号 | 自动计算，该批次的第一个箱号 |
| 结束箱号 | 自动计算，该批次的最后一个箱号 |

#### 箱号计算规则

- **第一条批次**: 起始箱号 = 1
- **后续批次**: 起始箱号 = 上一条批次的结束箱号 + 1
- **结束箱号** = 起始箱号 + 箱数 - 1

### 第三部分：生产标签数据的设置选项

| 选项 | 说明 |
|-----|------|
| 将多个批次汇总显示 | 如果选中，所有标签上的批号会显示为"第一个批号 - 最后一个批号"的形式 |
| 交货时间显示格式 | 支持四种格式：YYYY-MM-DD、DD/MM/YYYY、MM/DD/YYYY、YYYYMMDD |

## 标签生成逻辑

### 1. 箱数计算

对于每条批次信息：
- 箱数 = ⌈数量 ÷ 单位装箱数⌉（向上取整）

示例：
- 数量=20，单位装箱数=10 → 箱数=2
- 数量=25，单位装箱数=10 → 箱数=3（2 箱完整 + 1 箱余数）

### 2. 标签数据生成

对于每条批次：
- 生成的标签数量 = 该批次的箱数
- 完整箱：单位装箱数保持不变
- 余数箱：单位装箱数 = 数量 % 单位装箱数

示例：
- 数量=25，单位装箱数=10
- 生成 3 条标签：
  - 标签 1: 箱号=N, 单位装箱数=10
  - 标签 2: 箱号=N+1, 单位装箱数=10
  - 标签 3: 箱号=N+2, 单位装箱数=5

### 3. 批号处理

- **不合并**：每条标签上显示当前批次的批号
- **合并**：所有标签上显示"第一个批号 - 最后一个批号"

### 4. 交货时间格式化

根据选择的格式转换交货日期：
- YYYY-MM-DD: 2026-05-26
- DD/MM/YYYY: 26/05/2026
- MM/DD/YYYY: 05/26/2026
- YYYYMMDD: 20260526

## 打印和导出

在成功生成标签后，系统会提示选择后续操作：

### 打印标签
- 调用浏览器打印功能
- 用户可预览并选择打印机进行打印

### 导出 CSV
- 导出为 CSV 格式，便于在 Excel 中打开和编辑
- 包含所有标签字段

### 导出 JSON
- 导出为 JSON 格式，便于程序集成
- 保存完整的标签数据结构

### 导出 PDF
- 导出为 PDF 格式，保持视觉一致性
- 便于分发和存档

## 生成的标签数据格式

```json
[
  {
    "productName": "产品A",
    "materialNumber": "MAT001",
    "materialDescription": "材料描述",
    "customerName": "客户1",
    "customerPO": "PO001",
    "deliveryDate": "2026-05-26",
    "unitsPerBox": 10,
    "location": "仓库1",
    "batchNumber": "B001",
    "boxNumber": 1
  },
  {
    "productName": "产品A",
    "materialNumber": "MAT001",
    "materialDescription": "材料描述",
    "customerName": "客户1",
    "customerPO": "PO001",
    "deliveryDate": "2026-05-26",
    "unitsPerBox": 5,
    "location": "仓库1",
    "batchNumber": "B001",
    "boxNumber": 2
  }
]
```

## 使用场景示例

### 场景 1：单批次，数量为完整的箱数

**输入：**
- 产品名：产品A
- 单位装箱数：10
- 批号：B001
- 数量：30

**生成结果：**
- 3 条标签（30 ÷ 10 = 3 箱）
- 所有标签的箱号：1, 2, 3
- 所有标签的单位装箱数：10

### 场景 2：单批次，数量含有余数

**输入：**
- 产品名：产品A
- 单位装箱数：10
- 批号：B001
- 数量：25

**生成结果：**
- 3 条标签（25 ÷ 10 = 2 余 5）
- 箱号：1, 2, 3
- 单位装箱数：10, 10, 5

### 场景 3：多批次，启用批号合并

**输入：**
- 产品名：产品A
- 单位装箱数：10
- 批次信息：
  - 批号：B001，数量：15
  - 批号：B002，数量：10
- 启用"将多个批次汇总显示"

**生成结果：**
- 3 条标签
- 所有标签的批号：B001 - B002
- 箱号：1, 2, 3

## 故障排除

### 问题：对话框无法打开

**解决方案：**
1. 确保选择了一个有效的模板
2. 刷新页面重试

### 问题：生成的标签数据不符合预期

**解决方案：**
1. 检查输入的"单位装箱数"是否正确
2. 检查批次信息中的"数量"字段
3. 验证计算结果是否符合公式：箱数 = ⌈数量 ÷ 单位装箱数⌉

### 问题：导出文件无法下载

**解决方案：**
1. 检查浏览器的下载设置
2. 尝试使用不同的导出格式
3. 清空浏览器缓存后重试

## 技术细节

### 核心服务

- `LabelGenerationService`: 负责标签数据生成的核心业务逻辑
- `LabelPrintService`: 处理打印和导出功能
- `GenerateLabelDialogComponent`: 数据输入对话框 UI 组件

### 数据模型

- `CommonLabelData`: 共同信息的数据模型
- `BatchInfo`: 批次信息的数据模型
- `GeneratedLabel`: 生成的标签数据模型
- `GenerateLabelOptions`: 生成选项的数据模型

## API 使用示例

### 生成标签

```typescript
import { LabelGenerationService } from './generate-label/label-generation.service';

constructor(private labelGenerationService: LabelGenerationService) {}

generateLabels() {
  const input = {
    commonData: { /* ... */ },
    batchInfos: [ /* ... */ ],
    options: { /* ... */ }
  };

  const validation = this.labelGenerationService.validateInput(input);
  if (!validation.valid) {
    console.error('验证失败:', validation.errors);
    return;
  }

  const result = this.labelGenerationService.generateLabels(input);
  console.log(`生成了 ${result.totalLabels} 条标签`);
}
```

### 打印标签

```typescript
import { LabelPrintService } from './generate-label/label-print.service';

constructor(private labelPrintService: LabelPrintService) {}

printLabels(labels: GeneratedLabel[]) {
  this.labelPrintService.printLabels(labels);
}
```

## 最佳实践

1. **验证输入数据**: 在生成标签前，始终调用 `validateInput()` 方法
2. **处理异常**: 使用 try-catch 捕获生成过程中的异常
3. **提供用户反馈**: 在打印/导出完成后显示成功消息
4. **保存模板**: 定期保存常用模板，以提高工作效率
5. **测试日期格式**: 在实际使用前，测试不同的日期格式是否符合需求
