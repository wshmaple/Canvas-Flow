
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Plus, Minus, Move, Layers, Settings, History, 
  Maximize2, MousePointer2, ChevronRight, ChevronDown, 
  Trash2, Edit3, Check, X, Target, ListTree, Activity, Palette, Sparkles, BookOpen,
  Download, Wand2, Search, Zap, ExternalLink, Copy, CheckCircle2
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { AgentRole, AgentStatus, CanvasElement, CollaborativeResponse, DiagramType, THEMES, ElementTheme, PaletteScheme } from './types';
import { processCollaborativeContent, modifyDiagramContent, generateProfessionalPalette } from './services/geminiService';
import AgentPanel from './components/AgentPanel';
import MermaidChart from './components/MermaidChart';

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [customThemes, setCustomThemes] = useState<ElementTheme[]>(THEMES);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'list'>('input');
  const [showThemePickerId, setShowThemePickerId] = useState<string | null>(null);

  // Theme Workshop State
  const [isThemeWorkshopOpen, setIsThemeWorkshopOpen] = useState(false);
  const [baseColorInput, setBaseColorInput] = useState('#6366f1');
  const [generatedPalettes, setGeneratedPalettes] = useState<PaletteScheme[]>([]);
  const [isGeneratingPalette, setIsGeneratingPalette] = useState(false);

  // UI Modification State
  const [modifyingId, setModifyingId] = useState<string | null>(null);
  const [modInstruction, setModInstruction] = useState('');
  const [isModifying, setIsModifying] = useState(false);

  // Canvas View State
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Element Drag State
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [elementDragOffset, setElementDragOffset] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

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

    try {
      updateAgent(AgentRole.SCHEDULER, 'processing', '正在执行深度全文本扫描...');
      const result = await processCollaborativeContent(input);
      
      const newBatch: CanvasElement[] = result.diagrams.map((diag, index) => ({
        id: crypto.randomUUID(),
        type: diag.decision.recommendedType,
        mermaidCode: diag.generation.mermaidCode,
        x: 100 + (index * 600),
        y: 100 + (index * 50),
        scale: 1,
        title: diag.title || `模块 ${index + 1}`,
        deconstructedElements: diag.parsing.entities,
        themeId: customThemes[index % customThemes.length].id
      }));

      setElements(prev => [...prev, ...newBatch]);
      updateAgent(AgentRole.SCHEDULER, 'completed', '内容拆解已完成');
      setActiveTab('list');
      if (newBatch.length > 0) setTimeout(() => focusElement(newBatch[0], 0.8), 500);
    } catch (error) {
      console.error(error);
      updateAgent(AgentRole.SCHEDULER, 'error', '解析失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateThemes = async () => {
    if (!baseColorInput.trim() || isGeneratingPalette) return;
    setIsGeneratingPalette(true);
    try {
      const palettes = await generateProfessionalPalette(baseColorInput);
      setGeneratedPalettes(palettes);
    } catch (error) {
      console.error(error);
      alert("配色生成失败，请检查输入格式。");
    } finally {
      setIsGeneratingPalette(false);
    }
  };

  const applyPaletteAsTheme = (palette: PaletteScheme) => {
    const mainColor = palette.colors.find(c => c.role.includes('主色'))?.hex || palette.colors[1].hex;
    const bgColor = palette.colors.find(c => c.role.includes('背景'))?.hex || palette.colors[0].hex;
    const accentColor = palette.colors.find(c => c.role.includes('强调'))?.hex || palette.colors[2].hex;

    const newTheme: ElementTheme = {
      id: `ai-theme-${Date.now()}`,
      name: palette.name,
      primary: mainColor,
      secondary: accentColor,
      bg: 'bg-slate-900',
      border: `border-[${mainColor}]/40`,
      text: `text-[${accentColor}]`,
      mermaidVars: {
        primaryColor: mainColor,
        primaryTextColor: palette.isWcagPassed ? '#ffffff' : '#000000',
        primaryBorderColor: accentColor,
        lineColor: mainColor,
        secondaryColor: bgColor,
        tertiaryColor: mainColor
      },
      metadata: palette
    };

    setCustomThemes(prev => [...prev, newTheme]);
    setIsThemeWorkshopOpen(false);
  };

  // Improved downloadCanvas: Calculates bounding box of all content
  const downloadCanvas = async () => {
    if (!canvasContentRef.current || elements.length === 0) return;

    // 1. Calculate the bounding box of all diagrams
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Approximate card size: 500px min-width, variable height
    elements.forEach(el => {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + 550); // Card width + buffer
      maxY = Math.max(maxY, el.y + 600); // Approximate card max height
    });

    const padding = 100;
    const captureWidth = (maxX - minX) + (padding * 2);
    const captureHeight = (maxY - minY) + (padding * 2);

    // 2. Temporarily adjust the canvas to capture full content
    const originalTransform = canvasContentRef.current.style.transform;
    const originalTransition = canvasContentRef.current.style.transition;
    
    // Neutralize transform to get absolute coordinate system capture
    canvasContentRef.current.style.transition = 'none';
    canvasContentRef.current.style.transform = `translate(${-minX + padding}px, ${-minY + padding}px) scale(1)`;

    try {
      const canvas = await html2canvas(canvasContentRef.current, {
        backgroundColor: '#020617',
        scale: 3, // High resolution
        useCORS: true,
        width: captureWidth,
        height: captureHeight,
        logging: false,
        onclone: (clonedDoc) => {
          // You can perform additional styling on the clone if needed
          const clonedElement = clonedDoc.querySelector('.canvas-card') as HTMLElement;
          if (clonedElement) {
            // Ensure no UI elements show up in the shot
          }
        }
      });
      
      const link = document.createElement('a');
      link.download = `architecture-ecosystem-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error("Export failed", err);
      alert("导出失败，请重试。");
    } finally {
      // 3. Restore original view
      canvasContentRef.current.style.transform = originalTransform;
      setTimeout(() => {
        if (canvasContentRef.current) canvasContentRef.current.style.transition = originalTransition;
      }, 10);
    }
  };

  const focusElement = (el: CanvasElement, targetScale?: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentScale = targetScale || scale;
    setOffset({ x: rect.width / 2 - (el.x * currentScale + 250 * currentScale), y: rect.height / 2 - (el.y * currentScale + 150 * currentScale) });
    if (targetScale) setScale(targetScale);
  };

  const handleModify = async (id: string) => {
    if (!modInstruction.trim() || isModifying) return;
    setIsModifying(true);
    try {
      const element = elements.find(el => el.id === id);
      if (!element) return;
      const updatedCode = await modifyDiagramContent(element.mermaidCode, modInstruction);
      setElements(prev => prev.map(el => el.id === id ? { ...el, mermaidCode: updatedCode } : el));
      setModifyingId(null);
      setModInstruction('');
    } catch (e) { alert("AI 修改失败"); } finally { setIsModifying(false); }
  };

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
  };

  // Canvas Handlers
  const onMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isHeader = target.closest('.card-header');
    if (isHeader && !target.closest('button')) {
      const card = target.closest('.canvas-card') as HTMLElement;
      const elementId = card.dataset.id;
      if (elementId) {
        setDraggingElementId(elementId);
        const element = elements.find(el => el.id === elementId);
        if (element) setElementDragOffset({ x: (e.clientX - offset.x) / scale - element.x, y: (e.clientY - offset.y) / scale - element.y });
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
      setElements(prev => prev.map(el => el.id === draggingElementId ? { ...el, x: (e.clientX - offset.x) / scale - elementDragOffset.x, y: (e.clientY - offset.y) / scale - elementDragOffset.y } : el));
    } else if (isPanning) {
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      const newScale = Math.min(Math.max(scale * (e.deltaY > 0 ? 0.9 : 1.1), 0.1), 5);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        setOffset({ x: mouseX - ((mouseX - offset.x) / scale) * newScale, y: mouseY - ((mouseY - offset.y) / scale) * newScale });
        setScale(newScale);
      }
      e.preventDefault();
    } else {
      setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-200 font-sans">
      {/* Sidebar */}
      <aside className="w-80 h-full border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl flex flex-col z-20 shadow-2xl">
        <div className="p-6 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h1 className="text-lg font-bold">架构智能体 PRO</h1>
            </div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Multi-Agent System</p>
          </div>
          <button onClick={() => setIsThemeWorkshopOpen(true)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 transition-all">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800">
          <button onClick={() => setActiveTab('input')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'input' ? 'border-b-2 border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'text-slate-500'}`}>拆解工坊</button>
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'list' ? 'border-b-2 border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'text-slate-500'}`}>元素目录</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
          {activeTab === 'input' ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="粘贴长篇文档或流程..." className="w-full h-64 bg-slate-800 border border-slate-700 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                <button onClick={handleProcess} disabled={isProcessing || !input.trim()} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                  启动协作拆解
                </button>
              </div>
              <AgentPanel agents={agents} />
            </div>
          ) : (
            <div className="space-y-2">
              {elements.map(el => (
                <div key={el.id} onClick={() => focusElement(el)} className="p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl cursor-pointer flex items-center justify-between border border-transparent hover:border-slate-700 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: customThemes.find(t => t.id === el.themeId)?.primary || '#fff' }} />
                    <span className="text-sm truncate font-medium w-40">{el.title}</span>
                  </div>
                  <Target className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
                </div>
              ))}
              {elements.length === 0 && <div className="py-12 text-center text-slate-600 text-xs font-bold uppercase tracking-widest">画布暂无内容</div>}
            </div>
          )}
        </div>
      </aside>

      {/* Main Canvas */}
      <main ref={canvasRef} className="flex-1 relative overflow-hidden bg-[#020617] bg-[radial-gradient(#1e293b_1.5px,transparent_1.5px)] [background-size:40px_40px]" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={() => { setDraggingElementId(null); setIsPanning(false); }} onWheel={onWheel}>
        <div ref={canvasContentRef} className="absolute inset-0 transition-transform duration-300 ease-out origin-top-left" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
          {elements.map(el => {
            const theme = customThemes.find(t => t.id === el.themeId) || THEMES[0];
            const isMod = modifyingId === el.id;
            return (
              <div key={el.id} data-id={el.id} className={`canvas-card absolute ${theme.bg} border-2 ${theme.border} rounded-3xl shadow-2xl group min-w-[500px] overflow-hidden`} style={{ left: el.x, top: el.y, zIndex: draggingElementId === el.id ? 100 : 10 }}>
                <div className="card-header px-6 py-4 border-b border-slate-800/50 flex items-center justify-between bg-slate-950/20 backdrop-blur-sm cursor-grab active:cursor-grabbing">
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full shadow-[0_0_10px_currentColor]" style={{ color: theme.primary, backgroundColor: 'currentColor' }} />
                    <h3 className="text-sm font-black text-slate-100 truncate max-w-[300px] uppercase tracking-wider">{el.title}</h3>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                    <button onClick={() => setModifyingId(isMod ? null : el.id)} className="p-2 hover:bg-slate-800 rounded-xl text-indigo-400" title="AI 修改"><Wand2 className="w-4 h-4" /></button>
                    <button onClick={() => setShowThemePickerId(showThemePickerId === el.id ? null : el.id)} className="p-2 hover:bg-slate-800 rounded-xl text-amber-400" title="更换主题"><Palette className="w-4 h-4" /></button>
                    <button onClick={() => focusElement(el, 1)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400" title="聚焦视角"><Search className="w-4 h-4" /></button>
                    <button onClick={() => deleteElement(el.id)} className="p-2 hover:bg-slate-800 rounded-xl text-rose-500" title="删除"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {isMod && (
                  <div className="absolute inset-0 z-[70] bg-slate-950/95 backdrop-blur-lg p-8 flex flex-col justify-center animate-in fade-in zoom-in duration-200">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center"><h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2"><Sparkles className="w-3 h-3" /> AI 智能重塑</h4><button onClick={() => setModifyingId(null)} className="text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5"/></button></div>
                      <input value={modInstruction} onChange={e => setModInstruction(e.target.value)} placeholder="输入修改意图，如：增加异常处理分支" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-inner" autoFocus onKeyDown={e => e.key === 'Enter' && handleModify(el.id)} />
                      <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setModifyingId(null)} className="px-6 py-2 text-xs font-bold uppercase text-slate-500">取消</button>
                        <button onClick={() => handleModify(el.id)} disabled={isModifying || !modInstruction.trim()} className="px-8 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-indigo-600/20 transition-all">
                          {isModifying ? <Loader2 className="animate-spin w-4 h-4 mx-auto" /> : '执行重构'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {showThemePickerId === el.id && (
                  <div className="absolute top-16 right-4 z-[60] bg-slate-900 border border-slate-700 rounded-2xl p-2 grid gap-1 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                    {customThemes.map(t => (
                      <button key={t.id} onClick={() => { setElements(prev => prev.map(item => item.id === el.id ? { ...item, themeId: t.id } : item)); setShowThemePickerId(null); }} className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-slate-800 text-[11px] font-bold transition-all">
                        <div className="w-3 h-3 rounded-full shadow-[0_0_5px_currentColor]" style={{ color: t.primary, backgroundColor: 'currentColor' }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="p-6 flex items-center justify-center min-h-[350px]">
                  <MermaidChart id={el.id} code={el.mermaidCode} themeVars={theme.mermaidVars} />
                </div>
              </div>
            );
          })}
        </div>

        {/* HUD Controls */}
        <div className="absolute top-6 right-6 flex gap-3 z-40">
          <button onClick={downloadCanvas} className="bg-slate-900/90 border border-slate-800 px-6 py-3 rounded-2xl flex items-center gap-3 hover:bg-indigo-600 text-white transition-all text-xs font-black uppercase tracking-widest shadow-2xl shadow-black/50 active:scale-95 group">
            <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" /> 导出完整高清画布
          </button>
        </div>

        <div className="absolute bottom-8 right-8 flex flex-col gap-3 z-40">
          <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-1.5 flex flex-col shadow-2xl">
            <button onClick={() => setScale(s => Math.min(s * 1.2, 5))} className="p-4 hover:bg-slate-800 rounded-2xl text-slate-400 transition-all"><Plus className="w-5 h-5"/></button>
            <button onClick={() => setScale(s => Math.max(s * 0.8, 0.1))} className="p-4 hover:bg-slate-800 rounded-2xl text-slate-400 transition-all"><Minus className="w-5 h-5"/></button>
            <div className="h-px bg-slate-800 mx-3 my-1" />
            <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="p-4 hover:bg-slate-800 rounded-2xl text-slate-400 transition-all"><Maximize2 className="w-5 h-5" /></button>
          </div>
          <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-3xl px-6 py-3 text-indigo-400 font-black text-xs text-center shadow-xl backdrop-blur-md">{Math.round(scale * 100)}%</div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-8 left-8 flex items-center gap-8 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] bg-slate-950/80 backdrop-blur-xl px-10 py-4 rounded-full border border-slate-800 shadow-2xl pointer-events-none select-none">
          <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> 拖拽头部平移</div>
          <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> AI 动态调整</div>
          <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span> Ctrl + 滚轮缩放</div>
        </div>
      </main>

      {/* Theme Workshop Modal */}
      {isThemeWorkshopOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/90 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.8)] border-white/5">
            <div className="p-10 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-6">
                <div className="p-4 bg-indigo-600/20 rounded-3xl">
                  <Palette className="w-10 h-10 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tight">AI 色彩建筑师</h2>
                  <p className="text-slate-500 text-xs mt-1 uppercase font-black tracking-[0.4em]">Algorithm-Driven Visual Identity System</p>
                </div>
              </div>
              <button onClick={() => setIsThemeWorkshopOpen(false)} className="p-5 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all"><X className="w-8 h-8"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-12 no-scrollbar bg-slate-950/20">
              <div className="max-w-5xl mx-auto space-y-16">
                <div className="space-y-8 bg-slate-900/40 p-10 rounded-[2.5rem] border border-white/5 shadow-inner">
                  <label className="text-xs font-black uppercase text-indigo-400 tracking-[0.5em] block ml-2">Seed Color Specification</label>
                  <div className="flex gap-6">
                    <div className="flex-1 relative group">
                      <div className="absolute inset-0 bg-indigo-500/10 blur-2xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-full"></div>
                      <input value={baseColorInput} onChange={e => setBaseColorInput(e.target.value)} className="w-full bg-slate-950 border-2 border-slate-800 rounded-3xl px-8 py-6 text-2xl font-mono text-white focus:border-indigo-500 outline-none transition-all shadow-2xl relative z-10" placeholder="#6366f1" />
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-2xl border-4 border-slate-800 shadow-lg relative z-20" style={{ backgroundColor: baseColorInput }} />
                    </div>
                    <button onClick={handleGenerateThemes} disabled={isGeneratingPalette} className="px-12 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-3xl font-black uppercase text-sm flex items-center gap-4 transition-all shadow-2xl shadow-indigo-600/30 active:scale-95">
                      {isGeneratingPalette ? <Loader2 className="animate-spin w-6 h-6"/> : <Zap className="w-6 h-6 fill-current"/>}
                      {isGeneratingPalette ? '正在解算颜色向量空间...' : '生成专业架构配色'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {generatedPalettes.map((p, idx) => (
                    <div key={idx} className="bg-slate-900/50 border border-white/5 rounded-[2.5rem] p-10 space-y-8 hover:border-indigo-500/40 hover:bg-slate-900 transition-all group relative overflow-hidden shadow-2xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase bg-indigo-500/20 text-indigo-400 px-4 py-1.5 rounded-full tracking-widest">{p.type}理论</span>
                        <div className="flex items-center gap-3">
                           <div className={`w-2 h-2 rounded-full ${p.isWcagPassed ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-rose-400'}`} />
                           <span className={`text-[10px] font-black uppercase ${p.isWcagPassed ? 'text-emerald-500' : 'text-rose-500'}`}>WCAG {p.contrastRatio}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-xl font-black text-white tracking-tight group-hover:text-indigo-400 transition-colors">{p.name}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium">"{p.principle}"</p>
                      </div>
                      
                      <div className="flex h-20 rounded-2xl overflow-hidden shadow-2xl border border-white/5">
                        {p.colors.map((c, ci) => (
                          <div key={ci} className="flex-1 group/color relative cursor-pointer overflow-hidden" style={{ backgroundColor: c.hex }} onClick={() => { navigator.clipboard.writeText(c.hex); }}>
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/color:opacity-100 flex flex-col items-center justify-center transition-all duration-300 translate-y-2 group-hover/color:translate-y-0">
                              <Copy className="w-5 h-5 text-white mb-1" />
                              <span className="text-[8px] text-white font-black uppercase">{c.hex}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="bg-slate-950/50 rounded-2xl p-4 border border-white/5">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">最佳应用场景</p>
                        <p className="text-[11px] text-slate-300 font-medium leading-relaxed">{p.sceneSuggestions}</p>
                      </div>

                      <button onClick={() => applyPaletteAsTheme(p)} className="w-full py-5 bg-white/5 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-white/10 hover:border-transparent active:scale-95">
                        应用为系统架构主题
                      </button>
                    </div>
                  ))}
                  {!generatedPalettes.length && !isGeneratingPalette && (
                    <div className="col-span-full py-32 text-center space-y-8 opacity-40">
                      <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                        <Palette className="w-12 h-12 text-slate-600" />
                      </div>
                      <p className="text-slate-500 font-black text-sm uppercase tracking-[0.8em]">输入色值并开始色彩实验</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-10 border-t border-slate-800 bg-slate-950/40 text-center">
               <p className="text-[11px] text-slate-700 font-black uppercase tracking-[0.5em] flex items-center justify-center gap-3">
                 <Zap className="w-3 h-3" /> Professional Multi-Agent Color Space Architecture <Zap className="w-3 h-3" />
               </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);

export default App;
