import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Toolbar, ToolbarWidget, ToolbarWidgetGroup } from '@angular/aria/toolbar';

@Component({
  selector: 'app-editor-topbar',
  imports: [Toolbar, ToolbarWidget, ToolbarWidgetGroup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-topbar.html',
  styleUrl: './editor-topbar.scss'
})
export class EditorTopbarComponent {
  readonly hasSelection = input(false);
  readonly zoom = input(1);

  readonly saveRequested = output<void>();
  readonly loadRequested = output<void>();
  readonly jsonRequested = output<void>();
  readonly svgRequested = output<void>();
  readonly pngRequested = output<void>();
  readonly pdfRequested = output<void>();
  readonly zoomInRequested = output<void>();
  readonly zoomOutRequested = output<void>();
  readonly cloneRequested = output<void>();
  readonly bringFrontRequested = output<void>();
  readonly sendBackRequested = output<void>();
  readonly unselectRequested = output<void>();
  readonly deleteRequested = output<void>();
}
