import { FabricObject, FabricImage } from 'fabric';
import { ElementType, LabelElement, TextElement, RectElement, CircleElement, TriangleElement, LineElement, BarcodeElement, QRCodeElement, ImageElement } from '../models/editor.models';

/**
 * 元素适配器接口
 * 负责 LabelElement 模型与 Fabric.js 对象之间的双向转换
 */
export interface ElementAdapter<T extends LabelElement> {
  /** 元素类型 */
  readonly elementType: ElementType;

  /**
   * 将 Fabric 对象转换为 LabelElement 模型
   */
  toElement(fabricObject: FabricObject): T;

  /**
   * 将 LabelElement 模型转换为 Fabric 对象
   */
  toFabric(element: T): FabricObject | Promise<FabricObject>;

  /**
   * 判断 Fabric 对象是否匹配此适配器
   */
  matches(fabricObject: FabricObject): boolean;
}

/**
 * 元素适配器注册表
 */
export class AdapterRegistry {
  private adapters: Map<ElementType, ElementAdapter<any>> = new Map();

  register(adapter: ElementAdapter<any>): void {
    this.adapters.set(adapter.elementType, adapter);
  }

  get(type: ElementType): ElementAdapter<any> | undefined {
    return this.adapters.get(type);
  }

  find(fabricObject: FabricObject): ElementAdapter<any> | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.matches(fabricObject)) {
        return adapter;
      }
    }
    return undefined;
  }
}