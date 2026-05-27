import { Label } from '../../editor/models/label.models';
import { Canvas } from 'fabric';
import { LabelGenerator, SvgGenerateOptions } from './label-generator.interface';

/**
 * SVG 标签生成器
 */
export class SvgLabelGenerator implements LabelGenerator {
  readonly name = 'svg';

  async generate(labels: Label[], options?: SvgGenerateOptions): Promise<Blob | string> {
    if (!labels.length) {
      throw new Error('No labels to generate');
    }

    const svgStrings: string[] = [];
    for (const label of labels) {
      const svg = await this.renderLabelToSvg(label);
      svgStrings.push(svg);
    }

    const combined = this.combineSvg(svgStrings, options?.asString ?? false);

    if (options?.asString) {
      return combined as string;
    }
    return new Blob([combined], { type: 'image/svg+xml' });
  }

  async generateSingle(label: Label, options?: SvgGenerateOptions): Promise<Blob | string> {
    const svg = await this.renderLabelToSvg(label);

    if (options?.asString) {
      return svg;
    }
    return new Blob([svg], { type: 'image/svg+xml' });
  }

  private async renderLabelToSvg(label: Label): Promise<string> {
    const canvas = new Canvas(undefined, {
      selection: false,
      renderOnAddRemove: false
    });

    canvas.setDimensions({
      width: label.width,
      height: label.height
    });
    canvas.backgroundColor = label.backgroundColor;

    if (label.canvasJson) {
      await canvas.loadFromJSON(label.canvasJson);
    }

    const svg = canvas.toSVG();
    canvas.dispose();
    return svg;
  }

  private combineSvg(svgs: string[], asString: boolean): string {
    if (asString) {
      return svgs.join('\n');
    }
    // Wrap multiple SVGs in a container
    const widths: number[] = [];
    const heights: number[] = [];
    const contents: string[] = [];

    for (const svg of svgs) {
      const match = svg.match(/width="(\d+)"[^>]*height="(\d+)"/);
      if (match) {
        widths.push(parseInt(match[1]));
        heights.push(parseInt(match[2]));
      }
      const bodyMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      if (bodyMatch) {
        contents.push(bodyMatch[1]);
      }
    }

    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const maxHeight = Math.max(...heights);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${maxHeight}">
${contents.join('\n')}
</svg>`;
  }
}
