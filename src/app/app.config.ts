import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAntIcons } from '@ant-design/icons-angular';
import {
  SaveOutline,
  FolderOpenOutline,
  ZoomInOutline,
  ZoomOutOutline,
  ExportOutline,
  FileImageOutline,
  FilePdfOutline,
  CopyOutline,
  ArrowUpOutline,
  ArrowDownOutline,
  CloseOutline,
  DeleteOutline,
  AlignLeftOutline,
  AlignCenterOutline,
  AlignRightOutline,
  VerticalAlignTopOutline,
  VerticalAlignMiddleOutline,
  VerticalAlignBottomOutline,
  ColumnWidthOutline,
  ColumnHeightOutline
} from '@ant-design/icons-angular/icons';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAntIcons([
      SaveOutline,
      FolderOpenOutline,
      ZoomInOutline,
      ZoomOutOutline,
      ExportOutline,
      FileImageOutline,
      FilePdfOutline,
      CopyOutline,
      ArrowUpOutline,
      ArrowDownOutline,
      CloseOutline,
      DeleteOutline,
      AlignLeftOutline,
      AlignCenterOutline,
      AlignRightOutline,
      VerticalAlignTopOutline,
      VerticalAlignMiddleOutline,
      VerticalAlignBottomOutline,
      ColumnWidthOutline,
      ColumnHeightOutline
    ])
  ]
};
