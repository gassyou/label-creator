declare const JsBarcode: any;
declare const qrcode: any;

/**
 * Generate barcode image (PNG)
 */
export function generateBarcode(value: string, format: string, height: number = 50): string {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: format,
      width: 1,
      height: height,
      displayValue: false
    });
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('Barcode generation failed:', e);
    return createPlaceholderImage(value, 'BC');
  }
}

/**
 * Generate QR code image (SVG)
 */
export function generateQRCode(value: string, size: number = 100): string {
  try {
    const svg = qrcode.generateSVG(value, { width: size });
    return 'data:image/svg+xml;base64,' + btoa(svg);
  } catch (e) {
    console.error('QR code generation failed:', e);
    return createPlaceholderImage(value, 'QR');
  }
}

function createPlaceholderImage(text: string, type: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, 200, 100);
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(0, 0, 200, 100);
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(type + ': ' + text, 100, 55);
  }
  return canvas.toDataURL('image/png');
}