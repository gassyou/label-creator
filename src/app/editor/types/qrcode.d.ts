declare module 'qrcode' {
  export function toCanvas(canvas: HTMLCanvasElement, text: string, options?: { width?: number }): void;
  export function toDataURL(text: string, options?: any): Promise<string>;
}