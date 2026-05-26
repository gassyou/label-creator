import { Injectable, inject } from '@angular/core';
import { Observable, of, from } from 'rxjs';
import { LabelTemplate, StoredTemplate } from '../editor/models/template.models';

/**
 * 模板存储服务接口
 * 抽象存储层，便于将来切换到服务端存储
 */
@Injectable({ providedIn: 'root' })
export abstract class TemplateStorageService {
  /** 获取所有模板 */
  abstract getAll(): Observable<StoredTemplate[]>;
  /** 根据ID获取模板 */
  abstract getById(id: string): Observable<StoredTemplate | null>;
  /** 保存模板 */
  abstract save(template: StoredTemplate): Observable<void>;
  /** 删除模板 */
  abstract delete(id: string): Observable<void>;
}

/**
 * localStorage 模板存储服务实现
 */
@Injectable({ providedIn: 'root' })
export class LocalStorageTemplateService implements TemplateStorageService {
  private readonly STORAGE_KEY = 'label-templates';
  private readonly VERSION_KEY = 'label-templates-version';
  private readonly CURRENT_VERSION = '1.0';

  getAll(): Observable<StoredTemplate[]> {
    return from(this.getAllAsync());
  }

  getById(id: string): Observable<StoredTemplate | null> {
    return from(this.getByIdAsync(id));
  }

  save(template: StoredTemplate): Observable<void> {
    return from(this.saveAsync(template));
  }

  delete(id: string): Observable<void> {
    return from(this.deleteAsync(id));
  }

  private async getAllAsync(): Promise<StoredTemplate[]> {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) {
        return [];
      }
      const parsed = JSON.parse(data);
      return parsed.templates || [];
    } catch {
      return [];
    }
  }

  private async getByIdAsync(id: string): Promise<StoredTemplate | null> {
    const templates = await this.getAllAsync();
    return templates.find(t => t.id === id) || null;
  }

  private async saveAsync(template: StoredTemplate): Promise<void> {
    const templates = await this.getAllAsync();
    const existingIndex = templates.findIndex(t => t.id === template.id);

    if (existingIndex >= 0) {
      templates[existingIndex] = template;
    } else {
      templates.push(template);
    }

    this.persistTemplates(templates);
  }

  private async deleteAsync(id: string): Promise<void> {
    const templates = await this.getAllAsync();
    const filtered = templates.filter(t => t.id !== id);
    this.persistTemplates(filtered);
  }

  private persistTemplates(templates: StoredTemplate[]): void {
    const data = {
      version: this.CURRENT_VERSION,
      templates
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }
}
