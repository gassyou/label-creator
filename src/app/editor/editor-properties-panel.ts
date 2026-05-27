import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import {
  EditorCanvasState,
  EditorSelectionState
} from './models/label.models';

@Component({
  selector: 'app-editor-properties-panel',
  imports: [CommonModule, FormsModule, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-properties-panel.html',
  styleUrl: './editor-properties-panel.scss'
})
export class EditorPropertiesPanelComponent {
  readonly canvasState = input.required<EditorCanvasState>();
  readonly selectionState = input.required<EditorSelectionState>();
  readonly textEditorVisible = input(false);
  readonly figureEditorVisible = input(false);
  readonly propsPanelVisible = input(false);
  readonly jsonPreview = input('');

  readonly canvasFillChanged = output<string>();
  readonly canvasImageChanged = output<string>();
  readonly applyCanvasImageRequested = output<void>();

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
  readonly bindingChanged = output<string>();
  readonly barcodeFormatChanged = output<string>();
  readonly barcodeShowTextChanged = output<boolean>();
  readonly errorCorrectionLevelChanged = output<string>();
  readonly foregroundColorChanged = output<string>();
  readonly backgroundColorChanged = output<string>();
}
