import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Toolbar, ToolbarWidget, ToolbarWidgetGroup } from '@angular/aria/toolbar';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { UndoRedoService } from './editor/undo-redo.service';

@Component({
  selector: 'app-editor-topbar',
  imports: [Toolbar, ToolbarWidget, ToolbarWidgetGroup, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-topbar.html',
  styleUrl: './editor-topbar.scss'
})
export class EditorTopbarComponent {
  /**
   * Direct dependency on the undo/redo service. The legacy
   * `EditorCanvasService` facade used to expose `canUndoSignal` /
   * `canRedoSignal`; we now read the signals straight off the service.
   */
  private readonly undoRedo = inject(UndoRedoService);
  protected readonly canUndo = this.undoRedo.canUndo;
  protected readonly canRedo = this.undoRedo.canRedo;

  readonly hasSelection = input(false);
  readonly hasMultiSelection = input(false);
  readonly zoom = input(1);
  readonly templateName = input('未命名');
  readonly isDirty = input(false);

  readonly saveRequested = output<void>();
  readonly backRequested = output<void>();
  readonly svgRequested = output<void>();
  readonly pngRequested = output<void>();
  readonly pdfRequested = output<void>();
  readonly printSettingRequested = output<void>();
  readonly zoomInRequested = output<void>();
  readonly zoomOutRequested = output<void>();
  readonly bringFrontRequested = output<void>();
  readonly sendBackRequested = output<void>();
  readonly deleteRequested = output<void>();
  readonly alignLeftRequested = output<void>();
  readonly alignCenterHRequested = output<void>();
  readonly alignRightRequested = output<void>();
  readonly alignTopRequested = output<void>();
  readonly alignCenterVRequested = output<void>();
  readonly alignBottomRequested = output<void>();
  readonly distributeHRequested = output<void>();
  readonly distributeVRequested = output<void>();
  readonly templateNameChanged = output<string>();

  /** Undo / redo are now driven from the host component (which owns
   *  the `UndoRedoService` + keyboard shortcuts) via output events.
   *  This keeps the topbar a thin presentational shell. */
  readonly undoRequested = output<void>();
  readonly redoRequested = output<void>();
}
