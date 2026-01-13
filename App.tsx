
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
      bg: 'bg-slate-900', // We force slate-900 for canvas consistency but use vars
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

  const downloadCanvas = async () => {
    if (!canvasContentRef.current) return;
    const canvas = await html2canvas(canvasContentRef.current, { backgroundColor: '#020617', scale: 2, useCORS: true });
    const link = document.createElement('a');
    link.download = `architecture-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
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

  // Fix: Added missing deleteElement function to handle diagram removal
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
      <aside className="w-80 h-full border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl flex flex-col z-20">
        <div className="p-6 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h1 className="text-lg font-bold">架构智能体 PRO</h1>
            </div>
            <p className="text-[10px] text-slate-500 uppercase font-black">AI Diagram Ecosystem</p>
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
                <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="粘贴长篇文档..." className="w-full h-64 bg-slate-800 border border-slate-700 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                <button onClick={handleProcess} disabled={isProcessing || !input.trim()} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                  开始拆解
                </button>
              </div>
              <AgentPanel agents={agents} />
            </div>
          ) : (
            <div className="space-y-2">
              {elements.map(el => (
                <div key={el.id} onClick={() => focusElement(el)} className="p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl cursor-pointer flex items-center justify-between border border-transparent hover:border-slate-700">
                  <span className="text-sm truncate font-medium">{el.title}</span>
                  <Target className="w-4 h-4 text-slate-500" />
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Canvas */}
      <main ref={canvasRef} className="flex-1 relative overflow-hidden bg-[#020617] bg-[radial-gradient(#1e293b_1.5px,transparent_1.5px)] [background-size:40px_40px]" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={() => { setDraggingElementId(null); setIsPanning(false); }} onWheel={onWheel}>
        <div ref={canvasContentRef} className="absolute inset-0 transition-transform duration-75 origin-top-left" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
          {elements.map(el => {
            const theme = customThemes.find(t => t.id === el.themeId) || THEMES[0];
            const isMod = modifyingId === el.id;
            return (
              <div key={el.id} data-id={el.id} className={`canvas-card absolute ${theme.bg} border-2 ${theme.border} rounded-3xl shadow-2xl group min-w-[500px] overflow-hidden`} style={{ left: el.x, top: el.y, zIndex: draggingElementId === el.id ? 100 : 10 }}>
                <div className="card-header px-6 py-4 border-b border-slate-800/50 flex items-center justify-between bg-slate-950/20 backdrop-blur-sm cursor-grab">
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.primary }} />
                    <h3 className="text-sm font-black text-slate-100 truncate max-w-[300px] uppercase tracking-wider">{el.title}</h3>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => setModifyingId(isMod ? null : el.id)} className="p-2 hover:bg-slate-800 rounded-xl text-indigo-400"><Wand2 className="w-4 h-4" /></button>
                    <button onClick={() => setShowThemePickerId(showThemePickerId === el.id ? null : el.id)} className="p-2 hover:bg-slate-800 rounded-xl text-amber-400"><Palette className="w-4 h-4" /></button>
                    <button onClick={() => focusElement(el, 1)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"><Search className="w-4 h-4" /></button>
                    <button onClick={() => deleteElement(el.id)} className="p-2 hover:bg-slate-800 rounded-xl text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {isMod && (
                  <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur p-6 flex flex-col justify-center">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center"><h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest">AI 智能调整</h4><button onClick={() => setModifyingId(null)}><X className="w-4 h-4"/></button></div>
                      <input value={modInstruction} onChange={e => setModInstruction(e.target.value)} placeholder="输入修改指令..." className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && handleModify(el.id)} />
                      <button onClick={() => handleModify(el.id)} disabled={isModifying} className="w-full py-2 bg-indigo-600 rounded-xl text-xs font-bold uppercase">{isModifying ? '重塑中...' : '确认修改'}</button>
                    </div>
                  </div>
                )}

                {showThemePickerId === el.id && (
                  <div className="absolute top-16 right-4 z-50 bg-slate-900 border border-slate-700 rounded-xl p-2 grid gap-1 shadow-2xl">
                    {customThemes.map(t => (
                      <button key={t.id} onClick={() => { setElements(prev => prev.map(item => item.id === el.id ? { ...item, themeId: t.id } : item)); setShowThemePickerId(null); }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-[11px] font-bold">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.primary }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="p-6 flex items-center justify-center min-h-[300px]">
                  <MermaidChart id={el.id} code={el.mermaidCode} themeVars={theme.mermaidVars} />
                </div>
              </div>
            );
          })}
        </div>

        {/* HUD Controls */}
        <div className="absolute top-6 right-6 flex gap-3 z-40">
          <button onClick={downloadCanvas} className="bg-slate-900/80 border border-slate-800 px-5 py-2.5 rounded-2xl flex items-center gap-3 hover:bg-indigo-600/20 transition-all text-xs font-black uppercase tracking-widest">
            <Download className="w-4 h-4" /> 导出画布
          </button>
        </div>

        <div className="absolute bottom-8 right-8 flex flex-col gap-3 z-40">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-1.5 flex flex-col shadow-2xl">
            <button onClick={() => setScale(s => Math.min(s * 1.2, 5))} className="p-4 hover:bg-slate-800 rounded-2xl text-slate-400"><Plus className="w-5 h-5"/></button>
            <button onClick={() => setScale(s => Math.max(s * 0.8, 0.1))} className="p-4 hover:bg-slate-800 rounded-2xl text-slate-400"><Minus className="w-5 h-5"/></button>
          </div>
          <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl px-6 py-3 text-indigo-400 font-black text-xs">{Math.round(scale * 100)}%</div>
        </div>
      </main>

      {/* Theme Workshop Modal */}
      {isThemeWorkshopOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)]">
            <div className="p-8 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-white flex items-center gap-4">
                  <Palette className="w-8 h-8 text-indigo-400" />
                  AI 智能主题配色工坊
                </h2>
                <p className="text-slate-500 text-sm mt-1 uppercase font-bold tracking-widest">Professional AI Color Architect</p>
              </div>
              <button onClick={() => setIsThemeWorkshopOpen(false)} className="p-4 hover:bg-slate-800 rounded-3xl text-slate-400"><X className="w-8 h-8"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 no-scrollbar">
              <div className="max-w-4xl mx-auto space-y-12">
                <div className="space-y-6">
                  <label className="text-xs font-black uppercase text-indigo-400 tracking-[0.3em]">输入基础色 (HEX, RGB 或 颜色名称)</label>
                  <div className="flex gap-4">
                    <div className="flex-1 relative">
                      <input value={baseColorInput} onChange={e => setBaseColorInput(e.target.value)} className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-6 py-5 text-lg font-mono focus:border-indigo-500 outline-none transition-all" placeholder="#6366f1" />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-white/10" style={{ backgroundColor: baseColorInput }} />
                    </div>
                    <button onClick={handleGenerateThemes} disabled={isGeneratingPalette} className="px-10 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black uppercase text-sm flex items-center gap-3 transition-all shadow-lg shadow-indigo-600/20">
                      {isGeneratingPalette ? <Loader2 className="animate-spin w-5 h-5"/> : <Zap className="w-5 h-5"/>}
                      {isGeneratingPalette ? '正在通过色轮算法生成...' : '生成专业方案'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {generatedPalettes.map((p, idx) => (
                    <div key={idx} className="bg-slate-950 border border-slate-800 rounded-[2rem] p-8 space-y-6 hover:border-indigo-500/30 transition-all group relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full">{p.type}搭配</span>
                        <div className="flex items-center gap-2">
                           <span className={`text-[10px] font-bold ${p.isWcagPassed ? 'text-emerald-400' : 'text-rose-400'}`}>WCAG {p.contrastRatio}</span>
                        </div>
                      </div>
                      <h4 className="text-lg font-black text-white">{p.name}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed italic">"{p.principle}"</p>
                      
                      <div className="flex h-16 rounded-xl overflow-hidden shadow-inner">
                        {p.colors.map((c, ci) => (
                          <div key={ci} className="flex-1 group/color relative cursor-pointer" style={{ backgroundColor: c.hex }} title={`${c.role}: ${c.hex}`}>
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/color:opacity-100 flex items-center justify-center transition-opacity">
                              <Copy className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">场景建议: <span className="text-slate-300 normal-case">{p.sceneSuggestions}</span></p>
                      </div>

                      <button onClick={() => applyPaletteAsTheme(p)} className="w-full py-4 bg-slate-900 border border-slate-800 rounded-xl text-xs font-black uppercase hover:bg-indigo-600 hover:text-white transition-all">
                        应用为系统主题
                      </button>
                    </div>
                  ))}
                  {!generatedPalettes.length && !isGeneratingPalette && (
                    <div className="col-span-full py-20 text-center space-y-4">
                      <Palette className="w-16 h-16 text-slate-800 mx-auto" />
                      <p className="text-slate-600 font-bold uppercase tracking-widest">输入颜色并点击生成以开始探索色彩方案</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-8 border-t border-slate-800 bg-slate-950/20 text-center">
               <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.4em]">Algorithm: HSV Multi-Agent Vector Space | WCAG 2.1 Compliant</p>
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
