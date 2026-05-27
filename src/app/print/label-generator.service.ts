import { Injectable } from '@angular/core';
import { Label, PrintSetting } from '../editor/models/label.models';
import { LabelGenerator, GeneratorType, PdfGenerateOptions, PngGenerateOptions, SvgGenerateOptions } from './generators/label-generator.interface';
import { PdfLabelGenerator } from './generators/pdf-label.generator';
import { PngLabelGenerator } from './generators/png-label.generator';
import { SvgLabelGenerator } from './generators/svg-label.generator';

/**
 * 标签生成器服务
 * 统一入口，提供工厂方法创建不同类型的生成器
 */
@Injectable({providedIn:'root'})
export class LabelGeneratorService {
  private pdfGenerator: LabelGenerator | null = null;
  private pngGenerator: LabelGenerator | null = null;
  private svgGenerator: LabelGenerator | null = null;

  /**
   * 获取指定类型的生成器
   */
  getGenerator(type: GeneratorType,printSetting: PrintSetting): LabelGenerator {
    switch (type) {
      case 'pdf':
        if (!this.pdfGenerator) {
          this.pdfGenerator = new PdfLabelGenerator(printSetting);
        }
        return this.pdfGenerator;
      case 'png':
        if (!this.pngGenerator) {
          this.pngGenerator = new PngLabelGenerator();
        }
        return this.pngGenerator;
      case 'svg':
        if (!this.svgGenerator) {
          this.svgGenerator = new SvgLabelGenerator();
        }
        return this.svgGenerator;
    }
  }

  /**
   * 生成 PDF
   */
  async generatePdf(labels: Label[], options?: PdfGenerateOptions): Promise<Blob> {
    const generator = this.getGenerator('pdf');
    return generator.generate(labels, options) as Promise<Blob>;
  }

  /**
   * 生成 PNG
   */
  async generatePng(labels: Label[], options?: PngGenerateOptions): Promise<Blob> {
    const generator = this.getGenerator('png');
    return generator.generate(labels, options) as Promise<Blob>;
  }

  /**
   * 生成 SVG
   */
  async generateSvg(labels: Label[], options?: SvgGenerateOptions): Promise<Blob | string> {
    const generator = this.getGenerator('svg');
    return generator.generate(labels, options);
  }

  /**
   * 下载文件
   */
  download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 下载 SVG 字符串
   */
  downloadSvg(svgString: string, fileName: string): void {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    this.download(blob, fileName);
  }
}
