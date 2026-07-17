import { FONT_REGISTRY } from './font-registry';

/**
 * 浏览器端字体加载器（用 FontFace API）
 *
 * 解决"用户电脑里没装字体，Fabric/Canvas 渲染时回退到系统默认"的问题：
 * 在编辑器加载时把 FONT_REGISTRY 里的所有 TTF 通过 FontFace API 注册到 document.fonts，
 * 之后浏览器在任何 canvas 渲染文本时都会用上正确的字体。
 *
 * 懒加载语义：fetch 一次，document.fonts 全局缓存，Fabric 也共用。
 */
class WebFontLoader {
  private loaded = new Set<string>();
  private loadingPromise: Promise<void> | null = null;

  /**
   * 加载 FONT_REGISTRY 里的所有字体到 document.fonts
   * 多次调用是同一个 promise（不会重复加载）
   */
  ensureLoaded(): Promise<void> {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.loadAll();
    return this.loadingPromise;
  }

  private async loadAll(): Promise<void> {
    const targets = FONT_REGISTRY.map((v) => ({
      family: v.cssFamily,
      weight: this.normalizeWeight(v.weight),
      style: v.style,
      url: v.file,
      key: `${v.cssFamily}|${v.weight}|${v.style}`,
    }));

    await Promise.all(
      targets.map(async (t) => {
        if (this.loaded.has(t.key)) return;
        try {
          const fontFace = new FontFace(t.family, `url(${t.url})`, {
            weight: t.weight,
            style: t.style,
            display: 'swap',
          });
          await fontFace.load();
          document.fonts.add(fontFace);
          this.loaded.add(t.key);
        } catch (err) {
          console.error(
            `[WebFontLoader] Failed to load ${t.family} ${t.weight} ${t.style} from ${t.url}:`,
            err
          );
        }
      })
    );
  }

  /**
   * 等待某个具体字体就绪（其他代码可以 await 它）
   */
  async whenLoaded(
    family: string,
    weight: 'normal' | 'bold' = 'normal',
    style: 'normal' | 'italic' = 'normal'
  ): Promise<void> {
    await this.ensureLoaded();
    if (document.fonts.check(`${weight} ${style} 16px "${family}"`)) {
      return;
    }
    // 如果还没就绪，轮询等一下
    return new Promise((resolve) => {
      const tryCheck = () => {
        if (document.fonts.check(`${weight} ${style} 16px "${family}"`)) {
          resolve();
        } else {
          setTimeout(tryCheck, 30);
        }
      };
      tryCheck();
    });
  }

  private normalizeWeight(w: string | number): string {
    if (typeof w === 'number') return String(w);
    // 'normal' → '400', 'bold' → '700'
    if (w === 'normal') return '400';
    if (w === 'bold') return '700';
    return w;
  }

  /**
   * 清空缓存（测试用）
   */
  clearCache(): void {
    this.loaded.clear();
    this.loadingPromise = null;
  }
}

export const webFontLoader = new WebFontLoader();
