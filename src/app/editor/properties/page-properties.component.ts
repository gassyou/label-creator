// src/app/editor/properties/page-properties.component.ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzUploadModule, type NzUploadFile } from 'ng-zorro-antd/upload';
import { LabelDocumentService } from '../document';
import { PAGE_SIZE_PRESETS } from '../models/label.models';

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
    // Look the preset up in the shared PAGE_SIZE_PRESETS table so the
    // dropdown and the conversion function stay in lockstep.
    const preset = PAGE_SIZE_PRESETS.find((p) => p.id === id);
    if (preset) this.doc.setPageSize(preset.widthMm, preset.heightMm);
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
