import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAntIcons } from '@ant-design/icons-angular';
import { provideNzI18n, zh_CN } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import zh from '@angular/common/locales/zh';
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
  ColumnHeightOutline,
  PlusOutline,
  EditOutline,
  FileTextOutline,
  FileImageOutline as FileImageOutlineIcon
} from '@ant-design/icons-angular/icons';

import { routes } from './app.routes';
import { TemplateStorageService, LocalStorageTemplateService } from './template/template.storage';

registerLocaleData(zh);

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
      ColumnHeightOutline,
      PlusOutline,
      EditOutline,
      FileTextOutline,
      FileImageOutlineIcon
    ]),
    provideNzI18n(zh_CN),
    { provide: TemplateStorageService, useClass: LocalStorageTemplateService }
  ]
};