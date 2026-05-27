import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal, computed, inject, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzUploadModule, NzUploadFile } from 'ng-zorro-antd/upload';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { EditorSelectionState } from './models/editor.models';
import { PAGE_SIZE_PRESETS, pixelsToMillimeters } from './models/label.models';

@Component({
  selector: 'app-editor-properties-panel',
  imports: [CommonModule, FormsModule, NzIconModule, NzUploadModule, NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-properties-panel.html',
  styleUrl: './editor-properties-panel.scss'
})
export class EditorPropertiesPanelComponent {
  readonly canvasState = input.required<{
    width: number;
    height: number;
    backgroundColor: string;
    backgroundImage?: string;
  }>();
  readonly selectionState = input.required<EditorSelectionState>();
  readonly textEditorVisible = input(false);
  readonly figureEditorVisible = input(false);
  readonly propsPanelVisible = input(false);
  readonly jsonPreview = input('');

  readonly canvasFillChanged = output<string>();
  readonly canvasImageChanged = output<string>();
  readonly pageSizeChanged = output<string>();
  readonly canvasSizeChanged = output<{ width: number; height: number }>();

  readonly idChanged = output<string>();
  readonly opacityChanged = output<number>();
  readonly fillChanged = output<string>();
  readonly strokeChanged = output<string>();
  readonly strokeWidthChanged = output<number>();
  readonly fontFamilyChanged = output<string>();
  readonly boldToggled = output<void>();
  readonly italicToggled = output<void>();
  readonly textDecorationToggled = output<string>();
  readonly fontSizeChanged = output<number>();
  readonly textChanged = output<string>();
  readonly colorChanged = output<string>();
  readonly barcodeFormatChanged = output<string>();
  readonly barcodeShowTextChanged = output<boolean>();
  readonly errorCorrectionLevelChanged = output<string>();
  readonly foregroundColorChanged = output<string>();
  readonly backgroundColorChanged = output<string>();

  readonly pageSizePresets = PAGE_SIZE_PRESETS;
  readonly pageSize = signal('a4-portrait');
  readonly canvasWidth = computed(() => Math.round(pixelsToMillimeters(this.canvasState().width)));
  readonly canvasHeight = computed(() => Math.round(pixelsToMillimeters(this.canvasState().height)));
  private readonly message = inject(NzMessageService);
  private readonly ngZone = inject(NgZone);

  onPageSizeChange(sizeId: string): void {
    this.pageSize.set(sizeId);
    const preset = PAGE_SIZE_PRESETS.find(p => p.id === sizeId);
    if (preset) {
      this.canvasSizeChanged.emit({ width: preset.widthMm, height: preset.heightMm });
    }
  }

  onSizeChange(dimension: 'width' | 'height', value: number): void {
    this.pageSize.set('custom');
    const currentWidth = this.canvasWidth();
    const currentHeight = this.canvasHeight();
    this.canvasSizeChanged.emit({
      width: dimension === 'width' ? value : currentWidth,
      height: dimension === 'height' ? value : currentHeight
    });
  }

  beforeUpload(file: NzUploadFile): boolean {
    const isImage = file.type?.startsWith('image/') ?? false;
    if (!isImage) {
      this.message.error('只能上传图片文件');
      return false;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      this.ngZone.run(() => {
        this.canvasImageChanged.emit(result);
      });
    };
    reader.readAsDataURL(file as unknown as File);
    return false;
  }

  handleImageUpload(): void {
    // Upload handled in beforeUpload
  }
}
