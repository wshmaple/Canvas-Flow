
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, Minus, Trash2, Activity, Palette, Sparkles, Wand2, MessageSquare, Zap, RefreshCw, Send, Map as MapIcon, Target
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { 
  AgentRole, AgentStatus, CanvasElement, CollaborativeResponse, 
  DiagramType, THEMES, ElementTheme, Connection, ThinkingStep, CanvasProjectState 
} from './types';
import { processCollaborativeContent, modifyDiagramContent, drillDownElement } from './services/geminiService';
import { calculateHierarchicalLayout } from './services/layoutService';
import AgentPanel from './components/AgentPanel';
import SmartDiagram from './components/SmartDiagram';
import CanvasControlHub, { InteractionMode } from './components/CanvasControlHub';

/**
 * 连线渲染层
 */
const ConnectionLines: React.FC<{ elements: CanvasElement[], connections: Connection[], scale: number }> = ({ elements, connections, scale }) => {
  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 5 }}>
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orientation="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" opacity="0.4" />
        </marker>
      </defs>
      {connections.map(conn => {
        const from = elements.find(e => e.id === conn.fromId);
        const to = elements.find(e => e.id === conn.toId);
        if (!from || !to) return null;

        const fx = from.x + 550;
        const fy = from.y + 200;
        const tx = to.x;
        const ty = to.y + 200;
        const midX = fx + (tx - fx) / 2;

        return (
          <path 
            key={conn.id}
            d={`M ${fx} ${fy} L ${midX} ${fy} L ${midX} ${ty} L ${tx} ${ty}`} 
            fill="none" 
            stroke="#6366f1" 
            strokeWidth="1.5" 
            opacity="0.15" 
            markerEnd="url(#arrowhead)" 
          />
        );
      })}
    </svg>
  );
};

