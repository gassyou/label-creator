import { Injectable, inject } from '@angular/core';
import { GeneratedLabel } from './generate-label.models';
import * as jsPDF from 'jspdf';

/**
 * 标签打印和导出服务
 */
@Injectable({ providedIn: 'root' })
export class LabelPrintService {
  /**
   * 打印标签
   * 使用浏览器的打印功能
   */
  printLabels(labels: GeneratedLabel[]): void {
    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) {
      return;
    }

    const html = this.generatePrintHTML(labels);
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  /**
   * 生成HTML用于打印
   */
  private generatePrintHTML(labels: GeneratedLabel[]): string {
    const style = `
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Arial', sans-serif;
          font-size: 12px;
          line-height: 1.5;
        }
        .label {
          border: 1px solid #333;
          page-break-after: always;
          padding: 10px;
          margin: 10px 0;
          width: 100mm;
          height: 150mm;
          display: flex;
          flex-direction: column;
        }
        .label-header {
          font-weight: bold;
          margin-bottom: 5px;
          border-bottom: 1px solid #333;
          padding-bottom: 5px;
        }
        .label-row {
          display: flex;
          margin-bottom: 3px;
        }
        .label-label {
          font-weight: bold;
          width: 80px;
          flex-shrink: 0;
        }
        .label-value {
          flex: 1;
          word-break: break-all;
        }
        .print-container {
          padding: 20px;
        }
      </style>
    `;

    const rows = labels
      .map((label, index) => {
        return `
          <div class="label">
            <div class="label-header">标签 #${index + 1}</div>
            <div class="label-row">
              <div class="label-label">产品名：</div>
              <div class="label-value">${label.产品名}</div>
            </div>
            <div class="label-row">
              <div class="label-label">材料编号：</div>
              <div class="label-value">${label.材料编号}</div>
            </div>
            <div class="label-row">
              <div class="label-label">材料描述：</div>
              <div class="label-value">${label.材料描述}</div>
            </div>
            <div class="label-row">
              <div class="label-label">客户名称：</div>
              <div class="label-value">${label.客户名称}</div>
            </div>
            <div class="label-row">
              <div class="label-label">客户PO：</div>
              <div class="label-value">${label.客户采购订单}</div>
            </div>
            <div class="label-row">
              <div class="label-label">交货时间：</div>
              <div class="label-value">${label.交货时间}</div>
            </div>
            <div class="label-row">
              <div class="label-label">单位装箱数：</div>
              <div class="label-value">${label.单位装箱数}</div>
            </div>
            <div class="label-row">
              <div class="label-label">位置：</div>
              <div class="label-value">${label.位子}</div>
            </div>
            <div class="label-row">
              <div class="label-label">批号：</div>
              <div class="label-value">${label.批号}</div>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>标签打印</title>
          ${style}
        </head>
        <body>
          <div class="print-container">
            ${rows}
          </div>
        </body>
      </html>
    `;
  }

  /**
   * 导出为CSV格式
   */
  exportAsCSV(labels: GeneratedLabel[]): void {
    const headers = [
      '产品名',
      '材料编号',
      '材料描述',
      '客户名称',
      '客户采购订单',
      '交货时间',
      '单位装箱数',
      '位子',
      '批号'
    ];

    const rows = labels.map(label => [
      label.产品名,
      label.材料编号,
      label.材料描述,
      label.客户名称,
      label.客户采购订单,
      label.交货时间,
      label.单位装箱数,
      label.位子,
      label.批号
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
    ].join('\n');

    this.downloadFile(csv, 'labels.csv', 'text/csv;charset=utf-8;');
  }

  /**
   * 导出为JSON格式
   */
  exportAsJSON(labels: GeneratedLabel[]): void {
    const json = JSON.stringify(labels, null, 2);
    this.downloadFile(json, 'labels.json', 'application/json;charset=utf-8;');
  }

  /**
   * 导出为PDF格式
   */
  exportAsPDF(labels: GeneratedLabel[]): void {
    try {
      const doc = new jsPDF.jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'A4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      let yPosition = margin;

      labels.forEach((label, index) => {
        // 设置字体和大小
        doc.setFontSize(10);

        // 标签标题
        doc.text(`标签 #${index + 1}`, margin, yPosition);
        yPosition += 7;

        // 标签内容
        const labelData = [
          [`产品名：`, label.产品名],
          [`材料编号：`, label.材料编号],
          [`材料描述：`, label.材料描述],
          [`客户名称：`, label.客户名称],
          [`客户PO：`, label.客户采购订单],
          [`交货时间：`, label.交货时间],
          [`单位装箱数：`, label.单位装箱数.toString()],
          [`位置：`, label.位子],
          [`批号：`, label.批号]
        ];

        labelData.forEach(([key, value]) => {
          doc.text(`${key} ${value}`, margin + 5, yPosition);
          yPosition += 5;
        });

        yPosition += 10;

        // 如果内容超过页面高度，添加新页面
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }
      });

      doc.save('labels.pdf');
    } catch (error) {
      console.error('PDF导出失败:', error);
    }
  }

  /**
   * 下载文件
   */
  private downloadFile(content: string, filename: string, type: string): void {
    const element = document.createElement('a');
    element.setAttribute('href', `data:${type}base64,${btoa(unescape(encodeURIComponent(content)))}`);
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
}
