import { FONT_REGISTRY, buildSvgFontFamily, resolveFontFamily } from './font-registry';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 判断一个字符是否属于 CJK（需要用 Noto Sans SC）
 * 覆盖：中日韩统一表意、CJK 扩展、兼容表意、符号标点、平假名、片假名、全角字符
 */
function isCjkChar(char: string): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||   // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) ||   // CJK Extension A
    (code >= 0xf900 && code <= 0xfaff) ||   // CJK Compatibility Ideographs
    (code >= 0x3000 && code <= 0x303f) ||   // CJK Symbols and Punctuation
    (code >= 0x3040 && code <= 0x309f) ||   // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) ||   // Katakana
    (code >= 0xff00 && code <= 0xffef)      // Fullwidth Forms
  );
}

/**
 * 把 Fabric 输出的 SVG 里的 font-family 改写成我们注册到 jspdf 的字体。
 *
 * Fabric 输出的 SVG 可能用 attribute 或 style 两种方式写 font-family：
 *   <text font-family="Arial" ...>...</text>
 *   <text style="font-family: Arial; ...">...</text>
 *
 * 全部统一改写。同时把 font-weight / font-style 也标准化。
 */
export function rewriteSvgFontFamily(svg: string): string {
  // 1) 处理 font-family 属性：font-family="X"
  // 用 \b 词边界避免误匹配；允许单/双引号
  // 关键：不在字体名外面再加引号（不要写 "'Liberation Sans'"），
  // svg2pdf 直接拿这个字符串去 jspdf 注册表里查，引号会被算进名字导致查不到。
  let result = svg.replace(
    /font-family\s*=\s*"([^"]*)"/g,
    (_match, family) => {
      const mapped = resolveFontFamily(family);
      const final = mapped === 'Noto Sans SC' ? 'Noto Sans SC' : `${mapped}, Noto Sans SC`;
      return `font-family="${final}"`;
    }
  );
  result = result.replace(
    /font-family\s*=\s*'([^']*)'/g,
    (_match, family) => {
      const mapped = resolveFontFamily(family);
      const final = mapped === 'Noto Sans SC' ? 'Noto Sans SC' : `${mapped}, Noto Sans SC`;
      return `font-family='${final}'`;
    }
  );

  // 2) 处理 style 里的 font-family
  result = result.replace(
    /font-family\s*:\s*([^;"]+)/g,
    (_match, family) => {
      const mapped = resolveFontFamily(family);
      const final = mapped === 'Noto Sans SC' ? 'Noto Sans SC' : `${mapped}, Noto Sans SC`;
      return `font-family: ${final}`;
    }
  );

  return result;
}

/**
 * 按字符集把每个 <tspan> 内容拆成多段，每段用合适的字体：
 * - ASCII 段用 Liberation Sans
 * - CJK 段用 Noto Sans SC
 *
 * 原因：svg2pdf 不会对 font-family 多值列表做 per-character fallback，
 * 只会选第一个有字形的字体。如果整个 tspan 都标成 Liberation Sans，
 * CJK 字符会显示为 tofu（空方块）。拆开之后每段只有一种字体，svg2pdf
 * 就能正常选对了。
 */
export function splitTspansByCharset(svgString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const tspans = Array.from(doc.querySelectorAll('tspan'));

  for (const tspan of tspans) {
    const text = tspan.textContent || '';
    if (text.length < 2) continue;

    // 快速判断：是否同时含 CJK 和非 CJK
    let hasCjk = false;
    let hasNonCjk = false;
    for (const ch of text) {
      if (isCjkChar(ch)) hasCjk = true;
      else hasNonCjk = true;
      if (hasCjk && hasNonCjk) break;
    }
    if (!hasCjk || !hasNonCjk) continue;

    // 切分成连续段
    const runs: Array<{ text: string; isCjk: boolean }> = [];
    let buf = '';
    let currentIsCjk: boolean | null = null;
    for (const ch of text) {
      const chIsCjk = isCjkChar(ch);
      if (currentIsCjk === null) {
        buf = ch;
        currentIsCjk = chIsCjk;
      } else if (chIsCjk === currentIsCjk) {
        buf += ch;
      } else {
        runs.push({ text: buf, isCjk: currentIsCjk });
        buf = ch;
        currentIsCjk = chIsCjk;
      }
    }
    if (buf && currentIsCjk !== null) runs.push({ text: buf, isCjk: currentIsCjk });

    // 收集原 tspan 的属性（除了 textContent）
    const preservedAttrs: Array<{ name: string; value: string }> = [];
    for (const attr of Array.from(tspan.attributes)) {
      preservedAttrs.push({ name: attr.name, value: attr.value });
    }

    const parent = tspan.parentNode;
    if (!parent) continue;

    // 替换为多个 tspan
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const isFirst = i === 0;
      const newTspan = doc.createElementNS(SVG_NS, 'tspan');
      for (const { name, value } of preservedAttrs) {
        // 第一个 tspan 保留 x（保持行起点），后续 tspan 不带 x（自动接续上一个 tspan 末尾）
        if (!isFirst && name === 'x') continue;
        if (name === 'font-family') {
          // 强制覆盖为对应字体（不带引号，svg2pdf 直接拿这个查 jspdf 注册表）
          newTspan.setAttribute(
            'font-family',
            run.isCjk ? 'Noto Sans SC' : 'Liberation Sans'
          );
        } else {
          newTspan.setAttribute(name, value);
        }
      }
      if (!newTspan.hasAttribute('font-family')) {
        newTspan.setAttribute(
          'font-family',
          run.isCjk ? 'Noto Sans SC' : 'Liberation Sans'
        );
      }
      newTspan.textContent = run.text;
      parent.insertBefore(newTspan, tspan);
    }
    parent.removeChild(tspan);
  }

  return new XMLSerializer().serializeToString(doc);
}

