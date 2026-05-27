import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Component, input, output } from '@angular/core';
import { PrintSetting } from '../../models/label.models';

@Component({
  selector: 'app-print-setting-dialog',
  imports: [CommonModule, FormsModule, NzModalModule, NzRadioModule, NzInputNumberModule, NzSelectModule, NzButtonModule, NzIconModule],
  templateUrl: './print-setting-dialog.html',
  styleUrl: './print-setting-dialog.scss'
})
export class PrintSettingDialogComponent {
  readonly printSetting = input.required<PrintSetting>();
  readonly settingChanged = output<PrintSetting>();
  readonly closed = output<void>();

  readonly visible = input(true);

  readonly paperSizes = [
    { value: 'A4', label: 'A4 (210 x 297 mm)' },
    { value: 'A5', label: 'A5 (148 x 210 mm)' },
    { value: 'letter', label: 'Letter (216 x 279 mm)' },
    { value: 'custom', label: 'Custom' }
  ];

  onOk(): void {
    this.settingChanged.emit(this.printSetting());
  }

  onCancel(): void {
    this.closed.emit();
  }
}
