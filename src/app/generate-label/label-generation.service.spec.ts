import { describe, it, expect, beforeEach } from 'vitest';
import { LabelGenerationService } from './label-generation.service';
import { GenerateLabelInput } from './generate-label.models';

describe('LabelGenerationService', () => {
  let service: LabelGenerationService;

  beforeEach(() => {
    service = new LabelGenerationService();
  });

  describe('generateLabels', () => {
    it('应该为单个批次的完整箱数生成正确的标签', () => {
      const input: GenerateLabelInput = {
        commonData: {
          productName: '产品A',
          materialNumber: 'MAT001',
          materialDescription: '材料描述',
          customerName: '客户1',
          customerPO: 'PO001',
          deliveryDate: '2026-05-26',
          unitsPerBox: 10,
          location: '仓库1'
        },
        batchInfos: [
          {
            id: 'batch1',
            batchNumber: 'B001',
            quantity: 20
          }
        ],
        options: {
          mergeBatchNumbers: false,
          dateFormat: 'YYYY-MM-DD'
        }
      };

      const result = service.generateLabels(input);

      expect(result.totalLabels).toBe(2); // 20 / 10 = 2 箱
      expect(result.labels[0].boxNumber).toBe(1);
      expect(result.labels[0].unitsPerBox).toBe(10);
      expect(result.labels[1].boxNumber).toBe(2);
      expect(result.labels[1].unitsPerBox).toBe(10);
    });

    it('应该为单个批次的余数箱生成正确的标签', () => {
      const input: GenerateLabelInput = {
        commonData: {
          productName: '产品A',
          materialNumber: 'MAT001',
          materialDescription: '材料描述',
          customerName: '客户1',
          customerPO: 'PO001',
          deliveryDate: '2026-05-26',
          unitsPerBox: 10,
          location: '仓库1'
        },
        batchInfos: [
          {
            id: 'batch1',
            batchNumber: 'B001',
            quantity: 25 // 25 / 10 = 2 箱余 5 个
          }
        ],
        options: {
          mergeBatchNumbers: false,
          dateFormat: 'YYYY-MM-DD'
        }
      };

      const result = service.generateLabels(input);

      expect(result.totalLabels).toBe(3); // 2 个完整箱 + 1 个余数箱
      expect(result.labels[0].unitsPerBox).toBe(10);
      expect(result.labels[1].unitsPerBox).toBe(10);
      expect(result.labels[2].unitsPerBox).toBe(5); // 余数箱的单位装箱数为 5
    });

    it('应该正确计算多个批次的箱号', () => {
      const input: GenerateLabelInput = {
        commonData: {
          productName: '产品A',
          materialNumber: 'MAT001',
          materialDescription: '材料描述',
          customerName: '客户1',
          customerPO: 'PO001',
          deliveryDate: '2026-05-26',
          unitsPerBox: 10,
          location: '仓库1'
        },
        batchInfos: [
          {
            id: 'batch1',
            batchNumber: 'B001',
            quantity: 20 // 2 箱
          },
          {
            id: 'batch2',
            batchNumber: 'B002',
            quantity: 15 // 2 箱（10 + 5）
          }
        ],
        options: {
          mergeBatchNumbers: false,
          dateFormat: 'YYYY-MM-DD'
        }
      };

      const result = service.generateLabels(input);

      expect(result.totalLabels).toBe(4); // 2 + 2 = 4 条标签
      expect(result.labels[0].boxNumber).toBe(1); // 第一批的第1箱
      expect(result.labels[1].boxNumber).toBe(2); // 第一批的第2箱
      expect(result.labels[2].boxNumber).toBe(3); // 第二批的第1箱
      expect(result.labels[3].boxNumber).toBe(4); // 第二批的第2箱（余数箱）
    });

    it('应该在mergeBatchNumbers为true时合并批号', () => {
      const input: GenerateLabelInput = {
        commonData: {
          productName: '产品A',
          materialNumber: 'MAT001',
          materialDescription: '材料描述',
          customerName: '客户1',
          customerPO: 'PO001',
          deliveryDate: '2026-05-26',
          unitsPerBox: 10,
          location: '仓库1'
        },
        batchInfos: [
          {
            id: 'batch1',
            batchNumber: 'B001',
            quantity: 10
          },
          {
            id: 'batch2',
            batchNumber: 'B002',
            quantity: 10
          }
        ],
        options: {
          mergeBatchNumbers: true,
          dateFormat: 'YYYY-MM-DD'
        }
      };

      const result = service.generateLabels(input);

      expect(result.labels[0].batchNumber).toBe('B001 - B002');
      expect(result.labels[1].batchNumber).toBe('B001 - B002');
    });

    it('应该正确格式化交货日期', () => {
      const input: GenerateLabelInput = {
        commonData: {
          productName: '产品A',
          materialNumber: 'MAT001',
          materialDescription: '材料描述',
          customerName: '客户1',
          customerPO: 'PO001',
          deliveryDate: '2026-05-26',
          unitsPerBox: 10,
          location: '仓库1'
        },
        batchInfos: [
          {
            id: 'batch1',
            batchNumber: 'B001',
            quantity: 10
          }
        ],
        options: {
          mergeBatchNumbers: false,
          dateFormat: 'DD/MM/YYYY'
        }
      };

      const result = service.generateLabels(input);

      expect(result.labels[0].deliveryDate).toBe('26/05/2026');
    });
  });

  describe('validateInput', () => {
    it('应该验证必填字段', () => {
      const input: GenerateLabelInput = {
        commonData: {
          productName: '',
          materialNumber: '',
          materialDescription: '',
          customerName: '',
          customerPO: '',
          deliveryDate: '',
          unitsPerBox: 0,
          location: ''
        },
        batchInfos: [],
        options: {
          mergeBatchNumbers: false,
          dateFormat: 'YYYY-MM-DD'
        }
      };

      const validation = service.validateInput(input);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('应该验证批次信息不能为空', () => {
      const input: GenerateLabelInput = {
        commonData: {
          productName: '产品A',
          materialNumber: 'MAT001',
          materialDescription: '材料描述',
          customerName: '客户1',
          customerPO: 'PO001',
          deliveryDate: '2026-05-26',
          unitsPerBox: 10,
          location: '仓库1'
        },
        batchInfos: [],
        options: {
          mergeBatchNumbers: false,
          dateFormat: 'YYYY-MM-DD'
        }
      };

      const validation = service.validateInput(input);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('批次'))).toBe(true);
    });
  });
});
