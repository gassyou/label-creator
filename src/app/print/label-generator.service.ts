import { Injectable } from '@angular/core';
import { Label, PrintSetting, DEFAULT_PRINT_SETTING } from '../editor/models/label.models';
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
          this.pngGenerator = new PngLabelGenerator(printSetting);
        }
        return this.pngGenerator;
      case 'svg':
        if (!this.svgGenerator) {
          this.svgGenerator = new SvgLabelGenerator(printSetting);
        }
        return this.svgGenerator;
    }
  }

  /**
   * 生成 PDF
   */
  async generatePdf(labels: Label[], printSetting: PrintSetting, options?: PdfGenerateOptions): Promise<Blob> {
    const generator = this.getGenerator('pdf', printSetting);
    return generator.generate(labels, options) as Promise<Blob>;
  }

  /**
   * 生成单个 PNG（不进行排版布局，直接生成标签本身）
   * @param label 标签数据
   * @param options 生成选项，支持 thumbnail 模式
   */
  async generateSinglePng(label: Label, options?: PngGenerateOptions): Promise<Blob> {
    const generator = this.getGenerator('png', DEFAULT_PRINT_SETTING);
    return generator.generateSingle(label, options) as Promise<Blob>;
  }

  /**
   * 生成单个 SVG（不进行排版布局，直接生成标签本身）
   */
  async generateSingleSvg(label: Label): Promise<string> {
    const generator = this.getGenerator('svg', DEFAULT_PRINT_SETTING);
    const result = await generator.generateSingle(label, { asString: true } as any);
    return typeof result === 'string' ? result : new TextDecoder().decode(await result.arrayBuffer());
  }

  /**
   * 生成单个 PDF（不进行排版布局，直接生成标签本身）
   */
  async generateSinglePdf(label: Label): Promise<Blob> {
    const generator = this.getGenerator('pdf', DEFAULT_PRINT_SETTING);
    return generator.generateSingle(label) as Promise<Blob>;
  }

  /**
   * 生成 PNG
   */
  async generatePng(labels: Label[], printSetting: PrintSetting, options?: PngGenerateOptions): Promise<Blob> {
    const generator = this.getGenerator('png', printSetting);
    return generator.generate(labels, options) as Promise<Blob>;
  }

  /**
   * 生成 SVG
   */
  async generateSvg(labels: Label[], printSetting: PrintSetting, options?: SvgGenerateOptions): Promise<Blob | string> {
    const generator = this.getGenerator('svg', printSetting);
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
