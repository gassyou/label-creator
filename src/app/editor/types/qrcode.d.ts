declare module 'qrcode' {
  export function toCanvas(canvas: HTMLCanvasElement, text: string, options?: { width?: number }): void;
  export function toDataURL(text: string, options?: any): Promise<string>;
  /** 生成 SVG 字符串。type: 'svg' 时返回 SVG 文本，type: 'utf8' 时返回 utf8 字符串。 */
  export function toString(text: string, options?: { type?: 'svg' | 'utf8' | 'terminal'; margin?: number; color?: { dark?: string; light?: string }; width?: number }): Promise<string>;
}