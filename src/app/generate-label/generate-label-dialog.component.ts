import { Component, OnInit, Input, Output, EventEmitter, computed, inject, signal, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { LabelGenerationService } from './label-generation.service';
import { LabelTemplate } from '../editor/models/label.models';
import {
  BatchInfo,
  GeneratedLabel,
  GenerateLabelInput
} from './generate-label.models';

@Component({
  selector: 'app-generate-label-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzDatePickerModule,
    NzButtonModule,
    NzSelectModule,
    NzTableModule,
    NzCheckboxModule,
    NzSpaceModule,
    NzEmptyModule,
    NzIconModule,
    NzPopoverModule,
    NzRadioModule
  ],
  template: `
    <nz-modal
      [(nzVisible)]="visible"
      nzTitle="生成标签"
      [nzWidth]="1000"
      (nzOnCancel)="handleCancel()"
      [nzOkLoading]="isGenerating()"
    >
      <ng-container *nzModalContent>
      <div class="generate-label-container">
        <!-- 第一部分：共同信息 -->
        <div class="section">
          <h3 class="section-title">
            <span nz-icon nzType="profile"></span>
            共同信息部分
          </h3>
          <form [formGroup]="commonForm" class="form-grid">
            <div class="form-item">
              <label>产品名 <span class="required">*</span></label>
              <input nz-input formControlName="productName" placeholder="请输入产品名" />
            </div>
            <div class="form-item">
              <label>材料编号 <span class="required">*</span></label>
              <input nz-input formControlName="materialNumber" placeholder="请输入材料编号" />
            </div>
            <div class="form-item">
              <label>材料描述</label>
              <input nz-input formControlName="materialDescription" placeholder="请输入材料描述" />
            </div>
            <div class="form-item">
              <label>客户名称</label>
              <input nz-input formControlName="customerName" placeholder="请输入客户名称" />
            </div>
            <div class="form-item">
              <label>客户采购订单</label>
              <input nz-input formControlName="customerPO" placeholder="请输入客户采购订单号" />
            </div>
            <div class="form-item date-field">
              <label>
                交货时间 <span class="required">*</span>
              </label>
              <div class="date-field-content">
                <nz-date-picker
                  formControlName="deliveryDate"
                  [nzFormat]="optionsForm.get('dateFormat')?.value || 'yyyy-MM-dd'"
                  placeholder="选择日期"
                ></nz-date-picker>
                <button
                  nz-button
                  nzType="text"
                  nzSize="small"
                  nz-popover
                  nzPopoverTrigger="click"
                  [nzPopoverContent]="dateFormatTemplate"
                  nzPopoverPlacement="bottomRight"
                >
                  <span nz-icon nzType="setting"></span>
                </button>
              </div>
              <ng-template #dateFormatTemplate>
                <nz-radio-group [ngModel]="optionsForm.get('dateFormat')?.value" (ngModelChange)="setDateFormat($event)" [ngModelOptions]="{standalone: true}">
                  <label nz-radio nzValue="yyyy-MM-dd">yyyy-MM-dd</label>
                  <label nz-radio nzValue="dd/MM/yyyy">dd/MM/yyyy</label>
                  <label nz-radio nzValue="MM/dd/yyyy">MM/dd/yyyy</label>
                  <label nz-radio nzValue="yyyy年 MM月 dd日">yyyy年 MM月 dd日</label>
                  <label nz-radio nzValue="yyyy年M月d日">yyyy年M月d日</label>
                </nz-radio-group>
              </ng-template>
            </div>
            <div class="form-item">
              <label>单位装箱数 <span class="required">*</span></label>
              <input nz-input type="number" formControlName="unitsPerBox" min="1" placeholder="请输入单位装箱数" />
            </div>
            <div class="form-item">
              <label>位置</label>
              <input nz-input formControlName="location" placeholder="请输入位置" />
            </div>
          </form>
        </div>

        <!-- 第二部分：批次信息 -->
        <div class="section">
          <div class="section-header">
            <h3 class="section-title">
              <span nz-icon nzType="unordered-list"></span>
              批次信息
            </h3>
            <button nz-button nzType="primary" nzSize="small" (click)="addBatch()">
              <span nz-icon nzType="plus"></span>
              添加批次
            </button>
          </div>

          @if (batchInfos().length === 0) {
            <nz-empty nzNotFoundContent="暂无批次信息，请添加"></nz-empty>
          } @else {
            <div class="batch-table">
              <table>
                <thead>
                  <tr>
                    <th>批号</th>
                    <th>数量</th>
                    <th>箱数</th>
                    <th>起始箱号</th>
                    <th>结束箱号</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  @for (batch of batchInfos(); track batch.id; let i = $index) {
                    @if (isEditingBatch() === i) {
                      <tr class="edit-row">
                        <td>
                          <input
                            nz-input
                            [(ngModel)]="batch.batchNumber"
                            placeholder="批号"
                          />
                        </td>
                        <td>
                          <input
                            nz-input
                            type="number"
                            [(ngModel)]="batch.quantity"
                            min="1"
                            (ngModelChange)="calculateBoxes(batch)"
                          />
                        </td>
                        <td>{{ batch.boxes }}</td>
                        <td>{{ batch.startBoxNumber }}</td>
                        <td>{{ batch.endBoxNumber }}</td>
                        <td class="actions">
                          <span nz-icon nzType="check" (click)="saveBatch(i)" title="保存"></span>
                          <span nz-icon nzType="close" (click)="cancelEditBatch()" title="取消"></span>
                        </td>
                      </tr>
                    } @else {
                      <tr>
                        <td>{{ batch.batchNumber }}</td>
                        <td>{{ batch.quantity }}</td>
                        <td>{{ batch.boxes }}</td>
                        <td>{{ batch.startBoxNumber }}</td>
                        <td>{{ batch.endBoxNumber }}</td>
                        <td class="actions">
                          <span nz-icon nzType="copy" (click)="copyBatch(batch)" title="复制批次"></span>
                          <span nz-icon nzType="edit" (click)="editBatch(i)" title="编辑"></span>
                          <span nz-icon nzType="delete" (click)="removeBatch(i)" title="删除"></span>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>

            <div class="batch-options">
              <label nz-checkbox
                [ngModel]="optionsForm.get('mergeBatchNumbers')?.value"
                (ngModelChange)="optionsForm.patchValue({mergeBatchNumbers: $event})"
                [ngModelOptions]="{standalone: true}">
                将多个批次汇总显示（仅当有多个批次时有效）
              </label>
            </div>
          }
        </div>
      </div>
      </ng-container>

      <div *nzModalFooter>
        <button nz-button (click)="handleCancel()">取消</button>
        <button nz-button nzType="primary" [nzLoading]="isGenerating()" (click)="generateLabels()">
          生成标签
        </button>
      </div>
    </nz-modal>
  `,
  styles: [`
    .generate-label-container {
      max-height: 70vh;
      overflow-y: auto;
    }

    .section {
      margin-bottom: 20px;

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .section-title {
        margin: 0 0 16px 0;
        font-size: 14px;
        font-weight: 600;
        color: #262626;
        display: flex;
        align-items: center;
        gap: 8px;

        span[nz-icon] {
          color: #1677ff;
        }
      }
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;

      .form-item {
        display: flex;
        flex-direction: column;

        label {
          margin-bottom: 4px;
          font-weight: 500;
          color: #262626;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 4px;

          .required {
            color: #ff4d4f;
          }

          button[nzType="text"] {
            padding: 0 4px;
            height: 20px;
            margin-left: 4px;
          }
        }

        input,
        select,
        nz-date-picker {
          padding: 4px 8px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          font-size: 13px;

          &:focus {
            outline: none;
            border-color: #1677ff;
            box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.2);
          }
        }
      }

      .date-field {
        .date-field-content {
          display: flex;
          align-items: center;
          gap: 8px;

          nz-date-picker {
            flex: 1;
          }

          button[nzType="text"] {
            padding: 4px;
            height: 28px;
            width: 28px;
          }
        }
      }
    }

    .batch-table {
      overflow-x: auto;

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;

        thead {
          background-color: #fafafa;

          th {
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #262626;
            border-bottom: 1px solid #f0f0f0;
          }
        }

        tbody {
          tr {
            border-bottom: 1px solid #f0f0f0;

            &.edit-row {
              background-color: #f6f8fb;
            }

            td {
              padding: 12px;

              input,
              input[type="number"] {
                width: 100%;
                padding: 6px 8px;
                border: 1px solid #d9d9d9;
                border-radius: 4px;
                font-size: 14px;

                &:focus {
                  outline: none;
                  border-color: #1677ff;
                  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.2);
                }
              }

              &.actions {
                span[nz-icon] {
                  cursor: pointer;
                  margin-right: 12px;
                  font-size: 16px;
                  color: #1677ff;

                  &:hover {
                    opacity: 0.8;
                  }

                  &[nzType="delete"] {
                    color: #ff4d4f;
                  }

                  &:last-child {
                    margin-right: 0;
                  }
                }
              }
            }
          }
        }
      }
    }

    [nz-radio] {
      display: block;
      height: 32px;
      line-height: 32px;
    }



    .batch-options {
      margin-top: 12px;
      padding: 8px 12px;
      background-color: #fafafa;
      border-radius: 4px;
    }

    .options-form {
      .checkbox-item {
        margin-bottom: 12px;
      }

      .form-item {
        display: flex;
        flex-direction: column;

        label {
          margin-bottom: 8px;
          font-weight: 500;
          color: #262626;
        }

        select {
          padding: 8px 12px;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          font-size: 14px;

          &:focus {
            outline: none;
            border-color: #1677ff;
            box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.2);
          }
        }
      }
    }
  `]
})
export class GenerateLabelDialogComponent implements OnInit {
  @Input() set visible(value: boolean | Signal<boolean>) {
    if (typeof value === 'boolean') {
      this._visibleSignal.set(value);
    }
  }
  get visible(): boolean {
    return this._visibleSignal();
  }

