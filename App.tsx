
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Trash2, Activity, Sparkles, Wand2, MessageSquare, Zap, RefreshCw, Send, Undo2, Redo2, 
  Search, Download, ExternalLink, X, Terminal, ChevronRight, User, StickyNote,
  Maximize2, LayoutGrid, Palette, Info, Eraser, Focus, Camera, Command, Save, FolderOpen, ShieldCheck, Image as ImageIcon, Link as LinkIcon
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { 
  AgentRole, AgentStatus, CanvasElement, CollaborativeResponse, 
  DiagramType, THEMES, Connection, CanvasProjectState, ChatMessage 
} from './types';
import { 
  processCollaborativeContent, modifyDiagramContent, 
  analyzeWorkspace, visionToDiagram, findRelationshipBetweenDiagrams
} from './services/geminiService';
import { calculateHierarchicalLayout } from './services/layoutService';
import SmartDiagram from './components/SmartDiagram';
import CanvasControlHub, { InteractionMode } from './components/CanvasControlHub';

const COMMAND_REGISTRY = [
  { id: 'layout', label: '/layout', desc: '自动层级布局整理', icon: <Wand2 className="w-4 h-4" />, color: 'text-amber-400' },
  { id: 'link', label: '/link', desc: '智能连接两个图表 [标题1] [标题2]', icon: <LinkIcon className="w-4 h-4" />, color: 'text-indigo-400' },
  { id: 'note', label: '/note', desc: '在画布创建随手记', icon: <StickyNote className="w-4 h-4" />, color: 'text-yellow-400' },
  { id: 'vision', label: '/vision', desc: '视觉解构：图片转架构', icon: <ImageIcon className="w-4 h-4" />, color: 'text-pink-400' },
  { id: 'review', label: '/review', desc: '智能架构审计与优化', icon: <ShieldCheck className="w-4 h-4" />, color: 'text-yellow-400' },
  { id: 'save', label: '/save', desc: '导出工程存档 (.json)', icon: <Save className="w-4 h-4" />, color: 'text-sky-400' },
  { id: 'load', label: '/load', desc: '导入工程存档 (.json)', icon: <FolderOpen className="w-4 h-4" />, color: 'text-sky-400' },
  { id: 'clear', label: '/clear', desc: '清空当前所有数据', icon: <Eraser className="w-4 h-4" />, color: 'text-rose-400' },
];