/**
 * 从 SVG 字符串里提取出所有用到的字体组合（family, weight, style）
 * 用于预先注册字体到 jspdf
 */
export function extractFontRequests(svg: string): Array<{
  cssFamily: string;
  weight: 'normal' | 'bold';
  style: 'normal' | 'italic';
}> {
  const requests = new Map<string, { cssFamily: string; weight: 'normal' | 'bold'; style: 'normal' | 'italic' }>();

  // 匹配带 font-family/font-weight/font-style 的元素
  // 这里用比较宽松的匹配，主要是找出每个 <text> 节点的字体组合
  const elementRegex = /<text\b([^>]*)>/g;
  let match;
  while ((match = elementRegex.exec(svg)) !== null) {
    const attrs = match[1];

    // 提取 font-family
    const familyMatch = attrs.match(/font-family\s*=\s*["']([^"']+)["']/);
    const familyStyleMatch = attrs.match(/font-family\s*:\s*([^;"]+)/);
    let family = familyMatch?.[1] || familyStyleMatch?.[1] || 'Liberation Sans';
    family = family.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    family = resolveFontFamily(family);

    // 提取 font-weight
    const weightMatch = attrs.match(/font-weight\s*=\s*["']([^"']+)["']/);
    const weightStyleMatch = attrs.match(/font-weight\s*:\s*([^;"]+)/);
    let weight: 'normal' | 'bold' = 'normal';
    const w = weightMatch?.[1] || weightStyleMatch?.[1] || '';
    if (w === 'bold' || w === '700' || w === '800' || w === '900') {
      weight = 'bold';
    }

    // 提取 font-style
    const styleMatch = attrs.match(/font-style\s*=\s*["']([^"']+)["']/);
    const styleStyleMatch = attrs.match(/font-style\s*:\s*([^;"]+)/);
    let style: 'normal' | 'italic' = 'normal';
    const s = styleMatch?.[1] || styleStyleMatch?.[1] || '';
    if (s === 'italic' || s === 'oblique') {
      style = 'italic';
    }

    const key = `${family}|${weight}|${style}`;
    if (!requests.has(key)) {
      requests.set(key, { cssFamily: family, weight, style });
    }
  }

  return Array.from(requests.values());
}
