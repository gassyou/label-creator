import { Injectable } from '@angular/core';
import {
  CommonLabelData,
  BatchInfo,
  GenerateLabelOptions,
  GeneratedLabel,
  GenerateLabelInput,
  GenerateLabelResult
} from './generate-label.models';

/**
 * 标签生成服务
 * 负责核心的标签数据生成逻辑
 */
@Injectable({ providedIn: 'root' })
export class LabelGenerationService {
  /**
   * 生成标签数据
   *
   * 逻辑说明：
   * 1. 根据每条批次信息中的数量和单位装箱数，计算箱数和箱号
   * 2. 为每条批次生成对应的标签数据
   * 3. 处理余数箱的单位装箱数
   * 4. 格式化交货时间
   * 5. 根据配置处理批号合并
   */
  generateLabels(input: GenerateLabelInput): GenerateLabelResult {
    const { commonData, batchInfos, options } = input;

    // 1. 先计算所有批次的箱数和箱号
    const processedBatches = this.processBatchInfo(batchInfos, commonData.unitsPerBox);

    // 2. 根据批次信息生成标签数据
    const labels: GeneratedLabel[] = [];
    let totalBoxes = 0;

    for (let batchIndex = 0; batchIndex < processedBatches.length; batchIndex++) {
      const batch = processedBatches[batchIndex];
      const batchLabels = this.generateLabelsForBatch(
        batch,
        commonData,
        options,
        processedBatches,
        batchIndex
      );
      labels.push(...batchLabels);
      totalBoxes += batch.boxes || 0;
    }

    return {
      labels,
      totalLabels: labels.length,
      totalBoxes
    };
  }

  /**
   * 处理批次信息，计算箱数和箱号
   */
  private processBatchInfo(batchInfos: BatchInfo[], unitsPerBox: number): BatchInfo[] {
    const processed: BatchInfo[] = [];
    let currentBoxNumber = 1;

    for (const batch of batchInfos) {
      // 计算该批次的箱数：quantity / unitsPerBox
      const boxes = Math.ceil(batch.quantity / unitsPerBox);

      const processedBatch: BatchInfo = {
        ...batch,
        boxes,
        startBoxNumber: currentBoxNumber,
        endBoxNumber: currentBoxNumber + boxes - 1
      };

      processed.push(processedBatch);

      // 更新下一个批次的起始箱号
      currentBoxNumber = (processedBatch.endBoxNumber || 0) + 1;
    }

    return processed;
  }

  /**
   * 为单个批次生成标签数据
   */
  private generateLabelsForBatch(
    batch: BatchInfo,
    commonData: CommonLabelData,
    options: GenerateLabelOptions,
    allBatches: BatchInfo[],
    batchIndex: number
  ): GeneratedLabel[] {
    const labels: GeneratedLabel[] = [];
    const quantity = batch.quantity;
    const unitsPerBox = commonData.unitsPerBox;

    // 计算完整箱数和余数
    const fullBoxes = Math.floor(quantity / unitsPerBox);
    const remainder = quantity % unitsPerBox;

    // 生成完整箱的标签
    for (let i = 0; i < fullBoxes; i++) {
      const label = this.createLabel(
        batch,
        commonData,
        options,
        allBatches,
        batchIndex,
        unitsPerBox
      );
      labels.push(label);
    }

    // 如果有余数，生成余数箱的标签
    if (remainder > 0) {
      const label = this.createLabel(
        batch,
        commonData,
        options,
        allBatches,
        batchIndex,
        remainder
      );
      labels.push(label);
    }

    return labels;
  }

  /**
   * 创建单条标签数据
   */
  private createLabel(
    batch: BatchInfo,
    commonData: CommonLabelData,
    options: GenerateLabelOptions,
    allBatches: BatchInfo[],
    batchIndex: number,
    unitsPerBox: number
  ): GeneratedLabel {
    // 处理批号：如果配置了合并批号，则显示第一个和最后一个批号的组合
    let batchNumber = batch.batchNumber;
    if (options.mergeBatchNumbers && allBatches.length > 1) {
      const firstBatch = allBatches[0];
      const lastBatch = allBatches[allBatches.length - 1];
      batchNumber = `${firstBatch.batchNumber} - ${lastBatch.batchNumber}`;
    }

    // 格式化交货时间
    const deliveryDate = this.formatDate(commonData.deliveryDate, options.dateFormat);

    return {
      产品名: commonData.productName,
      材料编号: commonData.materialNumber,
      材料描述: commonData.materialDescription,
      客户名称: commonData.customerName,
      客户采购订单: commonData.customerPO,
      交货时间: deliveryDate,
      单位装箱数: unitsPerBox,
      位子: commonData.location,
      批号: batchNumber
    };
  }

  /**
   * 格式化日期
   */
  private formatDate(
    dateString: string,
    format: 'yyyy-MM-dd' | 'dd/MM/yyyy' | 'mm/dd/yyyy' | 'yyyyMMdd' | 'yyyy年 MM月 dd日' | 'yyyy年M月d日'
  ): string {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString; // 如果日期无效，返回原值
      }

      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();

      switch (format) {
        case 'yyyy-MM-dd':
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        case 'dd/MM/yyyy':
          return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        case 'mm/dd/yyyy':
          return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
        case 'yyyyMMdd':
          return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
        case 'yyyy年 MM月 dd日':
          return `${year}年 ${String(month).padStart(2, '0')}月 ${String(day).padStart(2, '0')}日`;
        case 'yyyy年M月d日':
          return `${year}年${month}月${day}日`;
        default:
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    } catch {
      return dateString;
    }
  }

  /**
   * 验证输入数据
   */
  validateInput(input: GenerateLabelInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const { commonData, batchInfos } = input;

    // 验证共同信息
    if (!commonData.productName?.trim()) {
      errors.push('产品名不能为空');
    }
    if (!commonData.materialNumber?.trim()) {
      errors.push('材料编号不能为空');
    }
    if (commonData.unitsPerBox <= 0) {
      errors.push('单位装箱数必须大于0');
    }
    if (!commonData.deliveryDate?.trim()) {
      errors.push('交货时间不能为空');
    }

    // 验证批次信息
    if (batchInfos.length === 0) {
      errors.push('至少需要一条批次信息');
    }

    for (let i = 0; i < batchInfos.length; i++) {
      const batch = batchInfos[i];
      if (!batch.batchNumber?.trim()) {
        errors.push(`第${i + 1}条批次信息的批号不能为空`);
      }
      if (batch.quantity <= 0) {
        errors.push(`第${i + 1}条批次信息的数量必须大于0`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
