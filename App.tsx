
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Send, Undo2, Redo2, Terminal, Zap, Trash2, RefreshCw, 
  Wand2, Link as LinkIcon, StickyNote, ImageIcon, ShieldCheck, 
  Save, FolderOpen, Eraser, Command, MousePointer2, Hand, Focus, Home
} from 'lucide-react';
import { 
  AgentRole, CanvasElement, DiagramType, THEMES, Connection, ChatMessage, ThinkingStep 
} from './types';
import { 
  classifyContentAgent, generateDiagramAgent, modifyDiagramContent, 
  findRelationshipBetweenDiagrams, visionToDiagram, analyzeWorkspace 
} from './services/geminiService';
import { calculateHierarchicalLayout } from './services/layoutService';
import SmartDiagram from './components/SmartDiagram';
import AgentPanel from './components/AgentPanel';
import CanvasControlHub, { InteractionMode } from './components/CanvasControlHub';

const COMMAND_REGISTRY = [
  { id: 'layout', label: '/layout', desc: '智能层级布局整理', icon: <Wand2 className="w-4 h-4" />, color: 'text-amber-400' },
  { id: 'link', label: '/link', desc: '连接图表 [标题1] [标题2]', icon: <LinkIcon className="w-4 h-4" />, color: 'text-indigo-400' },
  { id: 'note', label: '/note', desc: '创建随手记卡片', icon: <StickyNote className="w-4 h-4" />, color: 'text-yellow-400' },
  { id: 'vision', label: '/vision', desc: '视觉解构：图片转架构', icon: <ImageIcon className="w-4 h-4" />, color: 'text-pink-400' },
  { id: 'review', label: '/review', desc: '智能架构审计', icon: <ShieldCheck className="w-4 h-4" />, color: 'text-emerald-400' },
  { id: 'save', label: '/save', desc: '导出工程存档 (.json)', icon: <Save className="w-4 h-4" />, color: 'text-sky-400' },
  { id: 'load', label: '/load', desc: '导入工程存档 (.json)', icon: <FolderOpen className="w-4 h-4" />, color: 'text-sky-400' },
  { id: 'clear', label: '/clear', desc: '清空画布数据', icon: <Eraser className="w-4 h-4" />, color: 'text-rose-400' },
];

