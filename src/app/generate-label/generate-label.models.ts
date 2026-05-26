/**
 * 标签生成相关的数据模型
 */

/**
 * 共同信息表单数据
 */
export interface CommonLabelData {
  productName: string;
  materialNumber: string;
  materialDescription: string;
  customerName: string;
  customerPO: string;
  deliveryDate: string;
  unitsPerBox: number;
  location: string;
}

/**
 * 批次信息
 */
export interface BatchInfo {
  id?: string;
  batchNumber: string;
  quantity: number;
  boxes?: number; // 自动计算：quantity / unitsPerBox
  startBoxNumber?: number;
  endBoxNumber?: number;
}

/**
 * 生成标签的配置选项
 */
export interface GenerateLabelOptions {
  mergeBatchNumbers: boolean; // 是否将多个批次汇总显示
  dateFormat: 'yyyy-MM-dd' | 'dd/MM/yyyy' | 'mm/dd/yyyy' | 'yyyyMMdd' | 'yyyy年 MM月 dd日' | 'yyyy年M月d日';
}

/**
 * 生成的标签数据行
 */
export interface GeneratedLabel {
  产品名: string;
  材料编号: string;
  材料描述: string;
  客户名称: string;
  客户采购订单: string;
  交货时间: string;
  单位装箱数: number;
  位子: string;
  批号: string;
}

/**
 * 生成标签的输入数据
 */
export interface GenerateLabelInput {
  commonData: CommonLabelData;
  batchInfos: BatchInfo[];
  options: GenerateLabelOptions;
}

/**
 * 生成标签的结果
 */
export interface GenerateLabelResult {
  labels: GeneratedLabel[];
  totalLabels: number;
  totalBoxes: number;
}