  @Input() template: LabelTemplate | null = null;
  @Output() labelsGenerated = new EventEmitter<GeneratedLabel[]>();
  @Output() dialogClosed = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly labelGenerationService = inject(LabelGenerationService);
  private readonly message = inject(NzMessageService);

  readonly isGenerating = signal(false);
  readonly batchInfos = signal<BatchInfo[]>([]);
  readonly isEditingBatch = signal<number | null>(null);
  private readonly _visibleSignal = signal(false);

  readonly commonForm = this.createCommonForm();
  readonly optionsForm = this.createOptionsForm();

  private editingBatchBackup: BatchInfo | null = null;

  ngOnInit() {
    this.initializeForm();
  }

  private createCommonForm(): FormGroup {
    return this.fb.group({
      productName: ['', Validators.required],
      materialNumber: ['', Validators.required],
      materialDescription: [''],
      customerName: [''],
      customerPO: [''],
      deliveryDate: ['', Validators.required],
      unitsPerBox: [1, [Validators.required, Validators.min(1)]],
      location: ['']
    });
  }

  private createOptionsForm(): FormGroup {
    return this.fb.group({
      mergeBatchNumbers: [false],
      dateFormat: ['yyyy-MM-dd']
    });
  }

  private initializeForm() {
    // 可根据需要初始化表单数据
    this.batchInfos.set([]);
  }

