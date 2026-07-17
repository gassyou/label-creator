import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { TemplateService } from '../template.service';
import { GenerateLabelDialogComponent } from '../../generate-label/generate-label-dialog.component';
import { GeneratedLabel } from '../../generate-label/generate-label.models';
import { LabelTemplate, DEFAULT_PRINT_SETTING } from '../../editor/models';
import { LabelDataBindingService, BindingData } from '../../print/label-data-binding.service';
import { LabelGeneratorService } from '../../print/label-generator.service';

/**
 * 模板列表组件
 * 显示所有已保存的模板卡片，支持新建、编辑、删除操作
 */
@Component({
  selector: 'app-template-list',
  imports: [
    CommonModule,
    NzCardModule,
    NzButtonModule,
    NzIconModule,
    NzTableModule,
    NzDividerModule,
    NzProgressModule,
    NzModalModule,
    GenerateLabelDialogComponent
  ],
  providers: [NzMessageService, NzModalService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="template-list-container">
      <header class="list-header">
        <h1>标签模板</h1>
        <button nz-button nzType="primary" (click)="createTemplate()">
          <span nz-icon nzType="plus"></span>
          添加模板
        </button>
      </header>

      @if (templates().length === 0) {
        <div class="empty-state">
          <span nz-icon nzType="file-text" nzTheme="outline"></span>
          <p>暂无模板</p>
          <button nz-button nzType="primary" (click)="createTemplate()">创建第一个模板</button>
        </div>
      } @else {
        <div class="template-grid">
          @for (template of templates(); track template.id) {
            <nz-card class="template-card" [nzActions]="[actionPrinter, actionEdit, actionDelete]">
              <div class="card-content">
                @if (template.thumbnail) {
                  <div class="thumbnail">
                    <img [src]="template.thumbnail" alt="{{ template.name }}">
                  </div>
                } @else {
                  <div class="thumbnail placeholder">
                    <span nz-icon nzType="file-image" nzTheme="outline"></span>
                  </div>
                }
                <div class="template-info">
                  <h3>{{ template.name }}</h3>
                  <p class="update-time">更新于 {{ template.updatedAt ? formatDate(template.updatedAt) : '-' }}</p>
                </div>
              </div>
              <ng-template #actionPrinter>
                <span nz-icon nzType="printer" (click)="generateLabels(template)"></span>
              </ng-template>
              <ng-template #actionEdit>
                <span nz-icon nzType="edit" (click)="editTemplate(template)"></span>
              </ng-template>
              <ng-template #actionDelete>
                <span nz-icon nzType="delete" (click)="confirmDelete(template)"></span>
              </ng-template>
            </nz-card>
          }
        </div>
      }
    </div>

    <!-- 生成标签对话框 -->
    <app-generate-label-dialog
      [visible]="dialogVisible()"
      [template]="selectedTemplate()"
      (labelsGenerated)="handleLabelsGenerated($event)"
      (dialogClosed)="closeDialog()"
    ></app-generate-label-dialog>

    <!-- PDF 生成进度 -->
    <nz-modal
      [nzVisible]="isGenerating()"
      nzTitle="正在生成 PDF"
      [nzClosable]="false"
      [nzMaskClosable]="false"
      [nzFooter]="null"
      [nzWidth]="420"
    >
      <ng-container *nzModalContent>
        <div class="generate-progress">
          <nz-progress
            [nzPercent]="generateProgress().percent"
            [nzStatus]="generateProgress().percent === 100 ? 'success' : 'active'"
          ></nz-progress>
          <p class="progress-text">
            已生成 {{ generateProgress().completed }} / {{ generateProgress().total }} 个标签（第
            {{ generateProgress().currentPage }} / {{ generateProgress().totalPages }} 页）
          </p>
        </div>
      </ng-container>
    </nz-modal>
  `,
  styles: [`
    .template-list-container {
      padding: 24px;
      min-height: 100vh;
      background: #f0f2f5;
    }

    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;

      h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 0;
      background: white;
      border-radius: 8px;

      span[nz-icon] {
        font-size: 64px;
        color: #bfbfbf;
        margin-bottom: 16px;
      }

      p {
        color: #8c8c8c;
        margin-bottom: 24px;
      }
    }

    .template-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 24px;
    }

    .template-card {
      cursor: pointer;
      transition: box-shadow 0.3s;

      &:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .card-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .thumbnail {
        width: 100%;
        aspect-ratio: 1;
        background: #f5f5f5;
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;

        &.placeholder span[nz-icon] {
          font-size: 48px;
          color: #d9d9d9;
        }

        img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      }

      .template-info {
        h3 {
          margin: 0 0 4px;
          font-size: 16px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .update-time {
          margin: 0;
          font-size: 12px;
          color: #8c8c8c;
        }
      }

      .card-actions {
        display: flex;
        gap: 16px;
        margin-top: 8px;
        padding-top: 12px;
        border-top: 1px solid #f0f0f0;

        span[nz-icon] {
          cursor: pointer;
          font-size: 18px;
          color: #8c8c8c;

          &:hover {
            color: #1677ff;
          }

          &[nzType="delete"]:hover {
            color: #ff4d4f;
          }
        }
      }
    }

    .generate-progress {
      padding: 8px 0;

      .progress-text {
        margin: 12px 0 0;
        text-align: center;
        color: #595959;
        font-size: 13px;
      }
    }
  `]
})
export class TemplateListComponent {
  private readonly templateService = inject(TemplateService);
  private readonly router = inject(Router);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly labelDataBindingService = inject(LabelDataBindingService);
  private readonly labelGeneratorService = inject(LabelGeneratorService);

  readonly templates = signal<LabelTemplate[]>([]);
  readonly dialogVisible = signal(false);
  readonly selectedTemplate = signal<LabelTemplate | null>(null);
  readonly generatedLabels = signal<GeneratedLabel[]>([]);
  readonly isGenerating = signal(false);
  readonly generateProgress = signal<{ completed: number; total: number; currentPage: number; totalPages: number; percent: number }>({
    completed: 0,
    total: 0,
    currentPage: 0,
    totalPages: 0,
    percent: 0
  });

  constructor() {
    this.loadTemplates();
  }

  /**
   * 加载所有模板
   */
  loadTemplates(): void {
    this.templateService.getTemplates().subscribe({
      next: (templates) => this.templates.set(templates),
      error: (err) => this.message.error('加载模板失败')
    });
  }

  /**
   * 创建新模板
   */
  createTemplate(): void {
    this.router.navigate(['/editor']);
  }

  /**
   * 编辑现有模板
   */
  editTemplate(template: LabelTemplate): void {
    this.router.navigate(['/editor', template.id]);
  }

  /**
   * 生成标签
   */
  generateLabels(template: LabelTemplate): void {
    this.selectedTemplate.set(template);
    this.dialogVisible.set(true);
  }

  /**
   * 关闭对话框
   */
  closeDialog(): void {
    this.dialogVisible.set(false);
    this.selectedTemplate.set(null);
  }

  /**
   * 处理生成的标签数据
   */
  async handleLabelsGenerated(labels: GeneratedLabel[]): Promise<void> {
    const template = this.selectedTemplate();
    if (!template) {
      this.message.error('未选择模板');
      return;
    }

    try {
      // 将 GeneratedLabel 转换为 BindingData
      const bindingPromises = labels.map(async (genLabel, index) => {
        const data: BindingData = {
          '产品名': genLabel.产品名,
          '材料编号': genLabel.材料编号,
          '材料描述': genLabel.材料描述,
          '客户名称': genLabel.客户名称,
          '客户采购订单': genLabel.客户采购订单,
          '交货时间': genLabel.交货时间,
          '单位装箱数': genLabel.单位装箱数,
          '位子': genLabel.位子,
          '批号': genLabel.批号,
          'index': index + 1
        };

        const result = await this.labelDataBindingService.bind(template.label, data);
        return result.label;
      });

      const boundLabels = await Promise.all(bindingPromises);

      // 初始化进度并显示进度弹窗
      this.generateProgress.set({
        completed: 0,
        total: boundLabels.length,
        currentPage: 0,
        totalPages: 0,
        percent: 0
      });
      this.isGenerating.set(true);
      this.dialogVisible.set(false);

      // 生成 PDF（带进度回调）
      const pdfBlob = await this.labelGeneratorService.generatePdf(
        boundLabels,
        template.printSetting || DEFAULT_PRINT_SETTING,
        {
          onProgress: (progress) => {
            this.generateProgress.set({
              completed: progress.completed,
              total: progress.total,
              currentPage: progress.currentPage + 1,
              totalPages: progress.totalPages,
              percent: progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
            });
          }
        }
      );

      // 下载 PDF
      this.labelGeneratorService.download(pdfBlob, `${template.name || 'labels'}.pdf`);

      this.message.success('PDF 生成成功');
    } catch (err) {
      console.error('生成 PDF 失败:', err);
      this.message.error('生成 PDF 失败');
    } finally {
      this.isGenerating.set(false);
    }
  }

  /**
   * 确认删除模板
   */
  confirmDelete(template: LabelTemplate): void {
    this.modal.confirm({
      nzTitle: '确认删除',
      nzContent: `确定要删除模板"${template.name}"吗？此操作不可撤销。`,
      nzOkText: '删除',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => this.deleteTemplate(template)
    });
  }

  /**
   * 删除模板
   */
  private deleteTemplate(template: LabelTemplate): void {
    this.templateService.deleteTemplate(template.id!).subscribe({
      next: () => {
        this.message.success('删除成功');
        this.loadTemplates();
      },
      error: () => this.message.error('删除失败')
    });
  }

  /**
   * 格式化日期
   */
  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
