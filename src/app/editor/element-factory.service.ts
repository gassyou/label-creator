import { Injectable } from '@angular/core';
import { FabricObject, FabricImage } from 'fabric';
import { AdapterRegistry, ElementAdapter } from './adapters/element-adapter.interface';
import {
  createDefaultRegistry
} from './adapters/fabric-to-element.adapter';
import { ElementType, LabelElement } from './models/editor.models';

/**
 * 元素工厂服务
 * 统一管理元素的创建和转换
 */
@Injectable()
export class ElementFactoryService {
  private registry: AdapterRegistry;

  constructor() {
    this.registry = createDefaultRegistry();
  }

  /**
   * 根据类型获取适配器
   */
  getAdapter(type: ElementType): ElementAdapter<any> {
    const adapter = this.registry.get(type);
    if (!adapter) {
      throw new Error(`No adapter found for element type: ${type}`);
    }
    return adapter;
  }

  /**
   * 根据 Fabric 对象自动检测类型并获取适配器
   */
  findAdapter(fabricObject: FabricObject): ElementAdapter<any> | undefined {
    // 首先检查是否有 elementType 自定义属性
    if ((fabricObject as FabricImage).elementType) {
      return this.registry.get((fabricObject as FabricImage).elementType as ElementType);
    }

    // 否则通过 matches 方法查找
    return this.registry.find(fabricObject);
  }

  /**
   * 将 LabelElement 转换为 Fabric 对象
   */
  async createFabric(element: LabelElement): Promise<FabricObject> {
    const adapter = this.getAdapter(element.type);
    return adapter.toFabric(element);
  }

  /**
   * 将 Fabric 对象转换为 LabelElement
   */
  createElement(fabricObject: FabricObject): LabelElement {
    const adapter = this.findAdapter(fabricObject);
    if (!adapter) {
      throw new Error(`No adapter found for fabric object type: ${fabricObject.type}`);
    }
    return adapter.toElement(fabricObject);
  }

  /**
   * 批量将 Fabric 对象转换为 LabelElement
   */
  createElements(fabricObjects: FabricObject[]): LabelElement[] {
    return fabricObjects
      .map(obj => {
        try {
          return this.createElement(obj);
        } catch (e) {
          console.warn('Failed to convert fabric object to element:', e);
          return null;
        }
      })
      .filter((el): el is LabelElement => el !== null);
  }

  /**
   * 检测 Fabric 对象的元素类型
   */
  detectElementType(fabricObject: FabricObject): ElementType {
    // 检查自定义 elementType 属性
    if ((fabricObject as FabricImage).elementType) {
      return (fabricObject as FabricImage).elementType as ElementType;
    }

    // 标准 Fabric.js 类型映射
    switch (fabricObject.type) {
      case 'i-text':
      case 'textbox':
        return 'text';
      case 'rect':
        return 'rect';
      case 'circle':
        return 'circle';
      case 'triangle':
        return 'triangle';
      case 'line':
        return 'line';
      case 'image':
        return 'image';
      default:
        return 'rect';
    }
  }

  /**
   * 注册自定义适配器
   */
  registerAdapter(adapter: ElementAdapter<any>): void {
    this.registry.register(adapter);
  }
}