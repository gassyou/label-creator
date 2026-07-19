// src/app/editor/models/placeholder-svg.ts

/**
 * Builds a small SVG placeholder used as the initial image for barcode /
 * qrcode elements before any binding value is rendered. Vector-based so it
 * scales cleanly when the editor element is resized — unlike a PNG dataURL
 * which would be rasterized at one resolution and then stretched.
 *
 * The SVG is returned as a data URL ready for FabricImage.fromURL(...).
 * Using `data:image/svg+xml` (rather than a `<svg>` blob) keeps the call
 * site identical to the previous PNG-based implementation.
 */
export function buildPlaceholderDataUrl(text: string, w: number, h: number): string {
  const safeText = escapeXml(text);
  const fontSize = 12;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<rect width="${w}" height="${h}" fill="#ececec"/>` +
      `<text x="50%" y="50%" fill="#888" ` +
        `font-family="Arial, sans-serif" font-size="${fontSize}" ` +
        `text-anchor="middle" dominant-baseline="central">${safeText}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}