const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(```[\s\S]*?```|\n)/g);
  return (
    <div className="space-y-2 break-words">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const code = part.replace(/```(\w+)?\n?/, '').replace(/```$/, '');
          return <pre key={i} className="bg-black/40 p-3 rounded-xl overflow-x-auto font-mono text-[10px] border border-white/5 text-indigo-200">{code}</pre>;
        }
        if (part === '\n') return <div key={i} className="h-1" />;
        return <span key={i} className="text-slate-300">{part}</span>;
      })}
    </div>
  );
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [offset, setOffset] = useState({ x: 100, y: 100 });
  const [scale, setScale] = useState(0.8);
  const [mode, setMode] = useState<InteractionMode>('select');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  // History for Undo/Redo
  const [history, setHistory] = useState<{elements: CanvasElement[], connections: Connection[]}[]>([]);
  const [future, setFuture] = useState<{elements: CanvasElement[], connections: Connection[]}[]>([]);

  const pushToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-19), { elements: [...elements], connections: [...connections] }]);
    setFuture([]);
  }, [elements, connections]);

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

  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Command Menu State
  const [showMenu, setShowMenu] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const filteredCommands = useMemo(() => {
    if (!userInput.startsWith('/')) return [];
    const search = userInput.slice(1).toLowerCase();
    return COMMAND_REGISTRY.filter(c => c.id.includes(search));
  }, [userInput]);

  useEffect(() => {
    setShowMenu(filteredCommands.length > 0);
    setMenuIndex(0);
  }, [filteredCommands.length]);

  const addThinkingStep = (agent: AgentRole, content: string) => {
    setThinkingSteps(prev => [...prev, { id: crypto.randomUUID(), agent, content, timestamp: Date.now() }]);
  };

  const addMessage = (role: 'user' | 'assistant', content: string, agent?: AgentRole) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, content, agent, timestamp: Date.now() }]);
  };

  const onFitView = useCallback(() => {
    if (elements.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(el => {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + 550); 
      maxY = Math.max(maxY, el.y + 600); 
    });

    const padding = 100;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    
    const sidebarWidth = 420;
    const viewportWidth = window.innerWidth - sidebarWidth;
    const viewportHeight = window.innerHeight;
    
    const newScale = Math.min(viewportWidth / width, viewportHeight / height, 1.2);
    const newOffsetX = (viewportWidth - (maxX + minX) * newScale) / 2;
    const newOffsetY = (viewportHeight - (maxY + minY) * newScale) / 2;
    
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [elements]);

  const handleCommand = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    
    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.split(/\s+/);
      const cmdId = cmd.slice(1).toLowerCase();

      switch (cmdId) {
        case 'layout':
          pushToHistory();
          const pos = calculateHierarchicalLayout(elements, connections);
          setElements(prev => prev.map(el => {
            const p = pos.find(p => p.id === el.id);
            return p ? { ...el, x: p.x, y: p.y } : el;
          }));
          addMessage('assistant', '布局已整理。', AgentRole.SCHEDULER);
          break;
        case 'note':
          pushToHistory();
          const content = args.join(' ') || '在此记录笔记...';
          const newNote: CanvasElement = {
            id: crypto.randomUUID(), type: DiagramType.NOTE, mermaidCode: '',
            x: -offset.x/scale + 200, y: -offset.y/scale + 200, scale: 1,
            title: '随手记', level: 0, deconstructedElements: [], themeId: THEMES[0].id, content
          };
          setElements(prev => [...prev, newNote]);
          addMessage('assistant', '已创建笔记。', AgentRole.INTERACTION_FEEDBACK);
          break;
        case 'vision':
          fileRef.current?.click();
          break;
        case 'review':
          setIsProcessing(true);
          const report = await analyzeWorkspace(elements, "请审计当前架构并给出优化建议。");
          addMessage('assistant', report, AgentRole.REVIEWER);
          setIsProcessing(false);
          break;
        case 'save':
          const data = JSON.stringify({ elements, connections, view: { offset, scale } }, null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `Project-${Date.now()}.arch.json`;
          link.href = url;
          link.click();
          break;
        case 'clear':
          pushToHistory();
          setElements([]); setConnections([]); setThinkingSteps([]);
          break;
        default:
          addMessage('assistant', '未知指令。', AgentRole.INTERACTION_FEEDBACK);
      }
    } else {
      startCollaborativeWorkflow(trimmed);
    }
  };

  const startCollaborativeWorkflow = async (input: string) => {
    setIsProcessing(true);
    setThinkingSteps([]);
    addMessage('user', input);
    pushToHistory();

    try {
      addThinkingStep(AgentRole.CLASSIFIER, "正在解构需求层级...");
      const hierarchyMatch = input.match(/层级为[：:](.+)/);
      const customHierarchy = hierarchyMatch ? hierarchyMatch[1] : undefined;
      const plan = await classifyContentAgent(input, customHierarchy);
      
      addThinkingStep(AgentRole.TITLER, `已规划 ${plan.nodes.length} 个核心模块。`);
      const newElements: CanvasElement[] = [];
      
      for (const node of plan.nodes) {
        addThinkingStep(AgentRole.GENERATOR, `正在绘制 [${node.title}]...`);
        const code = await generateDiagramAgent(node, input);
        newElements.push({
          id: crypto.randomUUID(), type: node.suggestedType, mermaidCode: code,
          x: 100 + (node.level - 1) * 600, y: 100 + newElements.length * 350,
          scale: 1, title: node.title, level: node.level, deconstructedElements: [], themeId: THEMES[0].id
        });
      }

      setElements(prev => [...prev, ...newElements]);
      addMessage('assistant', `架构已生成：包含 ${plan.nodes.length} 个子图表。`, AgentRole.SCHEDULER);
    } catch (err) {
      addMessage('assistant', "协作生成失败，请重试。", AgentRole.INTERACTION_FEEDBACK);
    } finally {
      setIsProcessing(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (re) => {
      const base64 = (re.target?.result as string).split(',')[1];
      try {
        const diag = await visionToDiagram(base64);
        pushToHistory();
        setElements(prev => [...prev, {
          id: crypto.randomUUID(), type: diag.suggestedType as DiagramType,
          mermaidCode: diag.mermaidCode, x: -offset.x/scale+200, y: -offset.y/scale+200,
          scale: 1, title: diag.title, level: 1, deconstructedElements: [], themeId: THEMES[0].id
        }]);
        addMessage('assistant', '视觉架构已还原。', AgentRole.GENERATOR);
      } catch (e) { addMessage('assistant', '视觉解析失败。', AgentRole.INTERACTION_FEEDBACK); }
      finally { setIsProcessing(false); }
    };
    reader.readAsDataURL(file);
  };

  const updateCardCode = async (el: CanvasElement) => {
    if (!el.localChatInput?.trim()) return;
    setElements(prev => prev.map(i => i.id === el.id ? { ...i, isLocalUpdating: true } : i));
    try {
      const newCode = await modifyDiagramContent(el.mermaidCode, el.localChatInput);
      pushToHistory();
      setElements(prev => prev.map(i => i.id === el.id ? { ...i, mermaidCode: newCode, localChatInput: '', isLocalUpdating: false } : i));
    } catch (e) {
      setElements(prev => prev.map(i => i.id === el.id ? { ...i, isLocalUpdating: false } : i));
    }
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (mainRef.current) {
      const rect = mainRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = Math.pow(1.1, -e.deltaY / 100);
      const newScale = Math.min(Math.max(scale * factor, 0.05), 5);

      const worldX = (mouseX - offset.x) / scale;
      const worldY = (mouseY - offset.y) / scale;

      const newOffsetX = mouseX - worldX * newScale;
      const newOffsetY = mouseY - worldY * newScale;

      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    }
  }, [scale, offset]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); setIsSpaceDown(true); setMode('pan'); }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { setIsSpaceDown(false); setMode('select'); } };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [undo, redo]);

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-200 overflow-hidden font-sans select-none">
      <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={onFileChange} />
      
      <aside className="w-[420px] h-full border-r border-slate-800 bg-slate-900/80 backdrop-blur-3xl z-20 flex flex-col shadow-2xl">
        <div className="p-7 border-b border-slate-800 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20"><Terminal className="w-5 h-5 text-indigo-400" /></div>
             <h1 className="font-black tracking-tighter uppercase text-sm">ARCH PRO ENGINE</h1>
           </div>
           <div className="flex gap-1">
             <button onClick={undo} disabled={history.length===0} className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-20"><Undo2 className="w-4 h-4" /></button>
             <button onClick={redo} disabled={future.length===0} className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-20"><Redo2 className="w-4 h-4" /></button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7 space-y-7 no-scrollbar">
          <AgentPanel agents={[
            { role: AgentRole.SCHEDULER, status: isProcessing ? 'processing' : 'completed', message: isProcessing ? '计算中...' : '在线' },
            { role: AgentRole.CLASSIFIER, status: 'idle', message: '等待输入' },
            { role: AgentRole.GENERATOR, status: 'idle', message: '就绪' }
          ]} thinkingSteps={thinkingSteps} />

          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in duration-300`}>
                {msg.agent && <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><Zap className="w-2.5 h-2.5" />{msg.agent}</span>}
                <div className={`max-w-[95%] px-5 py-4 rounded-3xl text-xs border ${msg.role === 'user' ? 'bg-indigo-600 border-indigo-400/30' : 'bg-slate-800/80 border-slate-700/50'}`}>
                  <MarkdownText text={msg.content} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-7 border-t border-slate-800 bg-slate-950/40 relative">
          {showMenu && (
            <div className="absolute bottom-full left-7 right-7 mb-4 bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden z-[110] animate-in slide-in-from-bottom-2 duration-200">
              {filteredCommands.map((cmd, idx) => (
                <button key={cmd.id} onClick={() => { setUserInput(cmd.label + ' '); setShowMenu(false); inputRef.current?.focus(); }} onMouseEnter={() => setMenuIndex(idx)} className={`w-full px-5 py-3.5 flex items-center gap-4 text-left ${idx === menuIndex ? 'bg-indigo-600' : 'hover:bg-slate-700/50'}`}>
                  <div className={`p-2 rounded-xl bg-slate-900/50 ${idx === menuIndex ? 'text-white' : cmd.color}`}>{cmd.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{cmd.label}</p>
                    <p className="text-[9px] text-slate-500 truncate">{cmd.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea 
              ref={inputRef} value={userInput} 
              onChange={(e) => setUserInput(e.target.value)} 
              onKeyDown={(e) => {
                if (showMenu) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex(i => (i + 1) % filteredCommands.length); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length); }
                  else if (e.key === 'Enter') { e.preventDefault(); setUserInput(filteredCommands[menuIndex].label + ' '); setShowMenu(false); }
                } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommand(userInput); setUserInput(''); }
              }} 
              placeholder="输入需求或使用 / 指令..." 
              className="w-full bg-slate-900 border border-slate-700/50 rounded-[28px] pl-6 pr-14 py-5 text-xs focus:border-indigo-500 outline-none resize-none min-h-[80px] no-scrollbar shadow-inner" 
            />
            <button onClick={() => { handleCommand(userInput); setUserInput(''); }} className="absolute right-3.5 bottom-3.5 p-3 bg-indigo-600 rounded-[20px] shadow-lg active:scale-95 transition-all"><Send className="w-4 h-4 text-white" /></button>
          </div>
        </div>
      </aside>

      <main 
        ref={mainRef}
        className={`flex-1 relative overflow-hidden bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:60px_60px] ${isSpaceDown ? 'cursor-grabbing' : mode === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
        onMouseDown={(e) => { if(isSpaceDown || mode==='pan' || e.shiftKey) setDraggingId('pan'); }}
        onMouseMove={(e) => {
          if (draggingId === 'pan') setOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
          else if (draggingId) setElements(prev => prev.map(el => el.id === draggingId ? { ...el, x: el.x + e.movementX / scale, y: el.y + e.movementY / scale } : el));
        }}
        onMouseUp={() => setDraggingId(null)}
        onWheel={handleWheel}
      >
        <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
          {elements.map(el => (
            <div key={el.id} className={`absolute bg-slate-900 border-2 border-slate-800 rounded-[40px] w-[550px] shadow-2xl transition-all ${draggingId === el.id ? 'z-50 border-indigo-500 scale-[1.02]' : 'z-10'}`} style={{ left: el.x, top: el.y }}>
              <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between cursor-grab active:cursor-grabbing" onMouseDown={(e) => { e.stopPropagation(); setDraggingId(el.id); }}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${el.type === DiagramType.NOTE ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'} flex items-center justify-center font-black text-[10px] border`}>{el.level || 'N'}</div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-100">{el.title}</span>
                </div>
                <button onClick={() => { pushToHistory(); setElements(prev => prev.filter(i => i.id !== el.id)); }} className="text-slate-600 hover:text-rose-400 p-2"><Trash2 className="w-5 h-5" /></button>
              </div>
              <div className="p-9">
                {el.type === DiagramType.NOTE ? (
                  <textarea 
                    value={el.content || ''} 
                    onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, content: e.target.value } : i))}
                    className="w-full h-32 bg-transparent text-yellow-100/70 font-mono text-xs leading-relaxed outline-none resize-none border-none p-0"
                  />
                ) : (
                  <>
                    <SmartDiagram id={el.id} code={el.mermaidCode} isVisible={true} themeVars={THEMES[0].mermaidVars} />
                    <div className="mt-8 flex gap-3">
                      <input 
                        value={el.localChatInput || ''} 
                        onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, localChatInput: e.target.value } : i))} 
                        onKeyDown={(e) => e.key === 'Enter' && updateCardCode(el)} 
                        placeholder="微调指令..." 
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
          scale={scale} mode={mode} onSetMode={setMode}
          onZoomIn={() => setScale(s => Math.min(s * 1.3, 5))} 
          onZoomOut={() => setScale(s => Math.max(s * 0.7, 0.05))}
          onReset={() => { setOffset({x:100,y:100}); setScale(0.8); }}
          onFitView={onFitView} 
          onAutoLayout={() => handleCommand('/layout')}
          onExportImage={() => {}} 
          onSaveProject={() => handleCommand('/save')}
          onLoadProject={() => handleCommand('/load')}
          onClearCanvas={() => handleCommand('/clear')}
          showGrid={true} onToggleGrid={() => {}}
          onUndo={undo} onRedo={redo}
          canUndo={history.length > 0} canRedo={future.length > 0}
        />
      </main>
    </div>
  );
};

export default App;