  setDateFormat(format: string) {
    this.optionsForm.patchValue({ dateFormat: format });
  }

  addBatch() {
    const newBatch: BatchInfo = {
      id: `batch-${Date.now()}`,
      batchNumber: '',
      quantity: 1,
      boxes: 1,
      startBoxNumber: this.calculateNextStartBoxNumber(),
      endBoxNumber: this.calculateNextEndBoxNumber()
    };
    this.batchInfos.update(batches => [...batches, newBatch]);
  }

  removeBatch(index: number) {
    this.batchInfos.update(batches => {
      const newBatches = batches.filter((_, i) => i !== index);
      this.recalculateBoxNumbers(newBatches);
      return newBatches;
    });
  }

  editBatch(index: number) {
    this.editingBatchBackup = { ...this.batchInfos()[index] };
    this.isEditingBatch.set(index);
  }

  cancelEditBatch() {
    if (this.editingBatchBackup && this.isEditingBatch() !== null) {
      const index = this.isEditingBatch() as number;
      this.batchInfos.update(batches => {
        batches[index] = this.editingBatchBackup!;
        return [...batches];
      });
    }
    this.isEditingBatch.set(null);
    this.editingBatchBackup = null;
  }

  saveBatch(index: number) {
    const batch = this.batchInfos()[index];
    if (!batch.batchNumber?.trim()) {
      this.message.error('批号不能为空');
      return;
    }
    if (batch.quantity <= 0) {
      this.message.error('数量必须大于0');
      return;
    }
    this.recalculateBoxNumbers(this.batchInfos());
    this.isEditingBatch.set(null);
    this.editingBatchBackup = null;
  }

