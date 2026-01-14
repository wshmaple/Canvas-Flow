
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { renderManager } from '../services/renderManager';
import { Loader2, AlertTriangle } from 'lucide-react';

interface SmartDiagramProps {
  id: string;
  code: string;
  themeVars?: any;
  onNodeClick?: (label: string) => void;
  isVisible: boolean; // 由父组件下发的视口可见性状态
}

const SmartDiagram: React.FC<SmartDiagramProps> = ({ id, code, themeVars, onNodeClick, isVisible }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 渲染主逻辑
  useEffect(() => {
    if (!isVisible || !code) return;

    let isMounted = true;
    const executeRender = async () => {
      setIsLoading(true);
      try {
        const svg = await renderManager.render(id, code, themeVars);
        if (isMounted) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err) {
        if (isMounted) setError('Render failed');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    executeRender();
    return () => { isMounted = false; };
  }, [id, code, themeVars, isVisible]);

  // 交互逻辑注入
  useEffect(() => {
    if (!svgContent || !containerRef.current) return;
    
    containerRef.current.innerHTML = svgContent;
    const svgEl = containerRef.current.querySelector('svg');
    if (svgEl && onNodeClick) {
      const nodes = svgEl.querySelectorAll('.node, .mermaid-node');
      nodes.forEach(node => {
        const el = node as HTMLElement;
        el.style.cursor = 'pointer';
        el.onclick = (e) => {
          e.stopPropagation();
          const labelText = el.querySelector('.nodeLabel, text')?.textContent || '';
          onNodeClick(labelText.trim());
        };
      });
    }
  }, [svgContent, onNodeClick]);

  // 虚拟化状态下的轻量占位
  if (!isVisible) {
    return (
      <div className="w-full min-h-[200px] flex items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
        <span className="text-[10px] text-slate-600 font-mono tracking-tighter uppercase">Off-screen hibernating...</span>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[150px] flex items-center justify-center transition-all duration-500">
      {isLoading && !svgContent && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 backdrop-blur-sm z-10 rounded-xl">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      )}
      
      {error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-[10px] font-mono">Invalid Mermaid Syntax</span>
        </div>
      ) : (
        <div ref={containerRef} className="mermaid-render-output w-full animate-in fade-in duration-700" />
      )}
    </div>
  );
};

export default React.memo(SmartDiagram);
