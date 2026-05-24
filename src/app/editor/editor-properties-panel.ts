import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  EditorCanvasState,
  EditorPage,
  EditorSelectionState,
  PageSizePreset
} from './editor.models';

@Component({
  selector: 'app-editor-properties-panel',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-properties-panel.html',
  styleUrl: './editor-properties-panel.scss'
})
export class EditorPropertiesPanelComponent {
  readonly canvasState = input.required<EditorCanvasState>();
  readonly pages = input.required<EditorPage[]>();
  readonly activePage = input.required<EditorPage>();
  readonly activePageId = input.required<string>();
  readonly pageSizePresets = input.required<ReadonlyArray<PageSizePreset>>();
  readonly selectionState = input.required<EditorSelectionState>();
  readonly textEditorVisible = input(false);
  readonly figureEditorVisible = input(false);
  readonly propsPanelVisible = input(false);
  readonly jsonPreview = input('');

  readonly pageSelected = output<string>();
  readonly pageAdded = output<void>();
  readonly pageDuplicated = output<void>();
  readonly pageRemoved = output<string>();
  readonly pagePresetChanged = output<string>();
  readonly pageWidthChanged = output<number>();
  readonly pageHeightChanged = output<number>();
  readonly canvasFillChanged = output<string>();
  readonly canvasImageChanged = output<string>();
  readonly applyCanvasImageRequested = output<void>();

  readonly idChanged = output<string>();
  readonly opacityChanged = output<number>();
  readonly fillChanged = output<string>();
  readonly fontFamilyChanged = output<string>();
  readonly textAlignChanged = output<string>();
  readonly boldToggled = output<void>();
  readonly italicToggled = output<void>();
  readonly textDecorationToggled = output<string>();
  readonly fontSizeChanged = output<number>();
  readonly lineHeightChanged = output<number>();
  readonly charSpacingChanged = output<number>();
}