  calculateBoxes(batch: BatchInfo) {
    const unitsPerBox = this.commonForm.get('unitsPerBox')?.value || 1;
    batch.boxes = Math.ceil(batch.quantity / unitsPerBox);
    this.recalculateBoxNumbers(this.batchInfos());
  }

  private recalculateBoxNumbers(batches: BatchInfo[]) {
    let currentBoxNumber = 1;
    for (const batch of batches) {
      batch.startBoxNumber = currentBoxNumber;
      batch.endBoxNumber = currentBoxNumber + (batch.boxes || 1) - 1;
      currentBoxNumber = (batch.endBoxNumber || 0) + 1;
    }
  }

  private calculateNextStartBoxNumber(): number {
    const batches = this.batchInfos();
    if (batches.length === 0) {
      return 1;
    }
    const lastBatch = batches[batches.length - 1];
    return (lastBatch.endBoxNumber || 0) + 1;
  }

  private calculateNextEndBoxNumber(): number {
    const unitsPerBox = this.commonForm.get('unitsPerBox')?.value || 1;
    const startBox = this.calculateNextStartBoxNumber();
    return startBox; // 新添加的批次默认只有1箱
  }

  generateLabels() {
    // 验证共同信息表单
    if (this.commonForm.invalid) {
      this.message.error('请填写所有必填项');
      return;
    }

    // 验证批次信息
    if (this.batchInfos().length === 0) {
      this.message.error('请至少添加一条批次信息');
      return;
    }

    // 构建生成标签的输入数据
    const formValue = this.commonForm.value;
    // 将日期对象转换为字符串格式 YYYY-MM-DD
    const deliveryDateStr = formValue.deliveryDate instanceof Date
      ? formValue.deliveryDate.toISOString().split('T')[0]
      : formValue.deliveryDate;

    const input: GenerateLabelInput = {
      commonData: {
        ...formValue,
        deliveryDate: deliveryDateStr || ''
      },
      batchInfos: this.batchInfos(),
      options: this.optionsForm.value
    };

    // 验证输入数据
    const validation = this.labelGenerationService.validateInput(input);
    if (!validation.valid) {
      this.message.error(validation.errors.join('；'));
      return;
    }

    // 生成标签
    this.isGenerating.set(true);
    try {
      const result = this.labelGenerationService.generateLabels(input);
      console.log('生成的标签数据:', JSON.stringify(result.labels, null, 2));
      this.message.success(`成功生成${result.totalLabels}条标签数据`);
      this.labelsGenerated.emit(result.labels);
      this.handleCancel();
    } catch (error) {
      console.error('标签生成失败:', error);
      this.message.error('标签生成失败，请检查输入数据');
    } finally {
      this.isGenerating.set(false);
    }
  }

  copyBatch(batch: BatchInfo) {
    const newStartBox = this.calculateNextStartBoxNumber();
    const newBatch: BatchInfo = {
      id: `batch-${Date.now()}`,
      batchNumber: batch.batchNumber,
      quantity: batch.quantity,
      boxes: batch.boxes,
      startBoxNumber: newStartBox,
      endBoxNumber: newStartBox + (batch.boxes || 1) - 1
    };

    this.batchInfos.update(batches => [...batches, newBatch]);
    this.recalculateBoxNumbers(this.batchInfos());
    this.message.success(`已复制批次: ${batch.batchNumber}`);
  }

  handleCancel() {
    this.dialogClosed.emit();
  }
}
