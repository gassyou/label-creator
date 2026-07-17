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
  /** 上一次应用到画布的已缩放对象列表，用于比对变更 */
  current: any[];
}

/**
 * 创建可复用的离屏渲染画布（StaticCanvas：无交互开销，适合纯生成场景）
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

    const payload = { ...parsed, objects: scaledObjects, width: widthPx, height: heightPx };
    await canvas.loadFromJSON(payload);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setDimensions({ width: widthPx, height: heightPx });

    cache.loaded = true;
    cache.current = scaledObjects;
    return;
  }

  const objects = canvas.getObjects();

  // 结构不一致（对象数量变化）时回退为完整重建，保证正确性
  if (objects.length !== scaledObjects.length) {
    const payload = { ...parsed, objects: scaledObjects, width: widthPx, height: heightPx };
    await canvas.loadFromJSON(payload);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setDimensions({ width: widthPx, height: heightPx });
    cache.current = scaledObjects;
    return;
  }

  // 增量更新：仅同步变化的文本与图片 src
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
      if (next.src && (!prev || next.src !== prev.src)) {
        await obj.setSrc(next.src);
      }
      // 同步位置与缩放。Fabric 自身会处理 scaleX/Y 与图片自然尺寸的合成，
      // 这里不要把 scaleX 强制设回 1，否则会丢失用户在编辑器里调整过的大小。
      obj.set({ left: next.left, top: next.top });
    }
  }

  cache.current = scaledObjects;
}

/**
 * 按标签物理尺寸缩放对象的位置与大小
 */
export function scaleObjects(parsed: any, widthPx: number, heightPx: number): any[] {
  const canvasWidth = parsed.width || 800;
  const canvasHeight = parsed.height || 600;
  const scaleX = widthPx / canvasWidth;
  const scaleY = heightPx / canvasHeight;

  const objects = parsed.objects || [];
  return objects.map((obj: any) => {
    // 图片（二维码/条码）的处理与 textbox 一致：
    // 只按画布缩放比例缩放 left/top，width/height 保持 obj 原值不乘 scaleX，
    // obj.scaleX/Y 也保留。
    //
    // 原因：FabricImage 序列化时 width/height 对应"逻辑尺寸"（不含 scaleX），
    // toSVG 时视觉尺寸 = naturalWidth × <g transform="scale(scaleX)">。
    // 如果把 scaleX 折进 width，会出现两种坏结果：
    //   1) 用户拖大过的 QR（scaleX>1）会被画到物理画布之外、被 svg2pdf 裁切；
    //   2) 同样的画布缩放被双重应用，元素位置/大小错乱。
    if (obj.type === 'image' && obj.elementType) {
      return {
        ...obj,
        left: (obj.left || 0) * scaleX,
        top: (obj.top || 0) * scaleY
      };
    }

    return {
      ...obj,
      left: (obj.left || 0) * scaleX,
      top: (obj.top || 0) * scaleY,
      // 只按画布缩放比例缩放 width/height，保留 obj.scaleX/scaleY 不动。
      // 如果把 obj.scaleX 折进 width，textbox 的"逻辑宽度"会被压缩，
      // Fabric 排版按逻辑宽度决定换行，原本"刚好一行"的文本会溢出换行。
      width: (obj.width || 100) * scaleX,
      height: (obj.height || 50) * scaleY
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
