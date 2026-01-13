
import React, { useEffect, useRef } from 'react';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

interface MermaidChartProps {
  id: string;
  code: string;
  themeVars?: any;
}

const MermaidChart: React.FC<MermaidChartProps> = ({ id, code, themeVars }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderChart = async () => {
      if (containerRef.current && code) {
        try {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            securityLevel: 'loose',
            fontFamily: 'Inter, system-ui, "Microsoft YaHei", sans-serif',
            themeVariables: themeVars || {
              primaryColor: '#6366f1',
              primaryTextColor: '#fff',
              lineColor: '#818cf8',
            }
          });
          
          // Clear previous content
          containerRef.current.innerHTML = '';
          const chartId = `mermaid-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
          const { svg } = await mermaid.render(chartId, code);
          
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        } catch (error) {
          console.error('Mermaid render error:', error);
          if (containerRef.current) {
            containerRef.current.innerHTML = `<div class="p-4 text-rose-400 text-[10px] font-mono break-all bg-slate-900/50 rounded">图表渲染错误，请检查源码。</div>`;
          }
        }
      }
    };

    renderChart();
  }, [id, code, themeVars]);

  return (
    <div ref={containerRef} className="mermaid-container flex items-center justify-center p-4 bg-transparent rounded-lg overflow-hidden min-h-[150px]" />
  );
};

export default MermaidChart;
