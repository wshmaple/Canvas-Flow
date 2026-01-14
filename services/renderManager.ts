
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

/**
 * DiagramRenderManager
 * 一个高性能图表渲染调度器插件
 */
class DiagramRenderManager {
  private static instance: DiagramRenderManager;
  private cache: Map<string, string> = new Map();
  private isInitialized = false;
  private renderQueue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  private constructor() {}

  public static getInstance(): DiagramRenderManager {
    if (!DiagramRenderManager.instance) {
      DiagramRenderManager.instance = new DiagramRenderManager();
    }
    return DiagramRenderManager.instance;
  }

  private async initialize(themeVars?: any) {
    if (this.isInitialized) return;
    
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'loose',
      fontFamily: 'Inter, "PingFang SC", sans-serif',
      themeVariables: themeVars || {
        primaryColor: '#6366f1',
        primaryTextColor: '#fff',
        lineColor: '#818cf8',
      }
    });
    this.isInitialized = true;
  }

  /**
   * 智能渲染方法：带缓存与并发控制
   */
  public async render(id: string, code: string, themeVars: any): Promise<string> {
    const cacheKey = `${code}-${JSON.stringify(themeVars)}`;
    
    // 1. 命中缓存直接返回
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 2. 加入异步调度队列
    return new Promise((resolve, reject) => {
      this.renderQueue.push(async () => {
        try {
          await this.initialize(themeVars);
          const chartId = `svg-${id.replace(/[^a-zA-Z0-9]/g, '')}-${Math.random().toString(36).slice(2, 7)}`;
          const { svg } = await mermaid.render(chartId, code);
          this.cache.set(cacheKey, svg);
          resolve(svg);
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.renderQueue.length === 0) return;
    this.isProcessing = true;
    
    while (this.renderQueue.length > 0) {
      const task = this.renderQueue.shift();
      if (task) await task();
    }
    
    this.isProcessing = false;
  }

  public clearCache() {
    this.cache.clear();
  }
}

export const renderManager = DiagramRenderManager.getInstance();
