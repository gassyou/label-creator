import type { jsPDF } from 'jspdf';
import { FONT_REGISTRY, FontVariant, FontWeight, FontStyle } from './font-registry';

/**
 * 字体加载器（懒加载 + 缓存 + 注册 jspdf）
 *
 * 工作流程：
 * 1. 调用 ensureFontsRegistered(pdf, requestedFamilies) 时
 * 2. 解析出需要的字体变体集合
 * 3. 已经在缓存里的直接复用
 * 4. 没缓存的 fetch 一次二进制 → base64 → 调 jspdf.addFileToVFS + addFont
 * 5. 缓存注册结果，后续直接复用
 */

interface FontEntry {
  variant: FontVariant;
  loaded: boolean;
  loading?: Promise<void>;
}

class FontLoader {
  private entries = new Map<string, FontEntry>(); // key = `${cssFamily}|${weight}|${style}`
  private registeredOnPdf = new WeakSet<jsPDF>();

  /**
   * 获取某变体的缓存 key
   */
  private key(cssFamily: string, weight: FontWeight, style: FontStyle): string {
    return `${cssFamily}|${weight}|${style}`;
  }

  /**
   * 查找匹配指定 (family, weight, style) 的字体变体
   * 找不到时回退到 (family, normal, normal)
   */
  private findVariant(cssFamily: string, weight: FontWeight, style: FontStyle): FontVariant | undefined {
    const exact = FONT_REGISTRY.find(
      (f) => f.cssFamily === cssFamily && f.weight === weight && f.style === style
    );
    if (exact) return exact;

    // 回退到同 family 的 regular
    return FONT_REGISTRY.find(
      (f) => f.cssFamily === cssFamily && f.weight === 'normal' && f.style === 'normal'
    );
  }

  /**
   * 确保一组字体已注册到指定 jspdf 实例
   * 同一 pdf 实例只注册一次；不同 pdf 实例独立
   */
  async ensureFontsRegistered(
    pdf: jsPDF,
    requests: Array<{ cssFamily: string; weight: FontWeight; style: FontStyle }>
  ): Promise<void> {
    const variants = new Set<FontVariant>();

    for (const req of requests) {
      const v = this.findVariant(req.cssFamily, req.weight, req.style);
      if (v) variants.add(v);
    }

    // 去重：同一 jspdf 实例的同一字体只注册一次
    const toRegister: FontVariant[] = [];
    for (const v of variants) {
      const entryKey = this.key(v.cssFamily, v.weight, v.style);
      let entry = this.entries.get(entryKey);
      if (!entry) {
        entry = { variant: v, loaded: false };
        this.entries.set(entryKey, entry);
      }
      // 判断是否需要在这个 pdf 上注册：看这个变体是否已在当前 pdf 注册过
      const regKey = `${entryKey}@${this.getPdfId(pdf)}`;
      if (!(entry as any).registeredPdfs?.has(regKey)) {
        toRegister.push(v);
      }
    }

    // 加载 + 注册
    for (const v of toRegister) {
      await this.loadAndRegisterOne(pdf, v);
    }
  }

  /**
   * 加载并注册一个字体变体到指定 pdf
   */
  private async loadAndRegisterOne(pdf: jsPDF, variant: FontVariant): Promise<void> {
    const entryKey = this.key(variant.cssFamily, variant.weight, variant.style);
    let entry = this.entries.get(entryKey);
    if (!entry) {
      entry = { variant, loaded: false };
      this.entries.set(entryKey, entry);
    }

    // 如果正在加载，等待完成
    if (entry.loading) {
      await entry.loading;
    }

    // 如果还没加载过，启动加载
    if (!entry.loaded) {
      entry.loading = this.fetchAndCacheBase64(variant).then(() => {
        entry!.loaded = true;
      });
      await entry.loading;
    }

    // 注册到 jspdf（VFS 内部是 pdf 实例的 Map，跨实例需要重新 add）
    const b64 = (entry as any).base64;
    if (!b64) {
      throw new Error(`Font ${variant.label || variant.file} not loaded`);
    }
    const vfsName = this.vfsName(variant);
    pdf.addFileToVFS(vfsName, b64);
    // 关键：用 cssFamily（带空格）作为 jspdf 字体名，跟 SVG font-family 一致。
    // 不能用 variant.id（如 "LiberationSans"），否则 svg2pdf 按 "Liberation Sans" 查不到。
    // encoding 必须用 Identity-H —— 默认的 StandardEncoding 只支持 Latin-1 256 字符，
    // CJK 字符（CJK Unified Ideographs 在 U+4E00-U+9FFF）会查不到字形。
    pdf.addFont(vfsName, variant.cssFamily, variant.style, variant.weight, 'Identity-H');

    // 标记已注册
    if (!(entry as any).registeredPdfs) {
      (entry as any).registeredPdfs = new Set<string>();
    }
    (entry as any).registeredPdfs.add(`${entryKey}@${this.getPdfId(pdf)}`);
  }

  /**
   * 懒加载字体文件并转 base64
   */
  private async fetchAndCacheBase64(variant: FontVariant): Promise<void> {
    const entry = this.entries.get(this.key(variant.cssFamily, variant.weight, variant.style))!;
    const res = await fetch(variant.file);
    if (!res.ok) {
      throw new Error(
        `Failed to load font ${variant.label || variant.file}: HTTP ${res.status} ${res.statusText}`
      );
    }
    const buf = await res.arrayBuffer();
    (entry as any).base64 = arrayBufferToBase64(buf);
  }

  /**
   * jspdf VFS 内的字体文件名（同一变体跨 pdf 实例可以共享）
   */
  private vfsName(variant: FontVariant): string {
    return `${variant.id}-${variant.weight}-${variant.style}.${variant.file.split('.').pop()}`;
  }

  private pdfIdCounter = 0;
  private pdfIds = new WeakMap<jsPDF, number>();
  private getPdfId(pdf: jsPDF): number {
    let id = this.pdfIds.get(pdf);
    if (id === undefined) {
      id = ++this.pdfIdCounter;
      this.pdfIds.set(pdf, id);
    }
    return id;
  }

  /**
   * 清空缓存（测试用）
   */
  clearCache(): void {
    this.entries.clear();
  }
}

/** 单例 */
export const fontLoader = new FontLoader();

/**
 * ArrayBuffer → base64（避免大字符串 split join）
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunks
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}
