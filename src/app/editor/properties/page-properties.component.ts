// src/app/editor/properties/page-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzUploadModule, type NzUploadFile } from 'ng-zorro-antd/upload';
import { LabelDocumentService } from '../document';

@Component({
  selector: 'app-page-properties',
  standalone: true,
  imports: [CommonModule, FormsModule, NzButtonModule, NzIconModule, NzUploadModule],
  templateUrl: './page-properties.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PagePropertiesComponent {
  private doc = inject(LabelDocumentService);

  protected readonly page = this.doc.page;

  /** Tracks the currently selected preset id so the dropdown reflects user choice. */
  protected readonly presetId = signal<string>('a4-portrait');

  protected readonly mmWidth = computed(() => this.page().widthMm);
  protected readonly mmHeight = computed(() => this.page().heightMm);

  protected onWidthChange(mm: number): void {
    this.doc.setPageSize(Number(mm), this.mmHeight());
  }

  protected onHeightChange(mm: number): void {
    this.doc.setPageSize(this.mmWidth(), Number(mm));
  }

  protected onPresetChange(id: string): void {
    this.presetId.set(id);
    if (id === 'custom') return;
    // Mirror the legacy preset table; keep names stable for the wire format.
    const presets: Record<string, { w: number; h: number }> = {
      'a4-portrait': { w: 210, h: 297 },
      'a4-landscape': { w: 297, h: 210 },
      'a5-portrait': { w: 148, h: 210 },
      'a5-landscape': { w: 210, h: 148 },
      'letter-portrait': { w: 216, h: 279 },
      'letter-landscape': { w: 279, h: 216 },
    };
    const preset = presets[id];
    if (preset) this.doc.setPageSize(preset.w, preset.h);
  }

  protected onBackgroundColorChange(color: string): void {
    this.doc.setPageBackground(color || null);
  }

  protected onBackgroundNoneToggle(noneChecked: boolean): void {
    this.doc.setPageBackground(noneChecked ? null : '#ffffff');
  }

  protected onBackgroundImageToggle(noneChecked: boolean): void {
    if (noneChecked) this.doc.setPageBackground(this.page().backgroundColor ?? null, null);
    else this.doc.setPageBackground(this.page().backgroundColor ?? null, '');
  }

  protected beforeUpload = (file: NzUploadFile): boolean => {
    const raw = file as unknown as File;
    if (!raw) return false;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      this.doc.setPageBackground(this.page().backgroundColor ?? null, dataUrl);
    };
    reader.readAsDataURL(raw);
    return false; // prevent ng-zorro from doing its own upload
  };
}
