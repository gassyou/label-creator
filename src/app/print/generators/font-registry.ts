/**
 * 字体注册表
 *
 * 加新字体只需 3 步：
 * 1. 把 TTF/OTF 文件丢进 public/fonts/
 * 2. 在 FONT_REGISTRY 数组里加一条配置
 * 3. （可选）如果想在设计器字体选择器里露出来，编辑 FONT_FAMILY_ALIASES
 *
 * 字体文件在导出 PDF 时按需懒加载，不影响首屏。
 */

export type FontStyle = 'normal' | 'italic' | 'oblique';
export type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

export interface FontVariant {
  /** 唯一 ID（jspdf addFont 用），同一字体的不同变体共享 id */
  id: string;
  /** CSS 字体族名（写到 SVG 的 font-family 里），同一字体所有变体共享 cssFamily */
  cssFamily: string;
  /** 字体文件 URL（相对站点根目录） */
  file: string;
  weight: FontWeight;
  style: FontStyle;
  /** 简单的人类可读标签（用于日志/调试） */
  label?: string;
}

/**
 * 字体注册表
 * 同一字体的所有变体（Regular/Bold/Italic/BoldItalic）放在相邻位置。
 */
export const FONT_REGISTRY: FontVariant[] = [
  // ===== Liberation Sans（Arial 开源替身，OFL 协议） =====
  {
    id: 'LiberationSans',
    cssFamily: 'Liberation Sans',
    file: '/fonts/liberation-sans-regular.ttf',
    weight: 'normal',
    style: 'normal',
    label: 'Liberation Sans Regular',
  },
  {
    id: 'LiberationSans',
    cssFamily: 'Liberation Sans',
    file: '/fonts/liberation-sans-bold.ttf',
    weight: 'bold',
    style: 'normal',
    label: 'Liberation Sans Bold',
  },
  {
    id: 'LiberationSans',
    cssFamily: 'Liberation Sans',
    file: '/fonts/liberation-sans-italic.ttf',
    weight: 'normal',
    style: 'italic',
    label: 'Liberation Sans Italic',
  },
  {
    id: 'LiberationSans',
    cssFamily: 'Liberation Sans',
    file: '/fonts/liberation-sans-bolditalic.ttf',
    weight: 'bold',
    style: 'italic',
    label: 'Liberation Sans Bold Italic',
  },

  // ===== Noto Sans SC（思源黑体简体，CJK） =====
  {
    id: 'NotoSansSC',
    cssFamily: 'Noto Sans SC',
    file: '/fonts/noto-sans-sc-regular.ttf',
    weight: 'normal',
    style: 'normal',
    label: 'Noto Sans SC Regular',
  },
  {
    id: 'NotoSansSC',
    cssFamily: 'Noto Sans SC',
    file: '/fonts/noto-sans-sc-bold.ttf',
    weight: 'bold',
    style: 'normal',
    label: 'Noto Sans SC Bold',
  },
];

/**
 * 设计器字体名 → PDF 字体的映射
 * 设计端是用户看到的选择，PDF 端是实际渲染用的字体。
 * 多个设计字体可以映射到同一个 PDF 字体（视觉一致时）。
 */
export const FONT_FAMILY_ALIASES: Record<string, string> = {
  Arial: 'Liberation Sans',
  Helvetica: 'Liberation Sans',
  'Helvetica Neue': 'Liberation Sans',
  Verdana: 'Liberation Sans',
  'Courier New': 'Liberation Sans',
  Roboto: 'Liberation Sans',
  'Open Sans': 'Liberation Sans',
  Georgia: 'Liberation Sans',
  Pacifico: 'Liberation Sans',
  'sans-serif': 'Liberation Sans',
  'Microsoft YaHei': 'Noto Sans SC',
  'PingFang SC': 'Noto Sans SC',
  SimSun: 'Noto Sans SC',
  SimHei: 'Noto Sans SC',
};

/**
 * 把任意设计端 font-family 解析成"实际可注册的字体 CSS 族名"
 * 命中别名 → 替换；未命中 → 原样返回（兜底）
 */
export function resolveFontFamily(family: string): string {
  const trimmed = family.trim();
  // 去掉引号和大小写差异
  const key = trimmed.replace(/^['"]|['"]$/g, '');
  return FONT_FAMILY_ALIASES[key] || FONT_FAMILY_ALIASES[key.toLowerCase()] || trimmed;
}

/**
 * 生成用于 SVG 的 font-family 字符串（带 CJK fallback）
 * 形如：`'Liberation Sans', 'Noto Sans SC'`
 */
export function buildSvgFontFamily(primaryCssFamily: string): string {
  const resolved = resolveFontFamily(primaryCssFamily);
  // 始终把 Noto Sans SC 放后面作为 CJK 兜底
  if (resolved === 'Noto Sans SC') {
    return `'Noto Sans SC'`;
  }
  return `'${resolved}', 'Noto Sans SC'`;
}
