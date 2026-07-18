import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabelDocumentService } from '../document';
import { CommonPropertiesComponent } from './common-properties.component';
import { FigurePropertiesComponent } from './figure-properties.component';
import { LinePropertiesComponent } from './line-properties.component';
import { TextPropertiesComponent } from './text-properties.component';
import { BarcodePropertiesComponent } from './barcode-properties.component';
import { QrcodePropertiesComponent } from './qrcode-properties.component';
import { PagePropertiesComponent } from './page-properties.component';
import { JsonPreviewComponent } from './json-preview.component';

/**
 * Shell for the right-rail properties pane. Owns no editing state —
 * sub-panels inject `LabelDocumentService` directly. The shell's only
 * responsibility is the type-router: pick which sub-panel to show for the
 * currently selected element's type.
 */
@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [
    CommonModule,
    CommonPropertiesComponent,
    FigurePropertiesComponent,
    LinePropertiesComponent,
    TextPropertiesComponent,
    BarcodePropertiesComponent,
    QrcodePropertiesComponent,
    PagePropertiesComponent,
    JsonPreviewComponent,
  ],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesPanelComponent {
  protected doc = inject(LabelDocumentService);
}
