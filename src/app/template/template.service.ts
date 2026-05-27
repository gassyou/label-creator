import { Injectable, inject } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { TemplateStorageService } from './template.storage';
import { Label, LabelTemplate } from '../editor/models';
import { LabelGeneratorService } from '../print/label-generator.service';

/**
 * 模板服务
 * 组件直接使用此服务，底层可通过依赖注入切换存储实现
 */
@Injectable({ providedIn: 'root' })
export class TemplateService {
  private readonly storage = inject(TemplateStorageService);
  private readonly labelGenerator = inject(LabelGeneratorService);

  /**
   * 获取所有模板
   */
  getTemplates(): Observable<LabelTemplate[]> {
    return this.storage.getAll();
  }

  /**
   * 根据ID获取模板
   */
  getTemplate(id: string): Observable<LabelTemplate | null> {
    return this.storage.getById(id);
  }

  /**
   * 保存模板
   * @param name 模板名称
   * @param template 标签模板
   * @param thumbnail 可选的缩略图 base64，不传则自动生成
   * @param id 可选，传入则更新现有模板，不传则创建新模板
   */
  saveTemplate(
    name: string,
    template: LabelTemplate,
    thumbnail?: string,
    id?: string
  ): Observable<LabelTemplate> {
    const now = new Date().toISOString();
    const templateId = id || `tpl-${Date.now()}`;

    return from(this.generateThumbnailAsync(template.label)).pipe(
      map(generatedThumbnail => {
        const storedTemplate: LabelTemplate = {
          id: templateId,
          name,
          label:template.label,
          printSetting: template.printSetting,
          thumbnail: thumbnail || generatedThumbnail,
          createdAt: now,
          updatedAt: now
        };
        return storedTemplate;
      }),
      switchMap(stored =>
        this.storage.getById(templateId).pipe(
          map(existing => {
            if (existing) {
              stored.createdAt = existing.createdAt;
            }
            return stored;
          }),
          switchMap(t => this.storage.save(t).pipe(map(() => t)))
        )
      )
    );
  }

  /**
   * 删除模板
   */
  deleteTemplate(id: string): Observable<void> {
    return this.storage.delete(id);
  }

  /**
   * 异步生成缩略图
   */
  private async generateThumbnailAsync(label: Label): Promise<string> {
    if (!label.canvasJson) {
      return '';
    }

    try {
      const blob = await this.labelGenerator.generateSinglePng(label, {
        thumbnail: true,
        thumbnailMaxDimension: 200
      });
      return await this.blobToDataUrl(blob);
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return '';
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 更新模板缩略图
   */
  updateThumbnail(id: string, thumbnail: string): Observable<void> {
    return this.storage.getById(id).pipe(
      switchMap(template => {
        if (!template) {
          return from(Promise.resolve());
        }
        template.thumbnail = thumbnail;
        return this.storage.save(template);
      })
    );
  }
}
