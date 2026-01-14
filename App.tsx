
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, Minus, Maximize2, Trash2, X, Target, ListTree, Activity, Palette, Sparkles,
  Download, Wand2, Search, Zap, MessageSquare, Bot, RefreshCw, Paintbrush, 
  CornerDownRight, Focus, Undo2, Clock, Network, Map as MapIcon, ChevronUp, ChevronDown,
  Send
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { AgentRole, AgentStatus, CanvasElement, CollaborativeResponse, DiagramType, THEMES, ElementTheme, PaletteScheme, Connection, CanvasSnapshot, ThinkingStep } from './types';
import { processCollaborativeContent, modifyDiagramContent, generateProfessionalPalette, handleGlobalAction, drillDownElement } from './services/geminiService';
import { calculateHierarchicalLayout } from './services/layoutService';
import AgentPanel from './components/AgentPanel';
import MermaidChart from './components/MermaidChart';

/**
 * Smart Manhattan ConnectionLines
 */
const ConnectionLines: React.FC<{ elements: CanvasElement[], connections: Connection[], scale: number }> = ({ elements, connections, scale }) => {
  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 5 }}>
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orientation="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" opacity="0.6" />
        </marker>
        <marker id="drillhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orientation="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#f43f5e" opacity="0.8" />
        </marker>
      </defs>
      {connections.map(conn => {
        const from = elements.find(e => e.id === conn.fromId);
        const to = elements.find(e => e.id === conn.toId);
        if (!from || !to) return null;

        const isDrillDown = to.parentId === from.id;
        const color = isDrillDown ? "#f43f5e" : "#6366f1";
        
        // Smarter Routing Logic (Manhattan style)
        const fx = from.x + 550;
        const fy = from.y + 250;
        const tx = to.x;
        const ty = to.y + 250;

        const midX = fx + (tx - fx) / 2;
        
        // Path construction
        const path = `M ${fx} ${fy} L ${midX} ${fy} L ${midX} ${ty} L ${tx} ${ty}`;

        return (
          <g key={conn.id} className="transition-opacity duration-300">
            <path 
              d={path} 
              fill="none" 
              stroke={color}
              strokeWidth={isDrillDown ? "2" : "1.5"} 
              strokeDasharray={isDrillDown ? "4 4" : "none"} 
              opacity={isDrillDown ? "0.5" : "0.2"} 
              markerEnd={isDrillDown ? "url(#drillhead)" : "url(#arrowhead)"} 
            />
            {conn.label && (
              <foreignObject x={midX - 60} y={(fy + ty) / 2 - 12} width="120" height="24">
                <div className="flex items-center justify-center h-full">
                  <span className={`bg-slate-900/90 border ${isDrillDown ? 'border-rose-500/40 text-rose-300' : 'border-indigo-500/40 text-indigo-300'} rounded-full px-2 py-0.5 text-[7px] font-black uppercase tracking-tighter shadow-lg backdrop-blur-md truncate`}>
                    {conn.label}
                  </span>
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/**
 * Minimap Component
 */
const Minimap: React.FC<{ elements: CanvasElement[], offset: {x:number, y:number}, scale: number, onNavigate: (x:number, y:number)=>void }> = ({ elements, offset, scale, onNavigate }) => {
  if (elements.length === 0) return null;
  
  const minX = Math.min(...elements.map(e => e.x)) - 500;
  const minY = Math.min(...elements.map(e => e.y)) - 500;
  const maxX = Math.max(...elements.map(e => e.x)) + 1500;
  const maxY = Math.max(...elements.map(e => e.y)) + 1500;
  
  const width = maxX - minX;
  const height = maxY - minY;
  const mapWidth = 200;
  const mapHeight = (height / width) * mapWidth;
  
  const factor = mapWidth / width;

  return (
    <div className="fixed bottom-32 right-8 bg-slate-900/80 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl p-2 z-[60] overflow-hidden group">
      <div className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1 flex items-center gap-2">
        <MapIcon className="w-3 h-3" /> Navigator
      </div>
      <div className="relative border border-white/5 bg-slate-950 rounded-lg overflow-hidden" style={{ width: mapWidth, height: mapHeight }}>
        {elements.map(el => (
          <div 
            key={el.id} 
            className="absolute rounded-[1px]" 
            style={{ 
              left: (el.x - minX) * factor, 
              top: (el.y - minY) * factor, 
              width: 550 * factor, 
              height: 400 * factor,
              backgroundColor: THEMES.find(t => t.id === el.themeId)?.primary || '#6366f1',
              opacity: 0.6
            }}
          />
        ))}
        {/* Viewport Indicator */}
        <div 
          className="absolute border border-indigo-500 bg-indigo-500/10 transition-all"
          style={{
            left: ((-offset.x/scale) - minX) * factor,
            top: ((-offset.y/scale) - minY) * factor,
            width: (window.innerWidth/scale) * factor,
            height: (window.innerHeight/scale) * factor
          }}
        />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [customThemes, setCustomThemes] = useState<ElementTheme[]>(THEMES);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'list' | 'history'>('input');
  
  const [history, setHistory] = useState<CanvasSnapshot[]>([]);
  const [drillingElementId, setDrillingElementId] = useState<string | null>(null);
  const [isLayouting, setIsLayouting] = useState(false);

  // Theme Workshop
  const [isThemeWorkshopOpen, setIsThemeWorkshopOpen] = useState(false);
  const [baseColor, setBaseColor] = useState('#6366f1');
  const [suggestedPalettes, setSuggestedPalettes] = useState<PaletteScheme[]>([]);
  const [isGeneratingPalette, setIsGeneratingPalette] = useState(false);

  // Global Chat
  const [isGlobalChatOpen, setIsGlobalChatOpen] = useState(false);
  const [globalInput, setGlobalInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'bot', text: string }[]>([]);
  const [isGlobalProcessing, setIsGlobalProcessing] = useState(false);

  // Canvas
  const [offset, setOffset] = useState({ x: 100, y: 100 });
  const [scale, setScale] = useState(0.8);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [elementDragOffset, setElementDragOffset] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

  const addThinkingStep = useCallback((agent: AgentRole, content: string) => {
    setThinkingSteps(prev => [...prev, {
      id: crypto.randomUUID(),
      agent,
      content,
      timestamp: Date.now()
    }]);
  }, []);

  const saveSnapshot = useCallback((label: string) => {
    setHistory(prev => {
      const newSnapshot: CanvasSnapshot = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        label,
        elements: JSON.parse(JSON.stringify(elements)),
        connections: JSON.parse(JSON.stringify(connections))
      };
      return [newSnapshot, ...prev].slice(0, 20);
    });
  }, [elements, connections]);

  const updateAgent = useCallback((role: AgentRole, status: AgentStatus['status'], message: string) => {
    setAgents(prev => {
      const existing = prev.find(a => a.role === role);
      if (existing) return prev.map(a => a.role === role ? { ...a, status, message } : a);
      return [...prev, { role, status, message }];
    });
  }, []);

  const handleProcess = async () => {
    if (!input.trim() || isProcessing) return;
    saveSnapshot('执行全量解构');
    setIsProcessing(true);
    setAgents([]);
    setThinkingSteps([]);

    try {
      updateAgent(AgentRole.SCHEDULER, 'processing', '启动集群解构...');
      addThinkingStep(AgentRole.SCHEDULER, '任务分配：正在启动语义分析器...');
      
      updateAgent(AgentRole.CONTENT_PARSER, 'processing', '解析文档拓扑...');
      addThinkingStep(AgentRole.CONTENT_PARSER, '识别到文本中的宏观逻辑流，正在提取实体关系...');

      const result = await processCollaborativeContent(input);
      addThinkingStep(AgentRole.DIAGRAM_DECISION, '根据拓扑密度，决定采用混合图表方案。');
      
      const diagrams = result?.diagrams || [];
      const relationships = result?.relationships || [];

      const newElements: CanvasElement[] = diagrams.map((diag, index) => ({
        id: crypto.randomUUID(),
        type: diag.decision.recommendedType as DiagramType,
        mermaidCode: diag.generation.mermaidCode,
        x: 100 + (index * 800),
        y: 100 + (index * 120),
        scale: 1,
        title: diag.title || `架构单元 ${index + 1}`,
        deconstructedElements: diag.parsing?.entities || [],
        themeId: customThemes[index % customThemes.length].id
      }));

      const newConnections: Connection[] = relationships.map(rel => ({
        id: crypto.randomUUID(),
        fromId: newElements[rel.fromIndex]?.id,
        toId: newElements[rel.toIndex]?.id,
        label: rel.label
      })).filter(c => c.fromId && c.toId);

      setElements(prev => [...prev, ...newElements]);
      setConnections(prev => [...prev, ...newConnections]);
      updateAgent(AgentRole.SCHEDULER, 'completed', '系统解构完成');
      addThinkingStep(AgentRole.SCHEDULER, '渲染管道已就绪，所有模块已加载。');
      setActiveTab('list');
      setTimeout(() => handleAutoLayout(), 500);
    } catch (error) {
      updateAgent(AgentRole.SCHEDULER, 'error', '执行失败');
    } finally { setIsProcessing(false); }
  };

  const handleAutoLayout = () => {
    if (elements.length === 0 || isLayouting) return;
    setIsLayouting(true);
    addThinkingStep(AgentRole.CANVAS_LAYOUT, '计算曼哈顿路径最短化，优化节点分布。');
    const newPositions = calculateHierarchicalLayout(elements, connections);
    setElements(prev => prev.map(el => {
      const pos = newPositions.find(p => p.id === el.id);
      return pos ? { ...el, x: pos.x, y: pos.y } : el;
    }));
    setTimeout(() => {
      setIsLayouting(false);
      updateAgent(AgentRole.CANVAS_LAYOUT, 'completed', '布局完成');
    }, 600);
  };

  const handleDrillDown = async (parent: CanvasElement, entity: string) => {
    saveSnapshot(`下钻分析: ${entity}`);
    updateAgent(AgentRole.CONTENT_PARSER, 'processing', `正在拆解 ${entity}...`);
    addThinkingStep(AgentRole.CONTENT_PARSER, `正在对子组件「${entity}」进行深度递归解构...`);
    
    try {
      const diag = await drillDownElement(parent, entity);
      const newEl: CanvasElement = {
        id: crypto.randomUUID(),
        parentId: parent.id,
        type: diag.decision.recommendedType as DiagramType,
        mermaidCode: diag.generation.mermaidCode,
        x: parent.x + 850,
        y: parent.y + 100,
        scale: 1,
        title: diag.title || `下钻详情: ${entity}`,
        deconstructedElements: diag.parsing?.entities || [],
        themeId: parent.themeId
      };
      setElements(prev => [...prev, newEl]);
      setConnections(prev => [...prev, { id: crypto.randomUUID(), fromId: parent.id, toId: newEl.id, label: `解构: ${entity}` }]);
      setTimeout(() => handleAutoLayout(), 100);
    } catch (e) {
      updateAgent(AgentRole.CONTENT_PARSER, 'error', '下钻失败');
    }
  };

  const handleLocalChatUpdate = async (el: CanvasElement) => {
    if (!el.localChatInput?.trim() || el.isLocalUpdating) return;
    setElements(prev => prev.map(item => item.id === el.id ? { ...item, isLocalUpdating: true } : item));
    addThinkingStep(AgentRole.DIAGRAM_GENERATOR, `正在针对卡片「${el.title}」执行局部微调: ${el.localChatInput}`);
    
    try {
      const newCode = await modifyDiagramContent(el.mermaidCode, el.localChatInput);
      setElements(prev => prev.map(item => item.id === el.id ? { ...item, mermaidCode: newCode, localChatInput: '', isLocalUpdating: false } : item));
    } catch (e) {
      setElements(prev => prev.map(item => item.id === el.id ? { ...item, isLocalUpdating: false } : item));
    }
  };

  const focusElement = (el: CanvasElement, targetScale?: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const s = targetScale || scale;
    setOffset({ x: rect.width / 2 - (el.x * s + 275 * s), y: rect.height / 2 - (el.y * s + 200 * s) });
    if (targetScale) setScale(s);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#020617] text-slate-200 font-sans selection:bg-indigo-500/30">
      <aside className="w-80 h-full border-r border-slate-800 bg-slate-900/60 backdrop-blur-3xl flex flex-col z-20 shadow-2xl">
        <div className="p-6 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h1 className="text-lg font-black tracking-tight">架构中心 PRO</h1>
            </div>
          </div>
          <button onClick={() => setIsGlobalChatOpen(!isGlobalChatOpen)} className={`p-2 rounded-xl ${isGlobalChatOpen ? 'bg-indigo-600' : 'hover:bg-slate-800'}`}>
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800">
          {['input', 'list', 'history'].map((tab: any) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-4 text-[9px] font-black uppercase tracking-widest ${activeTab === tab ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-slate-500'}`}>{tab === 'input' ? '解构' : tab === 'list' ? '大纲' : '历史'}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
          {activeTab === 'input' && (
            <div className="space-y-4">
              <textarea 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder="粘贴需求文档..." 
                className="w-full h-48 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none" 
              />
              <button onClick={handleProcess} disabled={isProcessing} className="w-full py-4 bg-indigo-600 hover:bg-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                {isProcessing ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} 执行解构
              </button>
              <AgentPanel agents={agents} thinkingSteps={thinkingSteps} />
            </div>
          )}
          {activeTab === 'list' && (
            <div className="space-y-2">
              {elements.filter(el => !el.parentId).map(el => (
                <div key={el.id} className="space-y-1">
                  <div onClick={() => focusElement(el)} className="p-3 bg-slate-800/20 hover:bg-indigo-500/10 rounded-xl cursor-pointer flex items-center justify-between border border-transparent hover:border-indigo-500/30">
                    <span className="text-[10px] font-black uppercase tracking-tight truncate">{el.title}</span>
                    <Target className="w-3 h-3 text-slate-500" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main 
        ref={canvasRef} 
        className="flex-1 relative overflow-hidden bg-[#020617] bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:60px_60px]" 
        onMouseDown={(e) => {
          if (e.button === 0 && e.shiftKey) { setIsPanning(true); setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); }
        }} 
        onMouseMove={(e) => {
          if (draggingElementId) {
             setElements(prev => prev.map(el => el.id === draggingElementId ? { ...el, x: (e.clientX - offset.x) / scale - elementDragOffset.x, y: (e.clientY - offset.y) / scale - elementDragOffset.y } : el));
          } else if (isPanning) { setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y }); }
        }}
        onMouseUp={() => { setIsPanning(false); setDraggingElementId(null); }}
        onWheel={(e) => {
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          setScale(s => Math.min(Math.max(s * delta, 0.1), 4));
        }}
      >
        <div 
          ref={canvasContentRef} 
          className="absolute inset-0 origin-top-left" 
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          <ConnectionLines elements={elements} connections={connections} scale={scale} />
          {elements.map(el => {
            const theme = customThemes.find(t => t.id === el.themeId) || THEMES[0];
            return (
              <div 
                key={el.id} data-id={el.id}
                className={`canvas-card absolute ${theme.bg} border-2 ${theme.border} rounded-[1.5rem] shadow-2xl group min-w-[550px] overflow-hidden transition-all duration-300`} 
                style={{ left: el.x, top: el.y, zIndex: draggingElementId === el.id ? 100 : 10 }}
              >
                <div 
                  className="card-header px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5 cursor-grab"
                  onMouseDown={(e) => {
                    setDraggingElementId(el.id);
                    setElementDragOffset({ x: (e.clientX - offset.x) / scale - el.x, y: (e.clientY - offset.y) / scale - el.y });
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.primary }} />
                    <h3 className="text-[10px] font-black text-slate-100 uppercase tracking-widest">{el.title}</h3>
                  </div>
                  <div className="flex gap-2">
                     <button onClick={() => setElements(prev => prev.filter(i => i.id !== el.id))} className="text-rose-500 hover:bg-rose-500/10 p-1 rounded-lg"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                </div>

                <div className="p-6 flex flex-col items-center justify-center min-h-[300px] relative">
                  <MermaidChart 
                    id={el.id} 
                    code={el.mermaidCode} 
                    themeVars={theme.mermaidVars} 
                    onNodeClick={(label) => handleDrillDown(el, label)}
                  />
                  
                  {/* Local Card Chat Overlay */}
                  <div className="w-full mt-4 flex gap-2 items-center px-2">
                    <input 
                      value={el.localChatInput || ''} 
                      onChange={(e) => setElements(prev => prev.map(item => item.id === el.id ? { ...item, localChatInput: e.target.value } : item))}
                      onKeyDown={(e) => e.key === 'Enter' && handleLocalChatUpdate(el)}
                      placeholder="优化该模块... (如：'改为红色')" 
                      className="flex-1 bg-slate-950/50 border border-white/5 rounded-xl px-4 py-2 text-[10px] outline-none focus:border-indigo-500/50 transition-all"
                    />
                    <button onClick={() => handleLocalChatUpdate(el)} disabled={el.isLocalUpdating} className="p-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl transition-all">
                      {el.isLocalUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Minimap elements={elements} offset={offset} scale={scale} onNavigate={() => {}} />

        <div className="absolute top-8 right-8 flex gap-4 z-40">
          <button onClick={handleAutoLayout} className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all shadow-2xl backdrop-blur-xl group">
            <Wand2 className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          </button>
          <button onClick={() => setIsThemeWorkshopOpen(true)} className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl text-amber-400 hover:bg-amber-600 hover:text-white transition-all shadow-2xl"><Palette className="w-5 h-5"/></button>
        </div>

        <div className="absolute bottom-10 right-10 flex flex-col gap-4 z-40">
          <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-1.5 flex flex-col shadow-2xl">
            <button onClick={() => setScale(s => Math.min(s * 1.2, 4))} className="p-4 hover:bg-indigo-600/20 rounded-2xl text-slate-400"><Plus className="w-5 h-5"/></button>
            <button onClick={() => setScale(s => Math.max(s * 0.8, 0.1))} className="p-4 hover:bg-indigo-600/20 rounded-2xl text-slate-400"><Minus className="w-5 h-5"/></button>
          </div>
          <div className="bg-indigo-600 rounded-full px-4 py-1.5 text-white font-black text-[9px] text-center">{Math.round(scale * 100)}%</div>
        </div>
      </main>
    </div>
  );
};

export default App;
