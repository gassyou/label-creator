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
import { TemplateService } from '../template.service';
import { StoredTemplate } from '../template.storage';
import { GenerateLabelDialogComponent } from '../../generate-label/generate-label-dialog.component';
import { GeneratedLabel } from '../../generate-label/generate-label.models';
import { LabelPrintService } from '../../generate-label/label-print.service';

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
                  <p class="update-time">更新于 {{ formatDate(template.updatedAt) }}</p>
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
  `]
})
export class TemplateListComponent {
  private readonly templateService = inject(TemplateService);
  private readonly router = inject(Router);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly labelPrintService = inject(LabelPrintService);

  readonly templates = signal<StoredTemplate[]>([]);
  readonly dialogVisible = signal(false);
  readonly selectedTemplate = signal<StoredTemplate | null>(null);
  readonly generatedLabels = signal<GeneratedLabel[]>([]);

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
  editTemplate(template: StoredTemplate): void {
    this.router.navigate(['/editor', template.id]);
  }

  /**
   * 生成标签
   */
  generateLabels(template: StoredTemplate): void {
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
  handleLabelsGenerated(labels: GeneratedLabel[]): void {
    this.generatedLabels.set(labels);
    this.showLabelActionsModal(labels);
  }

  /**
   * 显示标签操作选项模态框
   */
  private showLabelActionsModal(labels: GeneratedLabel[]): void {
    this.modal.info({
      nzTitle: '标签生成完成',
      nzContent: `已成功生成 ${labels.length} 条标签数据`,
      nzOkText: '关闭',
      nzWidth: 600,
      nzFooter: [
        {
          label: '打印标签',
          type: 'primary',
          onClick: () => {
            this.labelPrintService.printLabels(labels);
            this.message.success('打印对话框已打开');
            this.modal.closeAll();
          }
        },
        {
          label: '导出 CSV',
          onClick: () => {
            this.labelPrintService.exportAsCSV(labels);
            this.message.success('CSV 文件已下载');
            this.modal.closeAll();
          }
        },
        {
          label: '导出 JSON',
          onClick: () => {
            this.labelPrintService.exportAsJSON(labels);
            this.message.success('JSON 文件已下载');
            this.modal.closeAll();
          }
        },
        {
          label: '导出 PDF',
          onClick: () => {
            this.labelPrintService.exportAsPDF(labels);
            this.message.success('PDF 文件已下载');
            this.modal.closeAll();
          }
        }
      ]
    });
  }

  /**
   * 确认删除模板
   */
  confirmDelete(template: StoredTemplate): void {
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
  private deleteTemplate(template: StoredTemplate): void {
    this.templateService.deleteTemplate(template.id).subscribe({
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