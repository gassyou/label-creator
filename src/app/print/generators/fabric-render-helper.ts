import { StaticCanvas, FabricImage, Pattern } from 'fabric';
import { Label } from '../../editor/models/label.models';

/**
 * 渲染缓存状态
 *
 * 同一模板下所有标签的对象树结构一致（顺序、数量相同），
 * 仅文本内容与图片 src 不同。首个标签构建对象树后，
 * 后续标签只增量更新变化的对象，避免重复 loadFromJSON 与图片重解码。
 */
export interface RenderCache {
  loaded: boolean;
  /** 上一次应用到画布的对象列表，用于比对变更 */
  current: any[];
}

/**
 * 创建可复用的离屏渲染画布（StaticCanvas：无交互开销，适合纯生成场景）。
 *
 * 画布尺寸取自传入的 widthPx/heightPx（即标签的 PDF 物理像素尺寸）：
 * label.width × PX_PER_MM。这样 fabric 用 PDF 像素坐标系，svg2pdf 渲染时
 * 不需要再缩放 viewBox，所有元素按 1:1 写入 PDF。
 */
export function createRenderCanvas(widthPx: number, heightPx: number): StaticCanvas {
  const element = document.createElement('canvas');
  element.width = widthPx;
  element.height = heightPx;

  const canvas = new StaticCanvas(element, {
    renderOnAddRemove: false
  });
  canvas.setDimensions({ width: widthPx, height: heightPx });
  return canvas;
}

/**
 * 将标签内容应用到画布：
 * - 首个标签：完整 loadFromJSON 构建对象树；
 * - 后续标签：仅增量更新变化的文本与图片，复用已构建的对象树。
 *
 * 坐标策略：canvasJson 是 fabric.toJSON() 输出，不包含顶层 width/height
 * （fabric loadFromJSON 注释："loadFromJSON does not affect canvas size"）。
 * 这里把所有对象的 left/top/width/height 按 (widthPx, heightPx) / 设计尺寸
 * 缩放到 PDF 像素坐标系。
 */
export async function applyLabelToCanvas(
  canvas: StaticCanvas,
  label: Label,
  widthPx: number,
  heightPx: number,
  cache: RenderCache
): Promise<void> {
  if (!label.canvasJson) {
    if (!cache.loaded) {
      canvas.backgroundColor = label.backgroundColor;
      await applyBackgroundImage(canvas, label);
      cache.loaded = true;
      cache.current = [];
    }
    return;
  }

  const parsed = JSON.parse(label.canvasJson);
  const scaledObjects = scaleObjects(parsed, widthPx, heightPx);

  // 首个标签：完整构建对象树
  if (!cache.loaded) {
    canvas.backgroundColor = label.backgroundColor;
    await applyBackgroundImage(canvas, label);

    await canvas.loadFromJSON({ ...parsed, objects: scaledObjects });
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setDimensions({ width: widthPx, height: heightPx });

    cache.loaded = true;
    cache.current = scaledObjects;
    return;
  }

  const objects = canvas.getObjects();

  // 结构不一致（对象数量变化）时回退为完整重建，保证正确性
  if (objects.length !== scaledObjects.length) {
    await canvas.loadFromJSON({ ...parsed, objects: scaledObjects });
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setDimensions({ width: widthPx, height: heightPx });
    cache.current = scaledObjects;
    return;
  }

  for (let k = 0; k < objects.length; k++) {
    const next = scaledObjects[k];
    const prev = cache.current[k];
    const obj = objects[k] as any;
    const type = String(next?.type || '').toLowerCase();

    if (type === 'text' || type === 'textbox' || type === 'i-text') {
      if (!prev || next.text !== prev.text) {
        obj.set('text', next.text ?? '');
      }
    } else if (type === 'image') {
      // 同步 left/top（被 scaleObjects 缩放过）。
      // 同步 src：data binding 会替换 QR/条码的图片内容。
      // setSrc 会让 fabric 用 element.naturalWidth 重新设置 obj.width/height，
      // 不需要再 obj.set({ width: designWidth }) 还原——保留为 naturalWidth
      // 让 hasCrop() 返回 false，不加 clipPath，image 不会被裁切。
      const props: any = { left: next.left, top: next.top };
      if (next.src && (!prev || next.src !== prev.src)) {
        await obj.setSrc(next.src);
      }
      obj.set(props);
    }
  }
  cache.current = scaledObjects;
}

/**
 * 按目标画布尺寸缩放 canvasJson 里所有对象的 left/top/width/height。
 *
 * canvasJson 是 fabric.toJSON() 输出，没有顶层 width/height；
 * 设计画布尺寸默认等于目标尺寸（用户在编辑器里通常按标签物理尺寸设计），
 * 即 scaleX = scaleY = 1，不会缩放——但仍保留这套机制以便未来支持
 * 设计画布与 PDF 像素尺寸不一致的场景。
 *
 * 已知约束：
 * - textbox 不缩 width（决定换行边界）
 * - image/QR/条码不缩 obj.width/height（fabric 用 element.naturalWidth 决定
 *   image 元素尺寸，obj.width 用于 clipPath；二者失配会触发 hasCrop() 加 clipPath）
 */
function scaleObjects(parsed: any, widthPx: number, heightPx: number): any[] {
  const canvasWidth = parsed.width || widthPx;
  const canvasHeight = parsed.height || heightPx;
  const scaleX = widthPx / canvasWidth;
  const scaleY = heightPx / canvasHeight;

  const objects = parsed.objects || [];
  return objects.map((obj: any) => {
    const type = String(obj.type || '').toLowerCase();
    const isTextbox = type === 'textbox' || obj.type === 'Textbox';
    const isImage = type === 'image';
    return {
      ...obj,
      left: (obj.left || 0) * scaleX,
      top: (obj.top || 0) * scaleY,
      width: isTextbox || isImage
        ? (obj.width || 100)
        : (obj.width || 100) * scaleX,
      height: isTextbox || isImage
        ? (obj.height || 50)
        : (obj.height || 50) * scaleY
    };
  });
}

/**
 * 应用背景图案到画布
 */
export async function applyBackgroundImage(canvas: StaticCanvas, label: Label): Promise<void> {
  if (!label.backgroundImage) {
    return;
  }
  try {
    const bgImg = await FabricImage.fromURL(label.backgroundImage);
    const pattern = new Pattern({
      source: bgImg.getElement(),
      repeat: 'repeat'
    });
    canvas.backgroundColor = pattern;
  } catch (err) {
    console.error('Failed to load background image:', err);
  }
}