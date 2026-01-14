
import React, { useEffect, useRef } from 'react';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

interface MermaidChartProps {
  id: string;
  code: string;
  themeVars?: any;
  onNodeClick?: (nodeText: string) => void;
}

const MermaidChart: React.FC<MermaidChartProps> = ({ id, code, themeVars, onNodeClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderChart = async () => {
      if (containerRef.current && code) {
        try {
          const config = {
            startOnLoad: false,
            theme: 'base',
            securityLevel: 'loose',
            fontFamily: 'Inter, system-ui, "Microsoft YaHei", sans-serif',
            themeVariables: themeVars || {
              primaryColor: '#6366f1',
              primaryTextColor: '#fff',
              lineColor: '#818cf8',
            }
          };

          mermaid.initialize(config);
          
          containerRef.current.innerHTML = '';
          const chartId = `mermaid-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
          const { svg } = await mermaid.render(chartId, code);
          
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
            
            // Post-render: Add interactivity
            const svgEl = containerRef.current.querySelector('svg');
            if (svgEl && onNodeClick) {
              // Find all nodes (usually rects or polygons with text labels)
              const nodes = svgEl.querySelectorAll('.node, .mermaid-node, .cluster');
              nodes.forEach(node => {
                const element = node as HTMLElement;
                element.style.cursor = 'pointer';
                element.addEventListener('click', (e) => {
                  e.stopPropagation();
                  const label = element.querySelector('.nodeLabel, text')?.textContent || '';
                  if (label) onNodeClick(label.trim());
                });
                
                // Visual feedback on hover
                element.addEventListener('mouseenter', () => {
                  element.setAttribute('filter', 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.5))');
                });
                element.addEventListener('mouseleave', () => {
                  element.removeAttribute('filter');
                });
              });
            }
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
  }, [id, code, themeVars, onNodeClick]);

  return (
    <div ref={containerRef} className="mermaid-container flex items-center justify-center p-4 bg-transparent rounded-lg overflow-hidden min-h-[150px] transition-all duration-500" />
  );
};

export default MermaidChart;
