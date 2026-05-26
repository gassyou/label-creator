import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Toolbar, ToolbarWidget, ToolbarWidgetGroup } from '@angular/aria/toolbar';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-editor-topbar',
  imports: [Toolbar, ToolbarWidget, ToolbarWidgetGroup, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-topbar.html',
  styleUrl: './editor-topbar.scss'
})
export class EditorTopbarComponent {
  readonly hasSelection = input(false);
  readonly hasMultiSelection = input(false);
  readonly zoom = input(1);
  readonly templateName = input('未命名');

  readonly saveRequested = output<void>();
  readonly backRequested = output<void>();
  readonly svgRequested = output<void>();
  readonly pngRequested = output<void>();
  readonly pdfRequested = output<void>();
  readonly zoomInRequested = output<void>();
  readonly zoomOutRequested = output<void>();
  readonly cloneRequested = output<void>();
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
}
