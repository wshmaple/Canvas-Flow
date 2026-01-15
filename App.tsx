
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Send, Undo2, Redo2, Terminal, Zap, Trash2, RefreshCw, Square,
  Wand2, Link as LinkIcon, StickyNote, ImageIcon, ShieldCheck, 
  Save, FolderOpen, Eraser, Command, MousePointer2, Hand, Focus, Home,
  Loader2, Download, Code2, Eye, CheckCircle2, XCircle, Layout, ChevronRight, Edit3,
  Search, Activity, Mic, Paperclip, BarChart3, ChevronDown, ChevronUp, AtSign, Clock
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { 
  AgentRole, CanvasElement, DiagramType, THEMES, Connection, ChatMessage, ThinkingStep, PlanNode
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

const MarkdownText: React.FC<{ text: string, elements: CanvasElement[], onTeleport: (id: string) => void }> = ({ text, elements, onTeleport }) => {
  const parts = text.split(/(```[\s\S]*?```|\n)/g);
  
  const renderContent = (content: string) => {
    let result: React.ReactNode[] = [content];
    const sortedElements = [...elements].sort((a, b) => b.title.length - a.title.length);

    sortedElements.forEach(el => {
      const newResult: React.ReactNode[] = [];
      result.forEach(part => {
        if (typeof part === 'string') {
          const splitRegex = new RegExp(`(【${el.title}】|"${el.title}"|@${el.title})`, 'g');
          const segments = part.split(splitRegex);
          segments.forEach(seg => {
            if (seg === `【${el.title}】` || seg === `"${el.title}"` || seg === `@${el.title}`) {
              newResult.push(
                <button 
                  key={crypto.randomUUID()}
                  onClick={() => onTeleport(el.id)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 rounded-md hover:bg-indigo-500/40 transition-all font-bold mx-0.5 group shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                >
                  <Focus className="w-2.5 h-2.5 group-hover:scale-125 transition-transform" />
                  {seg}
                </button>
              );
            } else {
              newResult.push(seg);
            }
          });
        } else {
          newResult.push(part);
        }
      });
      result = newResult;
    });
    return result;
  };

  return (
    <div className="space-y-2 break-words leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const code = part.replace(/```(\w+)?\n?/, '').replace(/```$/, '');
          return <pre key={i} className="bg-black/40 p-4 rounded-2xl overflow-x-auto font-mono text-[10px] border border-white/5 text-indigo-200 my-2">{code}</pre>;
        }
        if (part === '\n') return <div key={i} className="h-1" />;
        return <span key={i} className="text-slate-300">{renderContent(part)}</span>;
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
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isIndexExpanded, setIsIndexExpanded] = useState(false);
  
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionMenuIndex, setMentionMenuIndex] = useState(0);
  const filteredMentions = useMemo(() => {
    const lastAtIdx = userInput.lastIndexOf('@');
    if (lastAtIdx === -1) return [];
    const query = userInput.slice(lastAtIdx + 1).toLowerCase();
    return elements.filter(el => el.title.toLowerCase().includes(query));
  }, [userInput, elements]);

  const [showSourceMap, setShowSourceMap] = useState<Record<string, boolean>>({});

  const globalAbortControllerRef = useRef<AbortController | null>(null);
  const cardAbortControllersRef = useRef<Record<string, AbortController>>({});

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

  useEffect(() => {
    const lastAtIdx = userInput.lastIndexOf('@');
    setShowMentionMenu(lastAtIdx !== -1 && filteredMentions.length > 0);
    setMentionMenuIndex(0);
  }, [userInput, filteredMentions.length]);

  const addThinkingStep = (agent: AgentRole, content: string) => {
    setThinkingSteps(prev => [...prev, { id: crypto.randomUUID(), agent, content, timestamp: Date.now() }]);
  };

  const addMessage = (role: 'user' | 'assistant', content: string, agent?: AgentRole, type: 'text' | 'plan' = 'text', plan?: PlanNode[]) => {
    const id = crypto.randomUUID();
    setMessages(prev => [...prev, { id, role, content, agent, timestamp: Date.now(), type, plan }]);
    return id;
  };

  const onTeleport = useCallback((id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    
    const sidebarWidth = 420;
    const viewportWidth = window.innerWidth - sidebarWidth;
    const viewportHeight = window.innerHeight;
    
    const targetScale = 0.8;
    const targetX = (viewportWidth / 2) - (el.x + 275) * targetScale;
    const targetY = (viewportHeight / 2) - (el.y + 300) * targetScale;
    
    setScale(targetScale);
    setOffset({ x: targetX, y: targetY });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId(null), 3000);
  }, [elements]);

  const onFitView = useCallback(() => {
    if (elements.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(el => {
      minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + 550); maxY = Math.max(maxY, el.y + 600); 
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
    setScale(newScale); setOffset({ x: newOffsetX, y: newOffsetY });
  }, [elements]);

  const stopGlobalAI = () => {
    if (globalAbortControllerRef.current) {
      globalAbortControllerRef.current.abort();
      globalAbortControllerRef.current = null;
      setIsProcessing(false);
      addMessage('assistant', '已停止任务。', AgentRole.INTERACTION_FEEDBACK);
    }
  };

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
          addMessage('assistant', '已重排画布布局。', AgentRole.SCHEDULER);
          break;
        case 'note':
          pushToHistory();
          const content = args.join(' ') || '架构备忘录...';
          const newNote: CanvasElement = {
            id: crypto.randomUUID(), type: DiagramType.NOTE, mermaidCode: '',
            x: -offset.x/scale + 200, y: -offset.y/scale + 200, scale: 1,
            title: '新笔记', level: 0, deconstructedElements: [], themeId: THEMES[0].id, content
          };
          setElements(prev => [...prev, newNote]);
          addMessage('assistant', '已在焦点位置创建笔记。', AgentRole.INTERACTION_FEEDBACK);
          break;
        case 'vision': fileRef.current?.click(); break;
        case 'review':
          setIsProcessing(true);
          addThinkingStep(AgentRole.REVIEWER, "正在深度扫描当前架构逻辑...");
          const report = await analyzeWorkspace(elements, "请审计当前架构并给出优化建议。");
          addMessage('assistant', report, AgentRole.REVIEWER);
          setIsProcessing(false);
          break;
        case 'save':
          const data = JSON.stringify({ elements, connections, view: { offset, scale } }, null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `Arch-${Date.now()}.json`;
          link.href = url; link.click();
          break;
        case 'clear':
          if (confirm("确定要清空画布吗？")) {
            pushToHistory(); setElements([]); setConnections([]); setThinkingSteps([]);
          }
          break;
        default: addMessage('assistant', '未知指令。', AgentRole.INTERACTION_FEEDBACK);
      }
    } else {
      startCollaborativeWorkflow(trimmed);
    }
  };

  const startCollaborativeWorkflow = async (input: string) => {
    if (isProcessing) { stopGlobalAI(); return; }
    setIsProcessing(true); setThinkingSteps([]); addMessage('user', input);
    const controller = new AbortController();
    globalAbortControllerRef.current = controller;
    try {
      addThinkingStep(AgentRole.CLASSIFIER, "架构解构与分类中...");
      const rawPlan = await classifyContentAgent(input);
      if (controller.signal.aborted) return;
      const planNodes: PlanNode[] = rawPlan.nodes.map(n => ({ ...n, id: crypto.randomUUID(), selected: true }));
      addMessage('assistant', "已为您规划以下架构模块，请确认或修改：", AgentRole.CLASSIFIER, 'plan', planNodes);
    } catch (err) {
      if (!controller.signal.aborted) addMessage('assistant', "规划失败。", AgentRole.INTERACTION_FEEDBACK);
    } finally { setIsProcessing(false); globalAbortControllerRef.current = null; }
  };

  const executeGeneration = async (plan: PlanNode[], originalInput: string) => {
    setIsProcessing(true); pushToHistory();
    const controller = new AbortController();
    globalAbortControllerRef.current = controller;
    const selectedNodes = plan.filter(p => p.selected);
    addThinkingStep(AgentRole.GENERATOR, `并行生成 ${selectedNodes.length} 个核心组件...`);
    try {
      for (const node of selectedNodes) {
        if (controller.signal.aborted) break;
        addThinkingStep(AgentRole.GENERATOR, `正在绘制：${node.title}...`);
        const code = await generateDiagramAgent(node, originalInput);
        setElements(prev => [...prev, {
          id: node.id, type: node.suggestedType, mermaidCode: code,
          x: 100 + (node.level - 1) * 600, y: 100 + prev.length * 400,
          scale: 1, title: node.title, level: node.level, deconstructedElements: [], themeId: THEMES[0].id
        }]);
      }
      if (!controller.signal.aborted) {
        addMessage('assistant', `架构部署完成！您可以点击上方气泡整理布局，或点击正文中的模块名飞跃对焦。`, AgentRole.SCHEDULER);
        onFitView();
      }
    } finally { setIsProcessing(false); globalAbortControllerRef.current = null; }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
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
      } finally { setIsProcessing(false); }
    };
    reader.readAsDataURL(file);
  };

  const updateCardCode = async (el: CanvasElement) => {
    if (el.isLocalUpdating) { stopCardAI(el.id); return; }
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

  const stopCardAI = (id: string) => {
    if (cardAbortControllersRef.current[id]) { cardAbortControllersRef.current[id].abort(); delete cardAbortControllersRef.current[id]; }
    setElements(prev => prev.map(i => i.id === id ? { ...i, isLocalUpdating: false } : i));
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (mainRef.current) {
      const rect = mainRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
      const factor = Math.pow(1.1, -e.deltaY / 100);
      const newScale = Math.min(Math.max(scale * factor, 0.05), 5);
      const worldX = (mouseX - offset.x) / scale; const worldY = (mouseY - offset.y) / scale;
      const newOffsetX = mouseX - worldX * newScale; const newOffsetY = mouseY - worldY * newScale;
      setScale(newScale); setOffset({ x: newOffsetX, y: newOffsetY });
    }
  }, [scale, offset]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); setIsSpaceDown(true); setMode('pan'); }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { setIsSpaceDown(false); setMode('select'); } };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [undo, redo]);

  const healthStats = useMemo(() => ({
    complexity: elements.length * 15 + connections.length * 8,
    connectivity: elements.length > 0 ? (connections.length / elements.length).toFixed(1) : '0',
    score: Math.max(0, 100 - (elements.length > 5 ? (elements.length - 5) * 5 : 0))
  }), [elements.length, connections.length]);

  const quickActions = useMemo(() => {
    const actions = [];
    const lastMsg = messages[messages.length - 1];
    
    if (elements.length === 0) {
      actions.push({ id: 'example', label: '生成示例：分布式秒杀架构', icon: <Zap className="w-3.5 h-3.5 text-amber-400" />, onClick: () => handleCommand('设计一个包含 Redis 预减库存、RocketMQ 削峰填谷的高并发秒杀系统') });
      actions.push({ id: 'vision', label: '从草图还原架构', icon: <ImageIcon className="w-3.5 h-3.5 text-pink-400" />, onClick: () => handleCommand('/vision') });
    } else {
      if (lastMsg?.content.includes('完成') || lastMsg?.content.includes('部署')) {
        actions.push({ id: 'layout', label: '一键自动排版', icon: <Layout className="w-3.5 h-3.5 text-indigo-400" />, onClick: () => handleCommand('/layout') });
        actions.push({ id: 'review', label: '执行并发风险审计', icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />, onClick: () => handleCommand('/review') });
      } else {
        actions.push({ id: 'note', label: '添加技术备注', icon: <StickyNote className="w-3.5 h-3.5 text-yellow-400" />, onClick: () => handleCommand('/note') });
        actions.push({ id: 'link_auto', label: '关联已有模块', icon: <LinkIcon className="w-3.5 h-3.5 text-sky-400" />, onClick: () => addMessage('assistant', '请在指令框输入 `@模块1 @模块2` 来建立连接。', AgentRole.INTERACTION_FEEDBACK) });
      }
      actions.push({ id: 'clear', label: '重置工作区', icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />, onClick: () => handleCommand('/clear') });
    }
    return actions;
  }, [elements.length, messages]);

  const filteredIndex = useMemo(() => 
    elements.filter(el => el.title.toLowerCase().includes(searchQuery.toLowerCase())), 
    [elements, searchQuery]
  );

  const insertMention = (title: string) => {
    const lastAtIdx = userInput.lastIndexOf('@');
    const newVal = userInput.slice(0, lastAtIdx) + '@' + title + ' ';
    setUserInput(newVal);
    setShowMentionMenu(false);
    inputRef.current?.focus();
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-200 overflow-hidden font-sans select-none">
      <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={onFileChange} />
      
      <aside className="w-[420px] h-full border-r border-slate-800 bg-slate-900/80 backdrop-blur-3xl z-20 flex flex-col shadow-2xl relative">
        <div className="p-7 border-b border-slate-800 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner group"><Terminal className="w-5 h-5 text-indigo-400 group-hover:rotate-12 transition-transform" /></div>
             <h1 className="font-black tracking-tighter uppercase text-sm bg-gradient-to-r from-indigo-400 to-sky-400 bg-clip-text text-transparent">ARCH PRO ENGINE</h1>
           </div>
           <div className="flex gap-1">
             <button onClick={undo} disabled={history.length===0} className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-20 transition-all active:scale-90"><Undo2 className="w-4 h-4" /></button>
             <button onClick={redo} disabled={future.length===0} className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-20 transition-all active:scale-90"><Redo2 className="w-4 h-4" /></button>
           </div>
        </div>

        <div className="px-7 py-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
           <div className="flex flex-col">
             <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Complexity</span>
             <span className="text-xs font-mono font-bold text-indigo-400">{healthStats.complexity}</span>
           </div>
           <div className="flex flex-col items-center">
             <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Connectivity</span>
             <span className="text-xs font-mono font-bold text-sky-400">{healthStats.connectivity}</span>
           </div>
           <div className="flex flex-col items-end">
             <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Audit Score</span>
             <div className="flex items-center gap-1.5">
               <span className={`text-xs font-mono font-bold ${healthStats.score > 80 ? 'text-emerald-400' : 'text-amber-400'}`}>{healthStats.score}</span>
               <div className={`w-1.5 h-1.5 rounded-full ${healthStats.score > 80 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
             </div>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7 space-y-7 no-scrollbar scroll-smooth">
          <AgentPanel agents={[
            { role: AgentRole.SCHEDULER, status: isProcessing ? 'processing' : 'completed', message: isProcessing ? '分析拓扑结构中...' : '在线' },
            { role: AgentRole.CLASSIFIER, status: 'idle', message: '就绪' },
            { role: AgentRole.GENERATOR, status: 'idle', message: '就绪' }
          ]} thinkingSteps={thinkingSteps} />

          {elements.length > 0 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-3xl overflow-hidden shadow-inner">
               <button 
                 onClick={() => setIsIndexExpanded(!isIndexExpanded)}
                 className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
               >
                 <div className="flex items-center gap-3">
                   <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">架构全景索引 ({elements.length})</span>
                 </div>
                 {isIndexExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
               </button>
               {isIndexExpanded && (
                 <div className="px-5 pb-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                      <input 
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-[10px] outline-none focus:border-indigo-500/50 transition-all"
                        placeholder="检索模块..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {filteredIndex.map(el => (
                        <button 
                          key={el.id}
                          onClick={() => onTeleport(el.id)}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-900/30 hover:bg-indigo-500/15 rounded-xl border border-white/5 hover:border-indigo-500/30 transition-all group"
                        >
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-300 truncate transition-colors">{el.title}</span>
                          <Focus className="w-3 h-3 text-slate-600 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                        </button>
                      ))}
                    </div>
                 </div>
               )}
            </div>
          )}

          <div className="space-y-8">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col gap-2.5 ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
                <div className={`flex items-center gap-2 px-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`p-1 rounded-md ${msg.role === 'user' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-indigo-400'}`}>
                    <Zap className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    {msg.agent || (msg.role === 'user' ? 'YOU' : 'SYSTEM')}
                  </span>
                  <span className="text-[8px] font-mono text-slate-600 tracking-tighter">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                
                <div className={`max-w-[95%] px-5 py-4 rounded-3xl text-xs border leading-relaxed shadow-xl ${msg.role === 'user' ? 'bg-indigo-600 border-indigo-400/40 shadow-[0_10px_30px_rgba(79,70,229,0.3)]' : 'bg-slate-800/80 border-slate-700/50 backdrop-blur-sm'}`}>
                  {msg.type === 'plan' ? (
                    <div className="space-y-4 py-1">
                      <p className="font-bold text-slate-100">{msg.content}</p>
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                        {msg.plan?.map((node) => (
                          <div key={node.id} className="flex flex-col gap-2 p-3 bg-slate-900/60 rounded-2xl border border-white/5 group hover:border-indigo-500/40 transition-all">
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => {
                                  setMessages(prev => prev.map(m => m.id === msg.id ? {
                                    ...m, plan: m.plan?.map(n => n.id === node.id ? { ...n, selected: !n.selected } : n)
                                  } : m));
                                }}
                                className={`p-1 rounded-md transition-colors ${node.selected ? 'text-indigo-400 bg-indigo-500/15' : 'text-slate-600 hover:text-slate-400'}`}
                              >
                                {node.selected ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <input 
                                  className="bg-transparent font-bold truncate text-slate-200 focus:outline-none border-b border-transparent focus:border-indigo-500/50 w-full"
                                  value={node.title}
                                  onChange={(e) => {
                                    const newTitle = e.target.value;
                                    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, plan: m.plan?.map(n => n.id === node.id ? { ...n, title: newTitle } : n) } : m));
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => executeGeneration(msg.plan!, "根据选定方案绘制架构。")}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-2xl active:scale-95 transition-all group"
                      >
                        <Zap className="w-4 h-4 fill-white group-hover:animate-bounce" />
                        立即确认并渲染模块
                      </button>
                    </div>
                  ) : (
                    <MarkdownText text={msg.content} elements={elements} onTeleport={onTeleport} />
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-center gap-2 px-4 py-2 text-indigo-400 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[10px] font-black tracking-widest uppercase italic text-slate-500">正在生成 Mermaid 拓扑代码...</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-7 border-t border-slate-800 bg-slate-950/40 relative">
          <div className="absolute bottom-full left-0 right-0 px-7 pb-4 flex gap-2 overflow-x-auto no-scrollbar mask-fade-edges z-50">
            {quickActions.map(action => (
              <button 
                key={action.id} 
                onClick={action.onClick}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/80 backdrop-blur-3xl border border-white/5 hover:border-indigo-500/50 hover:bg-slate-700 rounded-2xl text-[10px] font-black whitespace-nowrap transition-all shadow-xl group active:scale-95"
              >
                <span className="group-hover:scale-125 transition-transform">{action.icon}</span>
                {action.label}
              </button>
            ))}
          </div>

          <div className="relative">
            {showMentionMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-4 bg-slate-900/95 border border-indigo-500/30 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden z-[110] animate-in slide-in-from-bottom-2 duration-200 backdrop-blur-xl">
                <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
                  <AtSign className="w-3 h-3 text-indigo-400" />
                  <span className="text-[9px] font-black uppercase text-slate-500">提及目标模块</span>
                </div>
                {filteredMentions.map((el, idx) => (
                  <button key={el.id} onClick={() => insertMention(el.title)} onMouseEnter={() => setMentionMenuIndex(idx)} className={`w-full px-5 py-4 flex items-center justify-between text-left transition-colors ${idx === mentionMenuIndex ? 'bg-indigo-600' : 'hover:bg-white/5'}`}>
                    <span className="text-xs font-bold text-white truncate">{el.title}</span>
                    <span className="text-[9px] bg-black/30 px-2 py-0.5 rounded text-slate-400 uppercase">{el.type}</span>
                  </button>
                ))}
              </div>
            )}

            {showMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-4 bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden z-[110] animate-in slide-in-from-bottom-2 duration-200">
                {filteredCommands.map((cmd, idx) => (
                  <button key={cmd.id} onClick={() => { setUserInput(cmd.label + ' '); setShowMenu(false); inputRef.current?.focus(); }} onMouseEnter={() => setMenuIndex(idx)} className={`w-full px-5 py-4 flex items-center gap-4 text-left transition-colors ${idx === menuIndex ? 'bg-indigo-600' : 'hover:bg-slate-700/50'}`}>
                    <div className={`p-2 rounded-xl bg-slate-900/50 ${idx === menuIndex ? 'text-white' : cmd.color}`}>{cmd.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate text-white">{cmd.label}</p>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{cmd.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <textarea 
              ref={inputRef} value={userInput} 
              onChange={(e) => setUserInput(e.target.value)} 
              onKeyDown={(e) => {
                if (showMentionMenu) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMentionMenuIndex(i => (i + 1) % filteredMentions.length); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionMenuIndex(i => (i - 1 + filteredMentions.length) % filteredMentions.length); }
                  else if (e.key === 'Enter') { e.preventDefault(); insertMention(filteredMentions[mentionMenuIndex].title); }
                  else if (e.key === 'Escape') { setShowMentionMenu(false); }
                } else if (showMenu) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex(i => (i + 1) % filteredCommands.length); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length); }
                  else if (e.key === 'Enter') { e.preventDefault(); setUserInput(filteredCommands[menuIndex].label + ' '); setShowMenu(false); }
                } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommand(userInput); setUserInput(''); }
              }} 
              placeholder="输入需求（@提及模块, /指令, 或直接聊天）..." 
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-[30px] pl-6 pr-24 py-5 text-xs focus:border-indigo-500 outline-none resize-none min-h-[90px] no-scrollbar shadow-inner transition-all duration-300 focus:shadow-[0_0_20px_rgba(79,70,229,0.1)]" 
            />
            <div className="absolute right-3.5 bottom-3.5 flex gap-2">
              <button className="p-3 rounded-full hover:bg-white/5 text-slate-500 transition-colors active:scale-90" title="语音指令"><Mic className="w-4 h-4" /></button>
              <button onClick={() => fileRef.current?.click()} className="p-3 rounded-full hover:bg-white/5 text-slate-500 transition-colors active:scale-90" title="图片转架构"><ImageIcon className="w-4 h-4" /></button>
              <button 
                onClick={() => { handleCommand(userInput); if(!isProcessing) setUserInput(''); }} 
                className={`p-3.5 rounded-[22px] shadow-2xl active:scale-90 transition-all duration-500 ${isProcessing ? 'bg-rose-600 animate-pulse shadow-rose-500/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'}`}
              >
                {isProcessing ? <Square className="w-4 h-4 text-white fill-white" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main 
        ref={mainRef}
        className={`flex-1 relative overflow-hidden bg-[radial-gradient(#1e293b_1.5px,transparent_1.5px)] [background-size:60px_60px] ${isSpaceDown ? 'cursor-grabbing' : mode === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
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
            <div 
              key={el.id} id={`card-${el.id}`}
              className={`absolute bg-slate-900 border-2 rounded-[44px] w-[550px] shadow-[0_30px_60px_rgba(0,0,0,0.5)] transition-all duration-500 ${highlightedId === el.id ? 'ring-[12px] ring-indigo-500/30 border-indigo-400 shadow-[0_0_80px_rgba(99,102,241,0.5)] animate-pulse' : 'border-slate-800'} ${draggingId === el.id ? 'z-50 border-indigo-400 scale-[1.03] rotate-1 shadow-2xl' : 'z-10'}`} 
              style={{ left: el.x, top: el.y }}
            >
              <div className="px-8 py-6 border-b border-slate-800/60 flex items-center justify-between cursor-grab active:cursor-grabbing" onMouseDown={(e) => { e.stopPropagation(); setDraggingId(el.id); }}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl ${el.type === DiagramType.NOTE ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'} flex items-center justify-center font-black text-[10px] border shadow-inner`}>{el.level || 'L'}</div>
                  <span className="text-[12px] font-black uppercase tracking-widest text-slate-100">{el.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setShowSourceMap(prev => ({ ...prev, [el.id]: !prev[el.id] })); }} className={`p-2.5 transition-colors rounded-xl hover:bg-white/5 ${showSourceMap[el.id] ? 'text-indigo-400' : 'text-slate-500'}`} title="切换源码/视图"><Code2 className="w-4 h-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); pushToHistory(); setElements(prev => prev.filter(i => i.id !== el.id)); }} className="text-slate-600 hover:text-rose-400 p-2.5 transition-colors rounded-xl hover:bg-white/5 active:scale-90" title="移除卡片"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="p-10">
                {el.type === DiagramType.NOTE ? (
                  <textarea value={el.content || ''} onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, content: e.target.value } : i))} className="w-full h-40 bg-transparent text-yellow-100/70 font-mono text-xs leading-relaxed outline-none resize-none border-none p-0 custom-scrollbar" placeholder="在此输入你的架构思考..." />
                ) : (
                  <>
                    <div className="relative overflow-hidden rounded-3xl bg-black/20 p-2 border border-white/5 shadow-inner min-h-[250px] flex items-center justify-center">
                      {showSourceMap[el.id] ? (
                        <div className="bg-black/50 p-6 rounded-2xl font-mono text-[10px] text-indigo-300/80 border border-white/5 w-full h-full max-h-[400px] overflow-auto whitespace-pre custom-scrollbar">{el.mermaidCode}</div>
                      ) : (
                        <SmartDiagram id={el.id} code={el.mermaidCode} isVisible={true} themeVars={THEMES[0].mermaidVars} />
                      )}
                    </div>
                    <div className="mt-10 flex gap-4 group">
                      <div className="relative flex-1">
                         <input 
                          value={el.localChatInput || ''} 
                          onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, localChatInput: e.target.value } : i))} 
                          onKeyDown={(e) => e.key === 'Enter' && updateCardCode(el)} 
                          placeholder="微调此模块细节（如：增加重试策略）..." 
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 text-[11px] outline-none focus:border-indigo-500/50 transition-all pr-12" 
                        />
                        <AtSign className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-700 pointer-events-none" />
                      </div>
                      <button onClick={() => updateCardCode(el)} className={`p-4 rounded-2xl shadow-xl active:scale-90 transition-all ${el.isLocalUpdating ? 'bg-rose-500/10 text-rose-400' : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-600 hover:text-white'}`}>
                        {el.isLocalUpdating ? <Square className="w-4 h-4 fill-current animate-pulse" /> : <Send className="w-4 h-4" />}
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
