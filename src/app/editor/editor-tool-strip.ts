import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { EditorTool } from './editor.models';

@Component({
  selector: 'app-editor-tool-strip',
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
          {{ tool.icon }}
        </button>
      }
    </nav>
  `,
  styleUrl: './editor-tool-strip.scss'
})
export class EditorToolStripComponent {
  readonly activeTool = input.required<EditorTool>();
  readonly toolSelected = output<EditorTool>();

  protected readonly tools: ReadonlyArray<{ id: EditorTool; icon: string; label: string }> = [
    { id: 'select', icon: '↖', label: 'Select tool' },
    { id: 'text', icon: 'T', label: 'Insert text' },
    { id: 'square', icon: '□', label: 'Insert square' },
    { id: 'circle', icon: '◯', label: 'Insert circle' },
    { id: 'triangle', icon: '△', label: 'Insert triangle' },
    { id: 'line', icon: '/', label: 'Insert line' },
    { id: 'qrcode', icon: '▦', label: 'Insert QR code' },
    { id: 'barcode', icon: '|||', label: 'Insert barcode' }
  ];
}