const Minimap: React.FC<{ elements: CanvasElement[], offset: {x:number, y:number}, scale: number }> = ({ elements, offset, scale }) => {
  if (elements.length === 0) return null;
  const minX = Math.min(...elements.map(e => e.x)) - 500;
  const minY = Math.min(...elements.map(e => e.y)) - 500;
  const maxX = Math.max(...elements.map(e => e.x)) + 1500;
  const maxY = Math.max(...elements.map(e => e.y)) + 1500;
  const width = maxX - minX;
  const height = maxY - minY;
  const mapWidth = 200;
  const mapHeight = Math.min((height / width) * mapWidth, 150);
  const factor = mapWidth / width;

  return (
    <div className="fixed bottom-32 right-8 bg-slate-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-2 z-[60] overflow-hidden">
      <div className="relative bg-slate-950 rounded-lg overflow-hidden" style={{ width: mapWidth, height: mapHeight }}>
        {elements.map(el => (
          <div key={el.id} className="absolute bg-indigo-500 opacity-60 rounded-sm" style={{ left: (el.x - minX) * factor, top: (el.y - minY) * factor, width: 550 * factor, height: 400 * factor }} />
        ))}
        <div className="absolute border border-indigo-500 bg-indigo-500/10" style={{ left: ((-offset.x/scale) - minX) * factor, top: ((-offset.y/scale) - minY) * factor, width: (window.innerWidth/scale) * factor, height: (window.innerHeight/scale) * factor }} />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [offset, setOffset] = useState({ x: 100, y: 100 });
  const [scale, setScale] = useState(0.8);
  const [showGrid, setShowGrid] = useState(true);
  const [mode, setMode] = useState<InteractionMode>('select');
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isFullScreen, setIsFullScreen] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const animFrame = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 快捷键系统
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') { setMode('pan'); }
      if (e.key.toLowerCase() === 'v') { setMode('select'); }
      if (e.key.toLowerCase() === 'h') { setMode('pan'); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { setMode('select'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 视口裁剪逻辑
  const visibleIds = useMemo(() => {
    if (!canvasRef.current) return new Set<string>();
    const { width, height } = canvasRef.current.getBoundingClientRect();
    const vL = -offset.x / scale - 600;
    const vR = (width - offset.x) / scale + 600;
    const vT = -offset.y / scale - 600;
    const vB = (height - offset.y) / scale + 600;

    return new Set(elements.filter(el => 
      el.x + 600 > vL && el.x < vR && el.y + 500 > vT && el.y < vB
    ).map(el => el.id));
  }, [elements, offset, scale]);

  const updateAgent = useCallback((role: AgentRole, status: AgentStatus['status'], message: string) => {
    setAgents(prev => {
      const existing = prev.find(a => a.role === role);
      if (existing) return prev.map(a => a.role === role ? { ...a, status, message } : a);
      return [...prev, { role, status, message }];
    });
  }, []);

  const handleProcess = async () => {
    if (!input.trim() || isProcessing) return;
    setIsProcessing(true);
    setAgents([]);
    setThinkingSteps([]);

    try {
      updateAgent(AgentRole.SCHEDULER, 'processing', '协同调度：解析宏观架构文档...');
      const result = await processCollaborativeContent(input);
      
      const newElements: CanvasElement[] = result.diagrams.map((diag, i) => ({
        id: crypto.randomUUID(),
        type: diag.decision.recommendedType as DiagramType,
        mermaidCode: diag.generation.mermaidCode,
        x: 100 + i * 650, y: 100, scale: 1,
        title: diag.title,
        deconstructedElements: diag.parsing.entities,
        themeId: THEMES[i % THEMES.length].id
      }));

      const newConns: Connection[] = result.relationships.map(rel => ({
        id: crypto.randomUUID(),
        fromId: newElements[rel.fromIndex]?.id,
        toId: newElements[rel.toIndex]?.id,
        label: rel.label
      })).filter(c => c.fromId && c.toId);

      setElements(prev => [...prev, ...newElements]);
      setConnections(prev => [...prev, ...newConns]);
      updateAgent(AgentRole.SCHEDULER, 'completed', '解析完成，架构拓扑已就绪');
      setTimeout(handleFitView, 150);
    } catch (e) {
      updateAgent(AgentRole.SCHEDULER, 'error', 'AI 协同失败，请检查输入或网络');
    } finally { setIsProcessing(false); }
  };

  const autoLayout = () => {
    const positions = calculateHierarchicalLayout(elements, connections);
    setElements(prev => prev.map(el => {
      const pos = positions.find(p => p.id === el.id);
      return pos ? { ...el, x: pos.x, y: pos.y } : el;
    }));
  };

  const handleFitView = () => {
    if (elements.length === 0 || !canvasRef.current) return;
    const padding = 150;
    const minX = Math.min(...elements.map(e => e.x));
    const maxX = Math.max(...elements.map(e => e.x + 550));
    const minY = Math.min(...elements.map(e => e.y));
    const maxY = Math.max(...elements.map(e => e.y + 400));
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    const newScale = Math.min(width / contentWidth, height / contentHeight, 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setOffset({ x: width / 2 - centerX * newScale, y: height / 2 - centerY * newScale });
    setScale(newScale);
  };

  const handleDrillDown = async (parent: CanvasElement, entity: string) => {
    updateAgent(AgentRole.CONTENT_PARSER, 'processing', `下钻分析：模块 ${entity}`);
    try {
      const diag = await drillDownElement(parent, entity);
      const newEl: CanvasElement = {
        id: crypto.randomUUID(),
        parentId: parent.id,
        type: diag.decision.recommendedType as DiagramType,
        mermaidCode: diag.generation.mermaidCode,
        x: parent.x + 750, y: parent.y + 100, scale: 1,
        title: diag.title,
        deconstructedElements: diag.parsing.entities,
        themeId: parent.themeId
      };
      setElements(prev => [...prev, newEl]);
      setConnections(prev => [...prev, { id: crypto.randomUUID(), fromId: parent.id, toId: newEl.id, label: 'Detail' }]);
      updateAgent(AgentRole.CONTENT_PARSER, 'completed', `子模块解析完成`);
    } catch (e) {
      updateAgent(AgentRole.CONTENT_PARSER, 'error', '下钻失败');
    }
  };

  const updateCardCode = async (el: CanvasElement) => {
    if (!el.localChatInput?.trim()) return;
    setElements(prev => prev.map(i => i.id === el.id ? { ...i, isLocalUpdating: true } : i));
    try {
      const newCode = await modifyDiagramContent(el.mermaidCode, el.localChatInput);
      setElements(prev => prev.map(i => i.id === el.id ? { ...i, mermaidCode: newCode, localChatInput: '', isLocalUpdating: false } : i));
    } catch (e) {
      setElements(prev => prev.map(i => i.id === el.id ? { ...i, isLocalUpdating: false } : i));
    }
  };

  const handleExportImage = async () => {
    if (!captureRef.current) return;
    updateAgent(AgentRole.INTERACTION_FEEDBACK, 'processing', '渲染导出图像中...');
    try {
      const canvas = await html2canvas(captureRef.current, { backgroundColor: '#020617', scale: 2, logging: false, useCORS: true });
      const link = document.createElement('a');
      link.download = `blueprint-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      updateAgent(AgentRole.INTERACTION_FEEDBACK, 'completed', '图像导出成功');
    } catch (e) {
      updateAgent(AgentRole.INTERACTION_FEEDBACK, 'error', '导出失败');
    }
  };

  const handleSaveProject = () => {
    const project: CanvasProjectState = {
      version: "1.0",
      timestamp: Date.now(),
      elements,
      connections,
      viewConfig: { offset, scale, showGrid }
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `architect-project-${new Date().toISOString().slice(0,10)}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    updateAgent(AgentRole.INTERACTION_FEEDBACK, 'completed', '工程存档已下载');
  };

  const handleLoadProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const project = JSON.parse(e.target?.result as string) as CanvasProjectState;
        if (project.elements && project.connections) {
          setElements(project.elements);
          setConnections(project.connections);
          if (project.viewConfig) {
            setOffset(project.viewConfig.offset);
            setScale(project.viewConfig.scale);
            setShowGrid(project.viewConfig.showGrid);
          }
          updateAgent(AgentRole.INTERACTION_FEEDBACK, 'completed', '项目已成功加载');
        }
      } catch (err) {
        updateAgent(AgentRole.INTERACTION_FEEDBACK, 'error', '无效的项目存档文件');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearCanvas = () => {
    if (elements.length === 0) return;
    if (window.confirm("确定要清空当前画布吗？所有未保存的内容都将丢失。")) {
      setElements([]);
      setConnections([]);
      setOffset({ x: 100, y: 100 });
      setScale(0.8);
      updateAgent(AgentRole.INTERACTION_FEEDBACK, 'completed', '画布已清空');
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = Math.pow(1.1, -e.deltaY / 100);
    const newScale = Math.min(Math.max(scale * factor, 0.05), 5);
    const newOffsetX = mouseX - (mouseX - offset.x) * (newScale / scale);
    const newOffsetY = mouseY - (mouseY - offset.y) * (newScale / scale);
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (animFrame.current) cancelAnimationFrame(animFrame.current);
    animFrame.current = requestAnimationFrame(() => {
      if (draggingId) {
        setElements(prev => prev.map(el => el.id === draggingId ? { ...el, x: (e.clientX - offset.x) / scale - dragOffset.x, y: (e.clientY - offset.y) / scale - dragOffset.y } : el));
      } else if (isPanning) {
        setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      }
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (mode === 'pan' || e.shiftKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-200 overflow-hidden font-sans select-none">
      <aside className="w-80 h-full border-r border-slate-800 bg-slate-900/40 backdrop-blur-3xl z-20 flex flex-col shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-indigo-400" />
          <h1 className="font-black tracking-tighter uppercase text-base">Diagram Architect</h1>
        </div>
        <div className="p-6 space-y-6 flex-1 overflow-y-auto no-scrollbar">
          <div className="space-y-3">
             <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">Content Input</label>
             <textarea 
               value={input} 
               onChange={(e) => setInput(e.target.value)} 
               placeholder="粘贴需求文档，Agent 将为你建立逻辑图谱..." 
               className="w-full h-52 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-all placeholder:text-slate-800 font-mono leading-relaxed" 
             />
          </div>
          <button onClick={handleProcess} disabled={isProcessing} className="group w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black text-[11px] uppercase flex items-center justify-center gap-3 shadow-[0_15px_30px_-5px_rgba(79,70,229,0.3)] transition-all active:scale-[0.98]">
            {isProcessing ? <Activity className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-white" />} 
            {isProcessing ? 'Agents Thinking...' : 'Build Architecture'}
          </button>
          <AgentPanel agents={agents} thinkingSteps={thinkingSteps} />
        </div>
      </aside>

      <main 
        ref={canvasRef}
        className={`flex-1 relative transition-colors duration-500 overflow-hidden ${
          mode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
        } ${showGrid ? 'bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:50px_50px]' : 'bg-[#020617]'}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={() => { setIsPanning(false); setDraggingId(null); }}
        onWheel={handleWheel}
      >
        <div 
          ref={captureRef}
          className="absolute inset-0 origin-top-left will-change-transform" 
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          <ConnectionLines elements={elements} connections={connections} scale={scale} />
          {elements.map(el => (
            <div 
              key={el.id} 
              className={`absolute bg-slate-900 border-2 border-slate-800 rounded-[32px] w-[550px] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-300 hover:border-indigo-500/40 ${
                draggingId === el.id ? 'z-50 scale-[1.01] ring-2 ring-indigo-500/20' : 'z-10'
              }`} 
              style={{ left: el.x, top: el.y }}
            >
              <div 
                className={`px-6 py-4 border-b border-slate-800 bg-white/[0.03] flex items-center justify-between ${mode === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-inherit'}`}
                onMouseDown={(e) => { 
                  if (mode === 'select') {
                    e.stopPropagation(); 
                    setDraggingId(el.id); 
                    setDragOffset({ x: (e.clientX - offset.x) / scale - el.x, y: (e.clientY - offset.y) / scale - el.y }); 
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">{el.title}</span>
                </div>
                <button onClick={() => setElements(prev => prev.filter(i => i.id !== el.id))} className="text-slate-600 hover:text-rose-400 transition-colors p-1.5 hover:bg-white/5 rounded-xl"><Trash2 className="w-4 h-4" /></button>
              </div>
              
              <div className="p-7">
                <SmartDiagram 
                  id={el.id} 
                  code={el.mermaidCode} 
                  isVisible={visibleIds.has(el.id)} 
                  onNodeClick={(label) => handleDrillDown(el, label)}
                />
                
                <div className="mt-6 flex gap-3">
                  <div className="relative flex-1 group">
                    <input 
                      value={el.localChatInput || ''}
                      onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, localChatInput: e.target.value } : i))}
                      onKeyDown={(e) => e.key === 'Enter' && updateCardCode(el)}
                      placeholder="微调当前模块逻辑..." 
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-4 pr-12 py-3 text-xs outline-none focus:border-indigo-500/50 transition-all font-medium"
                    />
                    <Sparkles className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
                  </div>
                  <button onClick={() => updateCardCode(el)} disabled={el.isLocalUpdating} className="p-3 bg-indigo-600/10 text-indigo-400 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-50 border border-indigo-500/20">
                    {el.isLocalUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <Minimap elements={elements} offset={offset} scale={scale} />
        
        <CanvasControlHub 
          scale={scale}
          mode={mode}
          onSetMode={setMode}
          onZoomIn={() => { const s = Math.min(scale * 1.2, 5); setScale(s); }}
          onZoomOut={() => { const s = Math.max(scale * 0.8, 0.05); setScale(s); }}
          onSetScale={(s) => setScale(s)}
          onReset={() => { setOffset({x:100, y:100}); setScale(1); }}
          onFitView={handleFitView}
          onAutoLayout={autoLayout}
          onExportImage={handleExportImage}
          onSaveProject={handleSaveProject}
          onLoadProject={() => fileInputRef.current?.click()}
          onClearCanvas={handleClearCanvas}
          isFullScreen={isFullScreen}
          onToggleFullScreen={toggleFullScreen}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid(!showGrid)}
        />

        {/* Hidden File Input for Loading */}
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".json" 
          onChange={handleLoadProject} 
        />
      </main>
    </div>
  );
};

export default App;
