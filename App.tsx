
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Trash2, Activity, Sparkles, Wand2, MessageSquare, Zap, RefreshCw, Send, Undo2, Redo2, 
  Search, StickyNote as NoteIcon, Download, ExternalLink, X, Terminal, ChevronRight, User
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { 
  AgentRole, AgentStatus, CanvasElement, CollaborativeResponse, 
  DiagramType, THEMES, Connection, CanvasProjectState, ChatMessage 
} from './types';
import { processCollaborativeContent, modifyDiagramContent, drillDownElement, analyzeWorkspace } from './services/geminiService';
import { calculateHierarchicalLayout } from './services/layoutService';
import SmartDiagram from './components/SmartDiagram';
import CanvasControlHub, { InteractionMode } from './components/CanvasControlHub';

const GRID_SIZE = 20;

const ConnectionLines: React.FC<{ elements: CanvasElement[], connections: Connection[] }> = ({ elements, connections }) => {
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
        const fx = from.x + 550; const fy = from.y + 200;
        const tx = to.x; const ty = to.y + 200;
        const cp1x = fx + (tx - fx) / 2;
        return <path key={conn.id} d={`M ${fx} ${fy} C ${cp1x} ${fy}, ${cp1x} ${ty}, ${tx} ${ty}`} fill="none" stroke="#6366f1" strokeWidth="2" opacity="0.2" markerEnd="url(#arrowhead)" />;
      })}
    </svg>
  );
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [offset, setOffset] = useState({ x: 100, y: 100 });
  const [scale, setScale] = useState(0.8);
  const [showGrid, setShowGrid] = useState(true);
  const [mode, setMode] = useState<InteractionMode>('select');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<{ elements: CanvasElement[], connections: Connection[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [searchTerm, setSearchTerm] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const pushToHistory = useCallback((els: CanvasElement[], conns: Connection[]) => {
    const snap = JSON.parse(JSON.stringify({ elements: els, connections: conns }));
    setHistory(prev => [...prev.slice(0, historyIndex + 1), snap]);
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const addMessage = (role: 'user' | 'assistant', content: string, agent?: AgentRole) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, content, agent, timestamp: Date.now() }]);
  };

  const handleGlobalCommand = async () => {
    if (!userInput.trim() || isProcessing) return;
    const input = userInput;
    setUserInput('');
    addMessage('user', input);
    setIsProcessing(true);

    try {
      if (input.startsWith('/layout')) {
        const pos = calculateHierarchicalLayout(elements, connections);
        const updated = elements.map(el => {
          const p = pos.find(pos => pos.id === el.id);
          return p ? { ...el, x: p.x, y: p.y } : el;
        });
        setElements(updated);
        pushToHistory(updated, connections);
        addMessage('assistant', '布局优化已完成。', AgentRole.CANVAS_LAYOUT);
      } else if (elements.length === 0 || input.length > 50) {
        addMessage('assistant', '正在深度分析需求并构建架构...', AgentRole.SCHEDULER);
        const result = await processCollaborativeContent(input);
        const newEls: CanvasElement[] = result.diagrams.map((diag, i) => ({
          id: crypto.randomUUID(), type: diag.decision.recommendedType as DiagramType,
          mermaidCode: diag.generation.mermaidCode, x: 100 + i * 650, y: 100, scale: 1,
          title: diag.title, deconstructedElements: diag.parsing.entities, themeId: THEMES[i % 2].id
        }));
        const newConns: Connection[] = result.relationships.map(rel => ({
          id: crypto.randomUUID(), fromId: newEls[rel.fromIndex]?.id, toId: newEls[rel.toIndex]?.id, label: rel.label
        })).filter(c => c.fromId && c.toId);
        setElements([...elements, ...newEls]);
        setConnections([...connections, ...newConns]);
        pushToHistory([...elements, ...newEls], [...connections, ...newConns]);
        addMessage('assistant', `成功构建架构图谱：包含 ${newEls.length} 个核心模块。`, AgentRole.SCHEDULER);
      } else {
        addMessage('assistant', '正在进行工作空间全局分析...', AgentRole.INTERACTION_FEEDBACK);
        const reply = await analyzeWorkspace(elements, input);
        addMessage('assistant', reply, AgentRole.CONTENT_PARSER);
      }
    } catch (e) {
      addMessage('assistant', '抱歉，执行指令时遇到错误。', AgentRole.SCHEDULER);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateCardCode = async (el: CanvasElement) => {
    if (!el.localChatInput?.trim()) return;
    setElements(prev => prev.map(i => i.id === el.id ? { ...i, isLocalUpdating: true } : i));
    try {
      const newCode = await modifyDiagramContent(el.mermaidCode, el.localChatInput);
      const updated = elements.map(i => i.id === el.id ? { ...i, mermaidCode: newCode, localChatInput: '', isLocalUpdating: false } : i);
      setElements(updated);
      pushToHistory(updated, connections);
      addMessage('assistant', `已根据指令更新 [${el.title}] 模块。`, AgentRole.DIAGRAM_GENERATOR);
    } catch (e) {
      setElements(prev => prev.map(i => i.id === el.id ? { ...i, isLocalUpdating: false } : i));
    }
  };

  const visibleIds = useMemo(() => {
    if (!canvasRef.current) return new Set<string>();
    const { width, height } = canvasRef.current.getBoundingClientRect();
    const vL = -offset.x / scale - 600; const vR = (width - offset.x) / scale + 600;
    const vT = -offset.y / scale - 600; const vB = (height - offset.y) / scale + 600;
    return new Set(elements.filter(el => el.x + 600 > vL && el.x < vR && el.y + 500 > vT && el.y < vB).map(el => el.id));
  }, [elements, offset, scale]);

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-200 overflow-hidden font-sans select-none">
      {/* 聚合智能体指控中心 */}
      <aside className="w-96 h-full border-r border-slate-800 bg-slate-900/60 backdrop-blur-2xl z-20 flex flex-col shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
               <Terminal className="w-4 h-4 text-indigo-400" />
             </div>
             <h1 className="font-black tracking-tighter uppercase text-sm">Agent Command Hub</h1>
          </div>
        </div>

        {/* 聊天消息流 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar scroll-smooth">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-4">
              <Zap className="w-12 h-12 mb-4 text-indigo-500 animate-pulse" />
              <p className="text-xs font-bold uppercase tracking-widest">等待架构指令输入</p>
              <p className="text-[10px] mt-2 leading-relaxed">你可以输入需求文档，或尝试指令：<br/>/layout - 整理布局<br/>/analyze - 分析架构</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className="flex items-center gap-2 px-1">
                {msg.role === 'assistant' ? (
                  <>
                    <div className="w-4 h-4 rounded bg-indigo-500/20 flex items-center justify-center"><Activity className="w-2.5 h-2.5 text-indigo-400" /></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{msg.agent || 'SYSTEM'}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">ME</span>
                    <div className="w-4 h-4 rounded bg-slate-700 flex items-center justify-center"><User className="w-2.5 h-2.5 text-slate-400" /></div>
                  </>
                )}
              </div>
              <div className={`max-w-[90%] px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-lg border ${
                msg.role === 'user' 
                ? 'bg-indigo-600 border-indigo-500/50 text-white rounded-tr-none' 
                : 'bg-slate-800 border-slate-700 text-slate-300 rounded-tl-none'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* 底部输入框 */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/30">
          <div className="relative group">
            <textarea 
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGlobalCommand(); } }}
              placeholder="输入架构需求或指令 (/...)" 
              className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-4 pr-12 py-3 text-xs focus:border-indigo-500 transition-all outline-none resize-none min-h-[44px] max-h-32 no-scrollbar font-medium"
            />
            <button 
              onClick={handleGlobalCommand}
              disabled={isProcessing || !userInput.trim()}
              className="absolute right-2 bottom-2 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-20 rounded-xl transition-all shadow-xl"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setUserInput('/layout')} className="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-slate-800 text-slate-500 rounded hover:text-indigo-400 transition-colors">/Layout</button>
            <button onClick={() => setUserInput('/analyze ')} className="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-slate-800 text-slate-500 rounded hover:text-indigo-400 transition-colors">/Analyze</button>
          </div>
        </div>
      </aside>

      <main 
        ref={canvasRef}
        className={`flex-1 relative overflow-hidden ${mode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'} ${showGrid ? 'bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:50px_50px]' : 'bg-[#020617]'}`}
        onMouseDown={(e) => { if(mode==='pan'||e.shiftKey) setDraggingId('pan'); }}
        onMouseMove={(e) => {
          if (draggingId === 'pan') setOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
          else if (draggingId) {
            setElements(prev => prev.map(el => el.id === draggingId ? { ...el, x: el.x + e.movementX / scale, y: el.y + e.movementY / scale } : el));
          }
        }}
        onMouseUp={() => setDraggingId(null)}
        onWheel={(e) => {
          const factor = Math.pow(1.1, -e.deltaY / 100);
          setScale(prev => Math.min(Math.max(prev * factor, 0.05), 5));
        }}
      >
        <div ref={captureRef} className="absolute inset-0 origin-top-left" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
          <ConnectionLines elements={elements} connections={connections} />
          {elements.map(el => (
            <div 
              key={el.id} 
              className={`absolute bg-slate-900 border-2 border-slate-800 rounded-[32px] w-[550px] shadow-2xl transition-all ${draggingId === el.id ? 'z-50 scale-[1.01]' : 'z-10'}`} 
              style={{ left: el.x, top: el.y }}
            >
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between cursor-grab active:cursor-grabbing" onMouseDown={(e) => { e.stopPropagation(); setDraggingId(el.id); }}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${el.type === DiagramType.NOTE ? 'bg-amber-500' : 'bg-indigo-500'}`} />
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">{el.title}</span>
                </div>
                <button onClick={() => setElements(prev => prev.filter(i => i.id !== el.id))} className="text-slate-600 hover:text-rose-400 p-1.5"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="p-7">
                {el.type === DiagramType.NOTE ? (
                  <textarea value={el.content} onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, content: e.target.value } : i))} className="w-full h-40 bg-transparent text-amber-200/80 font-mono text-sm leading-relaxed outline-none resize-none border-none p-0" />
                ) : (
                  <>
                    <SmartDiagram id={el.id} code={el.mermaidCode} isVisible={visibleIds.has(el.id)} themeVars={THEMES.find(t=>t.id===el.themeId)?.mermaidVars} />
                    <div className="mt-6 flex gap-3">
                      <input 
                        value={el.localChatInput || ''}
                        onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, localChatInput: e.target.value } : i))}
                        onKeyDown={(e) => e.key === 'Enter' && updateCardCode(el)}
                        placeholder="微调当前模块..." 
                        className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-xs outline-none"
                      />
                      <button onClick={() => updateCardCode(el)} disabled={el.isLocalUpdating} className="p-3 bg-indigo-600/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
                        {el.isLocalUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <CanvasControlHub 
          scale={scale} mode={mode} onSetMode={setMode}
          onZoomIn={() => setScale(s => Math.min(s * 1.2, 5))}
          onZoomOut={() => setScale(s => Math.max(s * 0.8, 0.05))}
          onSetScale={setScale}
          onReset={() => { setOffset({x:100, y:100}); setScale(1); }}
          onFitView={() => {}}
          onAutoLayout={() => setUserInput('/layout')}
          onExportImage={async () => {
             const canvas = await html2canvas(captureRef.current!, { backgroundColor: '#020617', scale: 2 });
             const link = document.createElement('a'); link.download = 'blueprint.png'; link.href = canvas.toDataURL(); link.click();
          }}
          onSaveProject={() => {}} onLoadProject={() => {}} onClearCanvas={() => { setElements([]); setConnections([]); }}
          isFullScreen={false} onToggleFullScreen={() => {}}
          showGrid={showGrid} onToggleGrid={() => setShowGrid(!showGrid)}
          onUndo={() => {}} onRedo={() => {}} canUndo={false} canRedo={false}
        />
      </main>
    </div>
  );
};

export default App;
