import { Injectable, inject } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { Canvas } from 'fabric';
import { TemplateStorageService } from './template.storage';
import { Label, LabelTemplate } from '../editor/models';

/**
 * 模板服务
 * 组件直接使用此服务，底层可通过依赖注入切换存储实现
 */
@Injectable({ providedIn: 'root' })
export class TemplateService {
  private readonly storage = inject(TemplateStorageService);

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
      return await this.renderCanvasToThumbnail(label);
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return '';
    }
  }

  /**
   * 渲染 Canvas 到缩略图
   */
  private async renderCanvasToThumbnail(label: Label): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvasElement = document.createElement('canvas');

      // 设置缩略图尺寸 200x200
      const thumbWidth = 200;
      const thumbHeight = 200;

      canvasElement.width = thumbWidth;
      canvasElement.height = thumbHeight;

      const canvas = new Canvas(canvasElement, {
        selection: false,
        renderOnAddRemove: false
      });

      // 设置原始尺寸
      canvas.setDimensions({
        width: label.width,
        height: label.height
      });

      // 设置背景
      const bgImage = label.backgroundImage;
      if (bgImage) {
        // 异步加载背景图
        import('fabric').then(({ FabricImage, Pattern }) => {
          FabricImage.fromURL(bgImage).then((image) => {
            const pattern = new Pattern({
              source: image.getElement(),
              repeat: 'repeat'
            });
            canvas.backgroundColor = pattern;
            this.loadAndRender(canvas, label.canvasJson!, thumbWidth, thumbHeight)
              .then(resolve)
              .catch(reject);
          }).catch(reject);
        }).catch(reject);
      } else {
        canvas.backgroundColor = label.backgroundColor;
        this.loadAndRender(canvas, label.canvasJson!, thumbWidth, thumbHeight)
          .then(resolve)
          .catch(reject);
      }
    });
  }

  /**
   * 加载 JSON 并渲染为缩略图
   */
  private loadAndRender(
    canvas: Canvas,
    canvasJson: string,
    thumbWidth: number,
    thumbHeight: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      canvas.loadFromJSON(canvasJson).then(() => {
        // 计算缩放比例，保持宽高比
        const originalWidth = canvas.width ?? 100;
        const originalHeight = canvas.height ?? 100;
        const scale = Math.min(thumbWidth / originalWidth, thumbHeight / originalHeight);

        // 创建临时 canvas 用于缩放
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = thumbWidth;
        tempCanvas.height = thumbHeight;
        const ctx = tempCanvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // 渲染原始 canvas 到临时 canvas（居中填充）
        const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
        const img = new Image();

        img.onload = () => {
          // 计算居中裁剪
          const scaledWidth = originalWidth * scale;
          const scaledHeight = originalHeight * scale;
          const offsetX = (thumbWidth - scaledWidth) / 2;
          const offsetY = (thumbHeight - scaledHeight) / 2;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, thumbWidth, thumbHeight);
          ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

          resolve(tempCanvas.toDataURL('image/png', 0.8));
        };

        img.onerror = reject;
        img.src = dataUrl;

        canvas.dispose();
      }).catch(reject);
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
