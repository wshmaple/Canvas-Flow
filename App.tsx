
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Send, Undo2, Redo2, Terminal, Zap, Trash2, RefreshCw, Square,
  Wand2, Link as LinkIcon, StickyNote, ImageIcon, ShieldCheck, 
  Save, FolderOpen, Eraser, Command, MousePointer2, Hand, Focus, Home,
  Loader2, Download, Code2, Eye, CheckCircle2, XCircle, Layout, ChevronRight, Edit3
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
    
    // 按长度排序标题，防止短标题匹配长标题的一部分
    const sortedElements = [...elements].sort((a, b) => b.title.length - a.title.length);

    sortedElements.forEach(el => {
      const newResult: React.ReactNode[] = [];
      result.forEach(part => {
        if (typeof part === 'string') {
          // 匹配多种引用格式：【标题】、"标题"、或者是独立的标题名
          const splitRegex = new RegExp(`(【${el.title}】|"${el.title}"|'${el.title}')`, 'g');
          const segments = part.split(splitRegex);
          segments.forEach(seg => {
            if (seg === `【${el.title}】` || seg === `"${el.title}"` || seg === `'${el.title}'`) {
              newResult.push(
                <button 
                  key={crypto.randomUUID()}
                  onClick={() => onTeleport(el.id)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 rounded-md hover:bg-indigo-500/30 transition-all font-bold mx-0.5 group"
                  title="点击飞跃至此模块"
                >
                  <Focus className="w-2.5 h-2.5 group-hover:scale-110 transition-transform" />
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
    
    const viewportWidth = window.innerWidth - 420;
    const viewportHeight = window.innerHeight;
    
    const targetScale = 0.8;
    const targetX = (viewportWidth / 2) - (el.x + 275) * targetScale;
    const targetY = (viewportHeight / 2) - (el.y + 300) * targetScale;
    
    // 平滑滚动并高亮提示
    setScale(targetScale);
    setOffset({ x: targetX, y: targetY });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId(null), 2500);
  }, [elements]);

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

  const stopGlobalAI = () => {
    if (globalAbortControllerRef.current) {
      globalAbortControllerRef.current.abort();
      globalAbortControllerRef.current = null;
      setIsProcessing(false);
      addMessage('assistant', '已根据您的要求中止任务。', AgentRole.INTERACTION_FEEDBACK);
    }
  };

  const stopCardAI = (id: string) => {
    if (cardAbortControllersRef.current[id]) {
      cardAbortControllersRef.current[id].abort();
      delete cardAbortControllersRef.current[id];
      setElements(prev => prev.map(i => i.id === id ? { ...i, isLocalUpdating: false } : i));
    }
  };

  const exportCardAsImage = async (id: string, title: string) => {
    const cardElement = document.getElementById(`card-${id}`);
    if (!cardElement) return;

    try {
      const canvas = await html2canvas(cardElement, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
        logging: false
      });
      const link = document.createElement('a');
      link.download = `${title.replace(/\s+/g, '-')}-arch.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Failed to export card image:', err);
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
          addMessage('assistant', '已优化画布布局。', AgentRole.SCHEDULER);
          break;
        case 'note':
          pushToHistory();
          const content = args.join(' ') || '在此输入笔记内容...';
          const newNote: CanvasElement = {
            id: crypto.randomUUID(), type: DiagramType.NOTE, mermaidCode: '',
            x: -offset.x/scale + 200, y: -offset.y/scale + 200, scale: 1,
            title: '新随手记', level: 0, deconstructedElements: [], themeId: THEMES[0].id, content
          };
          setElements(prev => [...prev, newNote]);
          addMessage('assistant', '已在画布上为您部署了一个笔记模块。', AgentRole.INTERACTION_FEEDBACK);
          break;
        case 'vision':
          fileRef.current?.click();
          break;
        case 'review':
          setIsProcessing(true);
          addThinkingStep(AgentRole.REVIEWER, "正在深度审计当前架构并寻找潜在瓶颈...");
          const report = await analyzeWorkspace(elements, "请审计当前架构并给出优化建议。");
          addMessage('assistant', report, AgentRole.REVIEWER);
          setIsProcessing(false);
          break;
        case 'save':
          const data = JSON.stringify({ elements, connections, view: { offset, scale } }, null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `ArchProject-${new Date().toISOString().slice(0,10)}.json`;
          link.href = url;
          link.click();
          break;
        case 'clear':
          if (confirm("确定要清空当前画布吗？")) {
            pushToHistory();
            setElements([]); setConnections([]); setThinkingSteps([]);
            addMessage('assistant', '画布已重置。', AgentRole.INTERACTION_FEEDBACK);
          }
          break;
        default:
          addMessage('assistant', '未识别指令，输入 / 查看可用列表。', AgentRole.INTERACTION_FEEDBACK);
      }
    } else {
      startCollaborativeWorkflow(trimmed);
    }
  };

  const startCollaborativeWorkflow = async (input: string) => {
    if (isProcessing) {
      stopGlobalAI();
      return;
    }
    
    setIsProcessing(true);
    setThinkingSteps([]);
    addMessage('user', input);
    
    const controller = new AbortController();
    globalAbortControllerRef.current = controller;

    try {
      addThinkingStep(AgentRole.CLASSIFIER, "正在解构需求并规划最佳可视化方案...");
      const hierarchyMatch = input.match(/层级为[：:](.+)/);
      const customHierarchy = hierarchyMatch ? hierarchyMatch[1] : undefined;
      
      const rawPlan = await classifyContentAgent(input, customHierarchy);
      if (controller.signal.aborted) return;
      
      const planNodes: PlanNode[] = rawPlan.nodes.map(n => ({
        ...n,
        id: crypto.randomUUID(),
        selected: true
      }));

      addMessage('assistant', "根据您的需求，我规划了以下模块架构，您可以在执行前修改模块标题或选择性剔除：", AgentRole.CLASSIFIER, 'plan', planNodes);
      
    } catch (err) {
      if (!controller.signal.aborted) {
        addMessage('assistant', "方案规划失败，请重试。", AgentRole.INTERACTION_FEEDBACK);
      }
    } finally {
      setIsProcessing(false);
      globalAbortControllerRef.current = null;
    }
  };

  const executeGeneration = async (plan: PlanNode[], originalInput: string) => {
    setIsProcessing(true);
    pushToHistory();
    const controller = new AbortController();
    globalAbortControllerRef.current = controller;
    
    const selectedNodes = plan.filter(p => p.selected);
    addThinkingStep(AgentRole.GENERATOR, `开始并行绘制 ${selectedNodes.length} 个核心模块图表...`);
    
    const newElements: CanvasElement[] = [];
    try {
      for (const node of selectedNodes) {
        if (controller.signal.aborted) break;
        addThinkingStep(AgentRole.GENERATOR, `正在绘制：【${node.title}】...`);
        const code = await generateDiagramAgent(node, originalInput);
        newElements.push({
          id: node.id, type: node.suggestedType, mermaidCode: code,
          x: 100 + (node.level - 1) * 600, y: 100 + newElements.length * 350,
          scale: 1, title: node.title, level: node.level, deconstructedElements: [], themeId: THEMES[0].id
        });
      }

      if (!controller.signal.aborted) {
        setElements(prev => [...prev, ...newElements]);
        addMessage('assistant', `架构已在画布完成部署！共生成 ${newElements.length} 个模块。您可以使用快捷指令进行架构审计。`, AgentRole.SCHEDULER);
        onFitView();
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        addMessage('assistant', "生成过程因异常中断，请检查模型连接。", AgentRole.INTERACTION_FEEDBACK);
      }
    } finally {
      setIsProcessing(false);
      globalAbortControllerRef.current = null;
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
        addMessage('assistant', `视觉引擎已将图片还原为架构模块：【${diag.title}】。`, AgentRole.GENERATOR);
      } catch (e) { addMessage('assistant', '视觉解析失败，请尝试更清晰的架构草图。', AgentRole.INTERACTION_FEEDBACK); }
      finally { setIsProcessing(false); }
    };
    reader.readAsDataURL(file);
  };

  const updateCardCode = async (el: CanvasElement) => {
    if (el.isLocalUpdating) {
      stopCardAI(el.id);
      return;
    }
    
    if (!el.localChatInput?.trim()) return;
    setElements(prev => prev.map(i => i.id === el.id ? { ...i, isLocalUpdating: true } : i));
    
    const controller = new AbortController();
    cardAbortControllersRef.current[el.id] = controller;
    
    try {
      const newCode = await modifyDiagramContent(el.mermaidCode, el.localChatInput);
      if (controller.signal.aborted) return;
      pushToHistory();
      setElements(prev => prev.map(i => i.id === el.id ? { ...i, mermaidCode: newCode, localChatInput: '', isLocalUpdating: false } : i));
    } catch (e) {
      if (!controller.signal.aborted) {
        setElements(prev => prev.map(i => i.id === el.id ? { ...i, isLocalUpdating: false } : i));
      }
    } finally {
      delete cardAbortControllersRef.current[el.id];
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

  // 根据当前状态动态生成的快捷动作
  const quickActions = useMemo(() => {
    const actions = [];
    if (elements.length > 0) {
      actions.push({ id: 'layout', label: '一键自动整理', icon: <Layout className="w-3.5 h-3.5" />, onClick: () => handleCommand('/layout') });
      actions.push({ id: 'review', label: '进行全域审计', icon: <ShieldCheck className="w-3.5 h-3.5" />, onClick: () => handleCommand('/review') });
      actions.push({ id: 'note', label: '快速记笔记', icon: <StickyNote className="w-3.5 h-3.5 text-yellow-400" />, onClick: () => handleCommand('/note') });
    } else {
      actions.push({ id: 'example1', label: '电商微服务架构', icon: <Zap className="w-3.5 h-3.5 text-amber-400" />, onClick: () => handleCommand('设计一个包含订单、支付、库存系统的电商微服务架构图') });
      actions.push({ id: 'vision', label: '视觉图片解析', icon: <ImageIcon className="w-3.5 h-3.5 text-pink-400" />, onClick: () => handleCommand('/vision') });
    }
    return actions;
  }, [elements.length]);

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-200 overflow-hidden font-sans select-none">
      <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={onFileChange} />
      
      <aside className="w-[420px] h-full border-r border-slate-800 bg-slate-900/80 backdrop-blur-3xl z-20 flex flex-col shadow-2xl relative">
        <div className="p-7 border-b border-slate-800 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner"><Terminal className="w-5 h-5 text-indigo-400" /></div>
             <h1 className="font-black tracking-tighter uppercase text-sm bg-gradient-to-r from-indigo-400 to-sky-400 bg-clip-text text-transparent">ARCH PRO ENGINE</h1>
           </div>
           <div className="flex gap-1">
             <button onClick={undo} disabled={history.length===0} className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-20 transition-all active:scale-90" title="撤销 (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
             <button onClick={redo} disabled={future.length===0} className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-20 transition-all active:scale-90" title="重做 (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7 space-y-7 no-scrollbar scroll-smooth">
          <AgentPanel agents={[
            { role: AgentRole.SCHEDULER, status: isProcessing ? 'processing' : 'completed', message: isProcessing ? '执行计划中...' : '在线' },
            { role: AgentRole.CLASSIFIER, status: 'idle', message: '就绪' },
            { role: AgentRole.GENERATOR, status: 'idle', message: '就绪' }
          ]} thinkingSteps={thinkingSteps} />

          <div className="space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
                {msg.agent && <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 px-2"><Zap className="w-2.5 h-2.5 text-indigo-400" />{msg.agent}</span>}
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
                                <div className="flex items-center gap-2">
                                  <input 
                                    className="bg-transparent font-bold truncate text-slate-200 focus:outline-none focus:text-white border-b border-transparent focus:border-indigo-500/50"
                                    value={node.title}
                                    onChange={(e) => {
                                      const newTitle = e.target.value;
                                      setMessages(prev => prev.map(m => m.id === msg.id ? {
                                        ...m, plan: m.plan?.map(n => n.id === node.id ? { ...n, title: newTitle } : n)
                                      } : m));
                                    }}
                                  />
                                  <span className="text-[8px] px-1 py-0.5 bg-slate-800 text-indigo-400 rounded uppercase font-black border border-indigo-500/20">{node.suggestedType}</span>
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-500 pl-8 italic">{node.description}</p>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => executeGeneration(msg.plan!, "请根据此确认的计划生成所有架构。")}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-2xl active:scale-95 transition-all mt-2 group"
                      >
                        <Zap className="w-4 h-4 fill-white group-hover:animate-pulse" />
                        立即执行部署任务
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
                <span className="text-[10px] font-black tracking-widest uppercase italic">AI 正在深度思考并构图...</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-7 border-t border-slate-800 bg-slate-950/40 relative">
          {/* 动态快捷动作栏 */}
          <div className="absolute bottom-full left-0 right-0 px-7 pb-4 flex gap-2 overflow-x-auto no-scrollbar mask-fade-edges z-50">
            {quickActions.map(action => (
              <button 
                key={action.id} 
                onClick={action.onClick}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/60 backdrop-blur-2xl border border-white/5 hover:border-indigo-500/50 hover:bg-slate-700/80 rounded-2xl text-[10px] font-black whitespace-nowrap transition-all shadow-xl group active:scale-95"
              >
                <span className="group-hover:rotate-12 transition-transform">{action.icon}</span>
                {action.label}
              </button>
            ))}
          </div>

          <div className="relative">
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
                if (showMenu) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex(i => (i + 1) % filteredCommands.length); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length); }
                  else if (e.key === 'Enter') { e.preventDefault(); setUserInput(filteredCommands[menuIndex].label + ' '); setShowMenu(false); }
                  else if (e.key === 'Escape') { setShowMenu(false); }
                } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommand(userInput); setUserInput(''); }
              }} 
              placeholder="输入需求或使用 / 指令探索..." 
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-[30px] pl-6 pr-14 py-5 text-xs focus:border-indigo-500 outline-none resize-none min-h-[90px] no-scrollbar shadow-inner transition-all duration-300 focus:shadow-[0_0_20px_rgba(79,70,229,0.1)]" 
            />
            <button 
              onClick={() => { handleCommand(userInput); if(!isProcessing) setUserInput(''); }} 
              className={`absolute right-3.5 bottom-3.5 p-3.5 rounded-[22px] shadow-2xl active:scale-90 transition-all duration-500 ${isProcessing ? 'bg-rose-600 hover:bg-rose-500 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'}`}
              title={isProcessing ? "停止生成" : "发送指令"}
            >
              {isProcessing ? <Square className="w-4 h-4 text-white fill-white" /> : <Send className="w-4 h-4 text-white" />}
            </button>
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
              key={el.id} 
              id={`card-${el.id}`}
              className={`absolute bg-slate-900 border-2 rounded-[44px] w-[550px] shadow-[0_30px_60px_rgba(0,0,0,0.5)] transition-all duration-300 ${highlightedId === el.id ? 'ring-8 ring-indigo-500/20 border-indigo-500 shadow-indigo-500/30' : 'border-slate-800'} ${draggingId === el.id ? 'z-50 border-indigo-400 scale-[1.03] shadow-2xl' : 'z-10'}`} 
              style={{ left: el.x, top: el.y }}
            >
              <div 
                className="px-8 py-6 border-b border-slate-800/60 flex items-center justify-between cursor-grab active:cursor-grabbing" 
                onMouseDown={(e) => { e.stopPropagation(); setDraggingId(el.id); }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl ${el.type === DiagramType.NOTE ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'} flex items-center justify-center font-black text-[10px] border shadow-inner`}>{el.level || 'L'}</div>
                  <span className="text-[12px] font-black uppercase tracking-[0.1em] text-slate-100">{el.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  {el.type !== DiagramType.NOTE && (
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); exportCardAsImage(el.id, el.title); }} 
                        className="text-slate-500 hover:text-emerald-400 p-2.5 transition-colors rounded-xl hover:bg-white/5 active:scale-90"
                        title="下载为高清图"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowSourceMap(prev => ({ ...prev, [el.id]: !prev[el.id] })); }} 
                        className={`p-2.5 transition-colors rounded-xl hover:bg-white/5 active:scale-90 ${showSourceMap[el.id] ? 'text-indigo-400' : 'text-slate-500 hover:text-indigo-400'}`}
                        title={showSourceMap[el.id] ? "显示图表" : "显示代码"}
                      >
                        {showSourceMap[el.id] ? <Eye className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
                      </button>
                    </>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); pushToHistory(); setElements(prev => prev.filter(i => i.id !== el.id)); }} 
                    className="text-slate-600 hover:text-rose-400 p-2.5 transition-colors rounded-xl hover:bg-white/5 active:scale-90"
                    title="移除此模块"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-10">
                {el.type === DiagramType.NOTE ? (
                  <textarea 
                    value={el.content || ''} 
                    onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, content: e.target.value } : i))}
                    className="w-full h-40 bg-transparent text-yellow-100/70 font-mono text-xs leading-relaxed outline-none resize-none border-none p-0 custom-scrollbar"
                    placeholder="在这里记录你的技术笔记..."
                  />
                ) : (
                  <>
                    <div className="relative overflow-hidden rounded-3xl bg-black/20 p-2 border border-white/5">
                      {showSourceMap[el.id] ? (
                        <div className="bg-black/50 p-6 rounded-2xl font-mono text-[10px] text-indigo-300/80 border border-white/5 min-h-[200px] max-h-[400px] overflow-auto whitespace-pre custom-scrollbar animate-in fade-in zoom-in-95 duration-300">
                          {el.mermaidCode}
                        </div>
                      ) : (
                        <SmartDiagram id={el.id} code={el.mermaidCode} isVisible={true} themeVars={THEMES[0].mermaidVars} />
                      )}
                    </div>
                    <div className="mt-10 flex gap-4">
                      <div className="relative flex-1">
                        <input 
                          value={el.localChatInput || ''} 
                          onChange={(e) => setElements(prev => prev.map(i => i.id === el.id ? { ...i, localChatInput: e.target.value } : i))} 
                          onKeyDown={(e) => e.key === 'Enter' && updateCardCode(el)} 
                          placeholder="微调此模块细节（如：增加超时处理）..." 
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-3.5 text-[11px] outline-none focus:border-indigo-500/50 transition-all pr-12 focus:shadow-inner" 
                        />
                        <Edit3 className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-700 pointer-events-none" />
                      </div>
                      <button 
                        onClick={() => updateCardCode(el)} 
                        className={`p-3.5 rounded-2xl transition-all duration-300 shadow-xl active:scale-90 ${el.isLocalUpdating ? 'bg-rose-500/10 text-rose-400' : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-600 hover:text-white'}`}
                      >
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
