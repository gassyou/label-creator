import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { EditorTool } from './editor.models';

@Component({
  selector: 'app-editor-tool-strip',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="tool-strip" aria-label="Editor tools">
      @for (tool of tools; track tool.id) {
        <button
          type="button"
          class="strip-button"
          [class.active]="activeTool() === tool.id"
          (click)="toolSelected.emit(tool.id)"
          [attr.aria-label]="tool.label"
        >
          @if (tool.iconType === 'nz-icon') {
            <span nz-icon [nzType]="tool.icon" nzTheme="outline"></span>
          } @else {
            {{ tool.icon }}
          }
        </button>
      }
    </nav>
  `,
  styleUrl: './editor-tool-strip.scss'
})
export class EditorToolStripComponent {
  readonly activeTool = input.required<EditorTool>();
  readonly toolSelected = output<EditorTool>();

  protected readonly tools: ReadonlyArray<{ id: EditorTool; icon: string; label: string; iconType: string }> = [
    { id: 'select', icon: '↖', label: 'Select tool', iconType: 'text' },
    { id: 'text', icon: 'T', label: 'Insert text', iconType: 'text' },
    { id: 'square', icon: '□', label: 'Insert square', iconType: 'text' },
    { id: 'circle', icon: '◯', label: 'Insert circle', iconType: 'text' },
    { id: 'triangle', icon: '△', label: 'Insert triangle', iconType: 'text' },
    { id: 'line', icon: '/', label: 'Insert line', iconType: 'text' },
    { id: 'qrcode', icon: 'qrcode', label: 'Insert QR code', iconType: 'nz-icon' },
    { id: 'barcode', icon: 'barcode', label: 'Insert barcode', iconType: 'nz-icon' }
  ];
}
