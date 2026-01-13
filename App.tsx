
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Plus, Minus, Move, Layers, Settings, History, 
  Maximize2, MousePointer2, ChevronRight, ChevronDown, 
  Trash2, Edit3, Check, X, Target, ListTree, Activity, Palette, Sparkles
} from 'lucide-react';
import { AgentRole, AgentStatus, CanvasElement, CollaborativeResponse, DiagramType, THEMES, ElementTheme } from './types';
import { processCollaborativeContent } from './services/geminiService';
import AgentPanel from './components/AgentPanel';
import MermaidChart from './components/MermaidChart';

const INITIAL_AGENTS: AgentStatus[] = [
  { role: AgentRole.SCHEDULER, status: 'idle', message: '准备就绪' },
  { role: AgentRole.CONTENT_PARSER, status: 'idle', message: '等待输入' },
  { role: AgentRole.DIAGRAM_DECISION, status: 'idle', message: '等待解析' },
  { role: AgentRole.DIAGRAM_GENERATOR, status: 'idle', message: '等待决策' },
  { role: AgentRole.CANVAS_LAYOUT, status: 'idle', message: '等待生成' },
  { role: AgentRole.INTERACTION_FEEDBACK, status: 'idle', message: '监控画布' },
];

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>(INITIAL_AGENTS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'list'>('input');
  const [showThemePickerId, setShowThemePickerId] = useState<string | null>(null);

  // Canvas View State
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Element Drag State
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [elementDragOffset, setElementDragOffset] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);

  const updateAgent = useCallback((role: AgentRole, status: AgentStatus['status'], message: string) => {
    setAgents(prev => prev.map(a => a.role === role ? { ...a, status, message } : a));
  }, []);

  const handleProcess = async () => {
    if (!input.trim() || isProcessing) return;

    setIsProcessing(true);
    setAgents(INITIAL_AGENTS);

    try {
      updateAgent(AgentRole.SCHEDULER, 'processing', '拆解任务中...');
      updateAgent(AgentRole.CONTENT_PARSER, 'processing', '提取核心逻辑...');
      
      const result = await processCollaborativeContent(input);

      updateAgent(AgentRole.CONTENT_PARSER, 'completed', `提取了 ${result.parsing.entities.length} 个节点`);
      updateAgent(AgentRole.DIAGRAM_DECISION, 'processing', '匹配最佳布局...');
      updateAgent(AgentRole.DIAGRAM_DECISION, 'completed', `推荐类型: ${result.decision.recommendedType}`);
      updateAgent(AgentRole.DIAGRAM_GENERATOR, 'processing', '合成图表代码...');
      updateAgent(AgentRole.DIAGRAM_GENERATOR, 'completed', '代码生成完毕');
      updateAgent(AgentRole.CANVAS_LAYOUT, 'processing', '规划空间位置...');
      
      const newElement: CanvasElement = {
        id: crypto.randomUUID(),
        type: result.decision.recommendedType,
        mermaidCode: result.generation.mermaidCode,
        x: (result.layout?.suggestedPosition?.x || 100) + (elements.length * 20),
        y: (result.layout?.suggestedPosition?.y || 100) + (elements.length * 20),
        scale: 1,
        title: input.slice(0, 20).replace(/\n/g, ' ') + (input.length > 20 ? '...' : ''),
        deconstructedElements: result.parsing.entities,
        themeId: THEMES[0].id
      };

      setElements(prev => [...prev, newElement]);
      updateAgent(AgentRole.CANVAS_LAYOUT, 'completed', '画布已更新');
      updateAgent(AgentRole.SCHEDULER, 'completed', '流程圆满完成');
      
      setInput('');
      setActiveTab('list');
    } catch (error) {
      console.error(error);
      updateAgent(AgentRole.SCHEDULER, 'error', '协同处理失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
  };

  const focusElement = (el: CanvasElement) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setOffset({
      x: centerX - (el.x * scale),
      y: centerY - (el.y * scale)
    });
  };

  const updateElementCode = (id: string, code: string) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, mermaidCode: code, isEditing: false } : el));
  };

  const toggleEdit = (id: string) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, isEditing: !el.isEditing } : el));
  };

  const changeTheme = (elementId: string, themeId: string) => {
    setElements(prev => prev.map(el => el.id === elementId ? { ...el, themeId } : el));
    setShowThemePickerId(null);
  };

  // Interaction Handlers
  const onMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isHeader = target.closest('.card-header');
    
    if (isHeader && !target.closest('button')) {
      const card = target.closest('.canvas-card') as HTMLElement;
      const elementId = card.dataset.id;
      if (elementId) {
        setDraggingElementId(elementId);
        const element = elements.find(el => el.id === elementId);
        if (element) {
          setElementDragOffset({
            x: (e.clientX - offset.x) / scale - element.x,
            y: (e.clientY - offset.y) / scale - element.y
          });
        }
        return;
      }
    }

    if (e.button === 1 || (e.button === 0 && e.shiftKey) || target === canvasRef.current) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (draggingElementId) {
      const newX = (e.clientX - offset.x) / scale - elementDragOffset.x;
      const newY = (e.clientY - offset.y) / scale - elementDragOffset.y;
      setElements(prev => prev.map(el => el.id === draggingElementId ? { ...el, x: newX, y: newY } : el));
      return;
    }

    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const onMouseUp = () => {
    setIsPanning(false);
    setDraggingElementId(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      const zoom = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(scale * zoom, 0.1), 5);
      
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const dx = (mouseX - offset.x) / scale;
        const dy = (mouseY - offset.y) / scale;
        
        setOffset({
          x: mouseX - dx * newScale,
          y: mouseY - dy * newScale
        });
        setScale(newScale);
      }
      e.preventDefault();
    } else {
      setOffset(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Sidebar */}
      <aside className="w-80 h-full border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl flex flex-col z-20 shadow-2xl">
        <div className="p-6 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">架构智能体 PRO</h1>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed uppercase tracking-wider font-semibold">Diagram Architect System</p>
        </div>

        <div className="flex border-b border-slate-800">
          <button 
            onClick={() => setActiveTab('input')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'input' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            创意工坊
          </button>
          <button 
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'list' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            层级管理 ({elements.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
          {activeTab === 'input' ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500 px-1 flex items-center gap-2">
                  <Edit3 className="w-3 h-3" /> 输入描述
                </label>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="描述您的业务逻辑、技术架构或项目时间轴..."
                  className="w-full h-44 bg-slate-800 border border-slate-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 resize-none shadow-inner"
                />
                <button
                  onClick={handleProcess}
                  disabled={isProcessing || !input.trim()}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 group"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                  {isProcessing ? '五大智能体正在联机...' : '启动智能协作流'}
                </button>
              </div>
              <AgentPanel agents={agents} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <ListTree className="w-3 h-3" /> 元素目录
                </label>
                <button 
                  onClick={() => setElements([])}
                  className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors uppercase font-bold"
                >
                  重置画布
                </button>
              </div>
              
              <div className="space-y-1">
                {elements.map((el) => {
                  const theme = THEMES.find(t => t.id === el.themeId) || THEMES[0];
                  return (
                    <div key={el.id} className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700 shadow-sm">
                      <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => focusElement(el)}>
                        <div className={`w-2 h-2 rounded-full shrink-0 shadow-lg`} style={{ backgroundColor: theme.primary }} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm text-slate-300 truncate font-semibold">{el.title}</span>
                          <span className="text-[9px] text-slate-500 uppercase font-black">{el.type}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => focusElement(el)} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">
                          <Target className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteElement(el.id)} className="p-1.5 hover:bg-slate-700 rounded-lg text-rose-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {elements.length === 0 && (
                  <div className="py-12 text-center">
                    <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-3">
                      <ListTree className="w-6 h-6 text-slate-700" />
                    </div>
                    <p className="text-xs text-slate-600 font-medium">还没有生成任何架构图</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-800 flex items-center justify-between text-slate-500 bg-slate-900/80">
           <div className="flex gap-2">
             <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors"><Settings className="w-4 h-4" /></button>
             <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors"><History className="w-4 h-4" /></button>
           </div>
           <span className="text-[10px] uppercase font-black opacity-30 tracking-[0.2em] italic">Architecture AI</span>
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main 
        ref={canvasRef}
        className="flex-1 relative overflow-hidden bg-[#020617] bg-[radial-gradient(#1e293b_1.5px,transparent_1.5px)] [background-size:40px_40px]"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
        style={{ cursor: isPanning ? 'grabbing' : draggingElementId ? 'grabbing' : 'crosshair' }}
      >
        <div 
          className="absolute inset-0 transition-transform duration-75 ease-out origin-top-left"
          style={{ 
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
          }}
        >
          {elements.map((el) => {
            const theme = THEMES.find(t => t.id === el.themeId) || THEMES[0];
            return (
              <div
                key={el.id}
                data-id={el.id}
                className={`canvas-card absolute ${theme.bg} border-2 ${theme.border} rounded-3xl shadow-2xl group min-w-[500px] overflow-hidden transition-colors duration-500`}
                style={{ left: el.x, top: el.y, zIndex: draggingElementId === el.id ? 50 : 10 }}
              >
                {/* Card Header */}
                <div className={`card-header px-6 py-4 border-b border-slate-800/50 flex items-center justify-between bg-slate-950/20 backdrop-blur-sm cursor-grab active:cursor-grabbing`}>
                  <div className="flex items-center gap-4">
                     <div className={`w-3 h-3 rounded-full shadow-lg shadow-current`} style={{ color: theme.primary, backgroundColor: 'currentColor' }} />
                     <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest truncate max-w-[320px]">{el.title}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <button 
                      onClick={() => setShowThemePickerId(showThemePickerId === el.id ? null : el.id)}
                      className={`p-2 hover:bg-slate-800 rounded-xl transition-all ${theme.text}`}
                      title="更换主题套餐"
                    >
                      <Palette className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleEdit(el.id)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-all">
                      {el.isEditing ? <X className="w-4 h-4 text-rose-400" /> : <Edit3 className="w-4 h-4" />}
                    </button>
                    <button onClick={() => deleteElement(el.id)} className="p-2 hover:bg-slate-800 rounded-xl text-rose-500/80 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Theme Picker Overlay */}
                {showThemePickerId === el.id && (
                  <div className="absolute top-16 right-4 z-[60] bg-slate-900 border border-slate-700 rounded-2xl p-3 shadow-2xl animate-in fade-in zoom-in duration-200 grid grid-cols-1 gap-2">
                    <p className="text-[10px] font-black uppercase text-slate-500 mb-1 px-1">选择主题套餐</p>
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => changeTheme(el.id, t.id)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${el.themeId === t.id ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'hover:bg-slate-800 text-slate-400'}`}
                      >
                        <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: t.primary }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Content Area */}
                <div className="p-6 relative">
                  {el.isEditing ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase text-indigo-500">Mermaid 源代码编辑器</span>
                      </div>
                      <textarea 
                        defaultValue={el.mermaidCode}
                        className="w-full h-64 bg-slate-950/80 border border-slate-700/50 rounded-xl p-4 text-[12px] font-mono text-indigo-300 focus:ring-1 focus:ring-indigo-500 outline-none resize-none shadow-inner"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey) {
                            updateElementCode(el.id, (e.target as HTMLTextAreaElement).value);
                          }
                        }}
                        id={`editor-${el.id}`}
                      />
                      <div className="flex justify-end gap-3">
                        <button 
                          onClick={() => toggleEdit(el.id)}
                          className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          丢弃更改
                        </button>
                        <button 
                          onClick={() => {
                            const val = (document.getElementById(`editor-${el.id}`) as HTMLTextAreaElement).value;
                            updateElementCode(el.id, val);
                          }}
                          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                        >
                          <Check className="w-4 h-4" /> 重新渲染
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl bg-slate-950/20">
                      <MermaidChart id={el.id} code={el.mermaidCode} themeVars={theme.mermaidVars} />
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-800/30 flex flex-wrap items-center gap-2 bg-slate-950/30">
                   <span className="text-[9px] font-black uppercase text-slate-600 tracking-[0.2em] mr-2">Core Logic</span>
                   {el.deconstructedElements.slice(0, 5).map((tag, i) => (
                     <span key={i} className={`text-[10px] font-bold px-3 py-1 rounded-full border bg-slate-800/50 truncate max-w-[120px] transition-colors border-slate-700/50 text-slate-400 group-hover:text-slate-300`}>
                       {tag}
                     </span>
                   ))}
                   {el.deconstructedElements.length > 5 && <span className="text-[9px] text-slate-600 font-bold ml-1">+{el.deconstructedElements.length - 5} 节点</span>}
                </div>
              </div>
            );
          })}

          {elements.length === 0 && !isProcessing && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center space-y-8 pointer-events-none select-none">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-600/20 blur-[80px] rounded-full scale-150 animate-pulse"></div>
                <div className="relative w-32 h-32 bg-slate-900 border border-slate-800 rounded-[3rem] flex items-center justify-center mx-auto shadow-2xl backdrop-blur-md">
                  <Sparkles className="w-16 h-16 text-slate-800" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-slate-400 font-black text-2xl tracking-[0.3em] uppercase">Architecture Canvas</h2>
                <p className="text-slate-700 text-sm font-bold uppercase tracking-widest">在此记录您的宏大架构构想</p>
              </div>
            </div>
          )}
        </div>

        {/* Floating UI controls */}
        <div className="absolute top-6 right-6 flex items-center gap-4 z-40">
           <div className="flex items-center gap-4 bg-slate-900/80 backdrop-blur-xl border border-slate-800/50 px-5 py-2.5 rounded-2xl shadow-2xl">
              <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-indigo-400 animate-ping' : 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                System Status: {isProcessing ? 'Collaboration' : 'Standby'}
              </span>
           </div>
        </div>

        <div className="absolute bottom-8 right-8 flex flex-col gap-3 z-40">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-1.5 flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
             <button onClick={() => setScale(s => Math.min(s * 1.2, 5))} className="p-4 hover:bg-slate-800 rounded-2xl text-slate-400 transition-all active:scale-90" title="放大 (Ctrl + Scroll Up)"><Plus className="w-5 h-5" /></button>
             <button onClick={() => setScale(s => Math.max(s * 0.8, 0.1))} className="p-4 hover:bg-slate-800 rounded-2xl text-slate-400 transition-all active:scale-90" title="缩小 (Ctrl + Scroll Down)"><Minus className="w-5 h-5" /></button>
             <div className="h-px bg-slate-800 mx-3 my-1" />
             <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="p-4 hover:bg-slate-800 rounded-2xl text-slate-400 transition-all active:scale-90" title="重置视角"><Maximize2 className="w-5 h-5" /></button>
          </div>
          <div className="bg-indigo-600/10 backdrop-blur-xl border border-indigo-500/20 rounded-3xl px-6 py-3 flex items-center gap-4 shadow-2xl">
            <Move className="w-4 h-4 text-indigo-400/50" />
            <span className="text-[12px] font-black text-indigo-400 tracking-tighter w-10">{Math.round(scale * 100)}%</span>
          </div>
        </div>

        {/* Legend / Tips */}
        <div className="absolute bottom-8 left-8 flex items-center gap-8 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] bg-slate-950/60 backdrop-blur-xl px-8 py-4 rounded-full border border-slate-900 shadow-2xl select-none">
          <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> 拖拽头部平移元素</div>
          <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span> Space 漫游画布</div>
          <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span> Ctrl + 滚轮缩放</div>
        </div>
      </main>
    </div>
  );
};

// Helper Loader component
const Loader2 = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);

export default App;
