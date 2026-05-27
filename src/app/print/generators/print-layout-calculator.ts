import { Label, PrintSetting, getPaperSize } from '../../editor/models/label.models';

/**
 * 排版信息
 */
export interface PrintLayout {
  /**
   * 纸张宽度 mm
   */
  paperWidth: number;

  /**
   * 纸张高度 mm
   */
  paperHeight: number;

  /**
   * 标签列数
   */
  columns: number;

  /**
   * 标签行数
   */
  rows: number;

  /**
   * 每页标签数
   */
  labelsPerPage: number;

  /**
   * 标签实际宽度 mm
   */
  labelWidth: number;

  /**
   * 标签实际高度 mm
   */
  labelHeight: number;

  /**
   * 水平间距 mm
   */
  gapX: number;

  /**
   * 垂直间距 mm
   */
  gapY: number;

  /**
   * 页边距
   */
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

/**
 * 打印排版计算器
 * 根据打印设置和标签尺寸计算排版
 */
export class PrintLayoutCalculator {
  /**
   * 计算排版信息
   * @param printSetting 打印设置
   * @param labelWidth 标签宽度 mm
   * @param labelHeight 标签高度 mm
   */
  static calculate(
    printSetting: PrintSetting,
    labelWidth: number,
    labelHeight: number
  ): PrintLayout {
    const paperSize = getPaperSize(
      printSetting.paperSize,
      printSetting.orientation,
      printSetting.customPaperWidth,
      printSetting.customPaperHeight
    );

    const {
      marginTop,
      marginBottom,
      marginLeft,
      marginRight,
      gapX,
      gapY
    } = printSetting;

    // 可用区域
    const availableWidth = paperSize.width - marginLeft - marginRight;
    const availableHeight = paperSize.height - marginTop - marginBottom;

    // 计算列数和行数
    const columns = Math.floor(availableWidth / (labelWidth + gapX));
    const rows = Math.floor(availableHeight / (labelHeight + gapY));

    // 每页标签数
    const labelsPerPage = Math.max(1, columns * rows);

    return {
      paperWidth: paperSize.width,
      paperHeight: paperSize.height,
      columns: Math.max(1, columns),
      rows: Math.max(1, rows),
      labelsPerPage,
      labelWidth,
      labelHeight,
      gapX,
      gapY,
      margins: {
        top: marginTop,
        bottom: marginBottom,
        left: marginLeft,
        right: marginRight
      }
    };
  }

  /**
   * 计算标签在纸张上的位置
   * @param index 标签索引（0-based）
   * @param layout 排版信息
   */
  static getPosition(
    index: number,
    layout: PrintLayout
  ): { x: number; y: number } {
    const col = index % layout.columns;
    const row = Math.floor(index / layout.columns);

    const x = layout.margins.left + col * (layout.labelWidth + layout.gapX);
    const y = layout.margins.top + row * (layout.labelHeight + layout.gapY);

    return { x, y };
  }

  /**
   * 计算所需页数
   * @param labelCount 标签数量
   * @param layout 排版信息
   */
  static getPageCount(labelCount: number, layout: PrintLayout): number {
    return Math.ceil(labelCount / layout.labelsPerPage);
  }

  /**
   * 获取某页的标签范围
   * @param pageIndex 页索引（0-based）
   * @param layout 排版信息
   */
  static getPageRange(
    pageIndex: number,
    layout: PrintLayout
  ): { start: number; end: number } {
    const start = pageIndex * layout.labelsPerPage;
    const end = Math.min(start + layout.labelsPerPage, start + layout.labelsPerPage);
    return { start, end };
  }
}