const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(```[\s\S]*?```|`.*?`|\*\*.*?\*\*|\n)/g);
  return (
    <div className="space-y-1.5 break-words">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const code = part.replace(/```(\w+)?\n?/, '').replace(/```$/, '');
          return <pre key={i} className="bg-black/40 p-3 rounded-xl my-2 overflow-x-auto font-mono text-[10px] border border-white/5 text-indigo-200">{code}</pre>;
        }
        if (part.startsWith('`')) return <code key={i} className="bg-white/10 px-1.5 py-0.5 rounded text-indigo-300 font-mono text-[11px]">{part.slice(1, -1)}</code>;
        if (part.startsWith('**')) return <strong key={i} className="text-white font-bold">{part.slice(2, -2)}</strong>;
        if (part === '\n') return <div key={i} className="h-1" />;
        return <span key={i} className="text-slate-300">{part}</span>;
      })}
    </div>
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
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  const [history, setHistory] = useState<{elements: CanvasElement[], connections: Connection[]}[]>([]);
  const [future, setFuture] = useState<{elements: CanvasElement[], connections: Connection[]}[]>([]);

  const pushToHistory = useCallback((els: CanvasElement[], conns: Connection[]) => {
    setHistory(prev => [...prev.slice(-20), { elements: els, connections: conns }]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture(f => [{elements, connections}, ...f]);
    setHistory(h => h.slice(0, -1));
    setElements(prev.elements);
    setConnections(prev.connections);
  }, [history, elements, connections]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(h => [...h, {elements, connections}]);
    setFuture(f => f.slice(1));
    setElements(next.elements);
    setConnections(next.connections);
  }, [future, elements, connections]);

  const [showMenu, setShowMenu] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);

  const canvasRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); setIsSpaceDown(true); }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceDown(false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [undo, redo]);

  const addMessage = (role: 'user' | 'assistant', content: string, agent?: AgentRole) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, content, agent, timestamp: Date.now() }]);
  };

  const filteredCommands = useMemo(() => {
    if (!userInput.startsWith('/')) return [];
    const search = userInput.slice(1).toLowerCase();
    return COMMAND_REGISTRY.filter(c => c.id.includes(search));
  }, [userInput]);

  useEffect(() => {
    setShowMenu(filteredCommands.length > 0);
    setMenuIndex(0);
  }, [filteredCommands.length]);

  const handleCommand = async (input: string) => {
    const [cmd, ...args] = input.trim().split(/\s+/);
    const commandId = cmd.startsWith('/') ? cmd.slice(1).toLowerCase() : cmd.toLowerCase();
    
    switch (commandId) {
      case 'layout':
        pushToHistory(elements, connections);
        const pos = calculateHierarchicalLayout(elements, connections);
        setElements(prev => prev.map(el => {
          const p = pos.find(p => p.id === el.id);
          return p ? { ...el, x: p.x, y: p.y } : el;
        }));
        addMessage('assistant', '已优化全局布局。', AgentRole.CANVAS_LAYOUT);
        break;
      case 'link':
        if (args.length < 2) {
          addMessage('assistant', '请输入两个要连接的图表标题，例如: `/link 订单服务 数据库`', AgentRole.INTERACTION_FEEDBACK);
          return;
        }
        const title1 = args[0];
        const title2 = args[1];
        const source = elements.find(el => el.title.toLowerCase().includes(title1.toLowerCase()));
        const target = elements.find(el => el.title.toLowerCase().includes(title2.toLowerCase()));
        if (!source || !target) {
          addMessage('assistant', `未找到对应图表: ${!source ? title1 : ''} ${!target ? title2 : ''}`, AgentRole.INTERACTION_FEEDBACK);
          return;
        }
        setIsProcessing(true);
        addMessage('assistant', `正在智能建立 [${source.title}] 与 [${target.title}] 的联系...`, AgentRole.SCHEDULER);
        const label = await findRelationshipBetweenDiagrams(source, target);
        pushToHistory(elements, connections);
        setConnections(prev => [...prev, { id: crypto.randomUUID(), fromId: source.id, toId: target.id, label }]);
        setIsProcessing(false);
        addMessage('assistant', `连接已建立: **${label}**`, AgentRole.INTERACTION_FEEDBACK);
        break;
      case 'note':
        pushToHistory(elements, connections);
        const content = args.join(' ') || '在此记录笔记...';
        const newNote: CanvasElement = {
          id: crypto.randomUUID(), type: DiagramType.NOTE, mermaidCode: '',
          x: -offset.x / scale + 200, y: -offset.y / scale + 200, scale: 1,
          title: '随手记', deconstructedElements: [], themeId: THEMES[0].id, content
        };
        setElements(prev => [...prev, newNote]);
        addMessage('assistant', '已在画布上创建随手记。', AgentRole.INTERACTION_FEEDBACK);
        break;
      case 'vision':
        fileRef.current?.click();
        break;
      case 'review':
        addMessage('assistant', '正在深度扫描工作空间架构...', AgentRole.SCHEDULER);
        const report = await analyzeWorkspace(elements, "请对当前所有图表的逻辑一致性进行审计，并给出优化建议。");
        addMessage('assistant', report, AgentRole.DIAGRAM_DECISION);
        break;
      case 'save':
        const data = JSON.stringify({ elements, connections, view: { offset, scale } }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `Project-${Date.now()}.arch.json`;
        link.href = url;
        link.click();
        addMessage('assistant', '工程存档已成功导出。', AgentRole.INTERACTION_FEEDBACK);
        break;
      case 'load':
        const loadInput = document.createElement('input');
        loadInput.type = 'file';
        loadInput.accept = '.json';
        loadInput.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (re) => {
            const json = JSON.parse(re.target?.result as string);
            setElements(json.elements || []);
            setConnections(json.connections || []);
            if (json.view) { setOffset(json.view.offset); setScale(json.view.scale); }
            addMessage('assistant', '已恢复工程存档。', AgentRole.INTERACTION_FEEDBACK);
          };
          reader.readAsText(file);
        };
        loadInput.click();
        break;
      case 'clear':
        pushToHistory(elements, connections);
        setElements([]); setConnections([]);
        addMessage('assistant', '画布已清空。', AgentRole.INTERACTION_FEEDBACK);
        break;
      default:
        setIsProcessing(true);
        addMessage('assistant', '正在多智能体并行解构需求...', AgentRole.SCHEDULER);
        const result = await processCollaborativeContent(input);
        const newEls: CanvasElement[] = result.diagrams.map((diag, i) => ({
          id: crypto.randomUUID(), type: diag.decision.recommendedType as DiagramType,
          mermaidCode: diag.generation.mermaidCode, x: 100 + i * 650, y: 100, scale: 1,
          title: diag.title, deconstructedElements: diag.parsing.entities, themeId: THEMES[0].id
        }));
        setElements(prev => [...prev, ...newEls]);
        setIsProcessing(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    addMessage('assistant', '正在进行多模态视觉解构...', AgentRole.CONTENT_PARSER);
    const reader = new FileReader();
    reader.onload = async (re) => {
      const base64 = (re.target?.result as string).split(',')[1];
      try {
        const diag = await visionToDiagram(base64);
        const newEl: CanvasElement = {
          id: crypto.randomUUID(), type: diag.decision.recommendedType as DiagramType,
          mermaidCode: diag.generation.mermaidCode, x: -offset.x / scale + 200, y: -offset.y / scale + 200, scale: 1,
          title: diag.title, deconstructedElements: diag.parsing.entities, themeId: THEMES[0].id
        };
        setElements(prev => [...prev, newEl]);
        addMessage('assistant', '视觉架构识别完成。', AgentRole.INTERACTION_FEEDBACK);
      } catch (err) {
        addMessage('assistant', '视觉解构失败，请确保图片清晰。', AgentRole.INTERACTION_FEEDBACK);
      } finally { setIsProcessing(false); }
    };
    reader.readAsDataURL(file);
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

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-200 overflow-hidden font-sans select-none">
      <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={onFileChange} />
      
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[200] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4 bg-slate-900/80 p-8 rounded-[40px] border border-white/5 shadow-2xl animate-in zoom-in-95 duration-300">
            <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">Gemini Processing...</span>
          </div>
        </div>
      )}

      <aside className="w-[420px] h-full border-r border-slate-800 bg-slate-900/80 backdrop-blur-3xl z-20 flex flex-col shadow-2xl">
        <div className="p-7 border-b border-slate-800 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20"><Terminal className="w-5 h-5 text-indigo-400" /></div>
             <h1 className="font-black tracking-tighter uppercase text-sm">ARCH PRO ENGINE</h1>
           </div>
           <div className="flex gap-1">
             <button onClick={undo} disabled={history.length===0} title="Undo (Ctrl+Z)" className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-20"><Undo2 className="w-4 h-4" /></button>
             <button onClick={redo} disabled={future.length===0} title="Redo (Ctrl+Y)" className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-20"><Redo2 className="w-4 h-4" /></button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7 space-y-7 no-scrollbar scroll-smooth">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-20 text-center">
              <Command className="w-16 h-16 mb-6 text-indigo-500 animate-pulse" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">AI Protocol Standby</p>
              <p className="text-[10px] mt-4 px-10 leading-relaxed">键入需求，AI 将自动决策拓扑并拆解多维架构图表。</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in duration-300`}>
              {msg.agent && <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><Zap className="w-2.5 h-2.5" />{msg.agent}</span>}
              <div className={`max-w-[95%] px-5 py-4 rounded-3xl text-xs border ${msg.role === 'user' ? 'bg-indigo-600 border-indigo-400/30' : 'bg-slate-800/80 border-slate-700/50'}`}>
                <MarkdownText text={msg.content} />
              </div>
            </div>
          ))}
        </div>

        <div className="p-7 border-t border-slate-800 bg-slate-950/40 relative">
          {showMenu && (
            <div className="absolute bottom-full left-7 right-7 mb-4 bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden z-[110] animate-in slide-in-from-bottom-2 duration-200">
              <div className="px-5 py-2 border-b border-slate-700/50 bg-slate-900/50 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Commands</span>
              </div>
              <div className="max-h-[260px] overflow-y-auto no-scrollbar">
                {filteredCommands.map((cmd, idx) => (
                  <button key={cmd.id} onClick={() => { setUserInput(cmd.label + ' '); setShowMenu(false); inputRef.current?.focus(); }} onMouseEnter={() => setMenuIndex(idx)} className={`w-full px-5 py-3.5 flex items-center gap-4 text-left ${idx === menuIndex ? 'bg-indigo-600' : 'hover:bg-slate-700/50'}`}>
                    <div className={`p-2 rounded-xl bg-slate-900/50 ${idx === menuIndex ? 'text-white' : cmd.color}`}>{cmd.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{cmd.label}</p>
                      <p className={`text-[9px] truncate ${idx === menuIndex ? 'text-indigo-200' : 'text-slate-500'}`}>{cmd.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="relative">
            <textarea ref={inputRef} value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={(e) => {
              if (showMenu) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex(i => (i + 1) % filteredCommands.length); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length); }
                else if (e.key === 'Enter') { e.preventDefault(); setUserInput(filteredCommands[menuIndex].label + ' '); setShowMenu(false); }
              } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommand(userInput); setUserInput(''); }
            }} placeholder="键入指令 /note, /vision, /link..." className="w-full bg-slate-900 border border-slate-700/50 rounded-[28px] pl-6 pr-14 py-5 text-xs focus:border-indigo-500 outline-none resize-none min-h-[64px] no-scrollbar shadow-inner" />
            <button onClick={() => { handleCommand(userInput); setUserInput(''); }} className="absolute right-3.5 bottom-3.5 p-3 bg-indigo-600 rounded-[20px] shadow-lg active:scale-95 transition-all"><Send className="w-4 h-4 text-white" /></button>
          </div>
        </div>
      </aside>

      <main 
        ref={canvasRef}
        className={`flex-1 relative overflow-hidden transition-colors duration-500 ${isSpaceDown ? 'cursor-grabbing' : mode === 'pan' ? 'cursor-grab' : 'cursor-crosshair'} ${showGrid ? 'bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:60px_60px]' : 'bg-[#020617]'}`}
        onMouseDown={(e) => { if(isSpaceDown || mode==='pan' || e.shiftKey) setDraggingId('pan'); }}
        onMouseMove={(e) => {
          if (draggingId === 'pan') setOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
          else if (draggingId) setElements(prev => prev.map(el => el.id === draggingId ? { ...el, x: el.x + e.movementX / scale, y: el.y + e.movementY / scale } : el));
        }}
        onMouseUp={() => setDraggingId(null)}
        onWheel={(e) => {
          const factor = Math.pow(1.2, -e.deltaY / 150);
          const newScale = Math.min(Math.max(scale * factor, 0.05), 5);
          const rect = canvasRef.current!.getBoundingClientRect();
          const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
          setOffset(prev => ({ x: mouseX - (mouseX - prev.x) * (newScale / scale), y: mouseY - (mouseY - prev.y) * (newScale / scale) }));
          setScale(newScale);
        }}
      >
        <div ref={captureRef} className="absolute inset-0 origin-top-left" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
           <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 5 }}>
            <defs>
              <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orientation="auto"><path d="M0,0 L0,10 L10,5 Z" fill="#6366f1" opacity="0.4" /></marker>
            </defs>
            {connections.map(c => {
              const f = elements.find(e => e.id === c.fromId); const t = elements.find(e => e.id === c.toId);
              if (!f || !t) return null;
              const fx = f.x + 550; const fy = f.y + 150; const tx = t.x; const ty = t.y + 150;
              return <g key={c.id}>
                <path d={`M ${fx} ${fy} C ${fx+100} ${fy}, ${tx-100} ${ty}, ${tx} ${ty}`} fill="none" stroke="#6366f1" strokeWidth="2.5" opacity="0.3" markerEnd="url(#arrow)" />
                {c.label && <text x={(fx+tx)/2} y={(fy+ty)/2 - 10} className="fill-indigo-300/80 text-[10px] font-black uppercase tracking-widest text-center" textAnchor="middle">{c.label}</text>}
              </g>;
            })}
          </svg>

          {elements.map(el => (
            <div key={el.id} className={`absolute bg-slate-900 border-2 border-slate-800 rounded-[40px] w-[550px] shadow-2xl transition-all ${draggingId === el.id ? 'z-50 border-indigo-500 scale-[1.02]' : 'z-10 hover:border-slate-600'}`} style={{ left: el.x, top: el.y }}>
              <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between cursor-grab active:cursor-grabbing" onMouseDown={(e) => { e.stopPropagation(); setDraggingId(el.id); }}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${el.type === DiagramType.NOTE ? 'bg-yellow-400' : 'bg-indigo-500'} animate-pulse`} />
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-100">{el.title}</span>
                </div>
                <button onClick={() => setElements(prev => prev.filter(i => i.id !== el.id))} className="text-slate-600 hover:text-rose-400 p-2"><Trash2 className="w-5 h-5" /></button>
              </div>
              <div className="p-9">
                {el.type === DiagramType.NOTE ? (
                   <textarea 
                    value={el.content || ''} 
                    onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, content: e.target.value } : i))}
                    className="w-full h-32 bg-transparent text-yellow-100/70 font-mono text-xs leading-relaxed outline-none resize-none border-none p-0 scrollbar-hide"
                   />
                ) : (
                  <>
                    <SmartDiagram id={el.id} code={el.mermaidCode} isVisible={true} themeVars={THEMES[0].mermaidVars} />
                    <div className="mt-8 flex gap-3">
                      <input 
                        value={el.localChatInput || ''} 
                        onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, localChatInput: e.target.value } : i))} 
                        onKeyDown={(e) => e.key === 'Enter' && updateCardCode(el)} 
                        placeholder="局部微调指令..." 
                        className="flex-1 bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-3 text-[10px] outline-none focus:border-indigo-500/50" 
                      />
                      <button onClick={() => updateCardCode(el)} disabled={el.isLocalUpdating} className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all">
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
          scale={scale} 
          mode={mode} 
          onSetMode={setMode}
          onZoomIn={() => setScale(s => Math.min(s * 1.3, 5))} 
          onZoomOut={() => setScale(s => Math.max(s * 0.7, 0.05))}
          onReset={() => { setOffset({x:100,y:100}); setScale(0.8); }}
          onFitView={() => {}} 
          onAutoLayout={() => handleCommand('/layout')}
          onExportImage={() => {}} 
          onSaveProject={() => handleCommand('/save')}
          onClearCanvas={() => handleCommand('/clear')}
          showGrid={showGrid} 
          onToggleGrid={() => setShowGrid(!showGrid)}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.length > 0}
          canRedo={future.length > 0}
          onLoadProject={() => handleCommand('/load')}
        />
      </main>
    </div>
  );
};

export default App;
