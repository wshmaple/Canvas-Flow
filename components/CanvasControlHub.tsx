
import React, { useState } from 'react';
import { 
  Plus, Minus, Home, Wand2, Camera, Hash, MousePointer2, 
  Hand, Info, Focus, ChevronRight, ChevronLeft, LayoutGrid, 
  Palette, Terminal, Eraser, Move, Undo2, Redo2, Save, FolderOpen
} from 'lucide-react';

export type InteractionMode = 'select' | 'pan';

interface CanvasControlHubProps {
  scale: number; 
  mode: InteractionMode; 
  onSetMode: (mode: InteractionMode) => void;
  onZoomIn: () => void; 
  onZoomOut: () => void; 
  onSetScale?: (scale: number) => void;
  onReset: () => void; 
  onFitView: () => void; 
  onAutoLayout: () => void;
  onExportImage: () => void; 
  onSaveProject?: () => void; 
  onLoadProject?: () => void;
  onClearCanvas: () => void; 
  isFullScreen?: boolean; 
  onToggleFullScreen?: () => void;
  showGrid: boolean; 
  onToggleGrid: () => void; 
  onUndo?: () => void; 
  onRedo?: () => void;
  canUndo?: boolean; 
  canRedo?: boolean;
}

const CanvasControlHub: React.FC<CanvasControlHubProps> = ({
  scale, mode, onSetMode, onZoomIn, onZoomOut, onReset, onFitView, onAutoLayout, 
  onExportImage, showGrid, onToggleGrid, onClearCanvas, onUndo, onRedo, canUndo, canRedo, 
  onSaveProject, onLoadProject
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const zoomPercentage = Math.round(scale * 100);

  return (
    <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-[100] ring-1 ring-white/5 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExpanded ? 'px-3 py-2 gap-4 w-auto' : 'w-14 h-14 justify-center hover:scale-110 cursor-pointer group'}`} onClick={() => !isExpanded && setIsExpanded(true)}>
      
      {!isExpanded ? (
        <Terminal className="w-6 h-6 text-indigo-400 group-hover:rotate-12 transition-transform" />
      ) : (
        <>
          <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }} className="p-2.5 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-400 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 px-1.5 py-1 bg-black/30 rounded-full border border-white/5">
            <ToolButton onClick={() => onSetMode('select')} icon={<MousePointer2 className="w-4 h-4" />} active={mode === 'select'} tooltip="指针 (V)" />
            <ToolButton onClick={() => onSetMode('pan')} icon={<Hand className="w-4 h-4" />} active={mode === 'pan'} tooltip="抓手 (H/Space)" />
          </div>

          <div className="flex items-center gap-1.5 px-1.5 py-1 bg-black/30 rounded-full border border-white/5">
            <ToolButton onClick={() => onUndo?.()} icon={<Undo2 className="w-4 h-4" />} disabled={!canUndo} tooltip="撤销 (Ctrl+Z)" />
            <ToolButton onClick={() => onRedo?.()} icon={<Redo2 className="w-4 h-4" />} disabled={!canRedo} tooltip="重做 (Ctrl+Y)" />
          </div>

          <div className="flex items-center gap-1 bg-black/30 rounded-full border border-white/5 px-3 py-1">
            <button onClick={(e) => { e.stopPropagation(); onZoomOut(); }} className="p-1 hover:text-indigo-400 transition-colors"><Minus className="w-3.5 h-3.5" /></button>
            <span className="text-[10px] font-black font-mono w-12 text-center text-indigo-100">{zoomPercentage}%</span>
            <button onClick={(e) => { e.stopPropagation(); onZoomIn(); }} className="p-1 hover:text-indigo-400 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
          </div>

          <div className="flex items-center gap-1.5 px-1.5 py-1 bg-black/30 rounded-full border border-white/5">
            <ToolButton onClick={onFitView} icon={<Focus className="w-4 h-4" />} tooltip="对焦视口" />
            <ToolButton onClick={onReset} icon={<Home className="w-4 h-4" />} tooltip="重置视图" />
            <ToolButton onClick={onToggleGrid} icon={<Hash className="w-4 h-4" />} active={showGrid} tooltip="切换网格" />
          </div>

          <div className="flex items-center gap-1.5 px-1.5 py-1 bg-black/30 rounded-full border border-white/5">
            <ToolButton onClick={onSaveProject || (() => {})} icon={<Save className="w-4 h-4 text-sky-400" />} tooltip="导出存档" />
            <ToolButton onClick={onLoadProject || (() => {})} icon={<FolderOpen className="w-4 h-4 text-sky-400" />} tooltip="导入存档" />
            <ToolButton onClick={onAutoLayout} icon={<Wand2 className="w-4 h-4 text-amber-400" />} tooltip="智能布局" />
            <ToolButton onClick={onExportImage} icon={<Camera className="w-4 h-4 text-emerald-400" />} tooltip="高清导出" />
            <ToolButton onClick={onClearCanvas} icon={<Eraser className="w-4 h-4 text-rose-400" />} tooltip="清空画布" />
          </div>
        </>
      )}

      {!isExpanded && (
        <span className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none translate-y-2 group-hover:translate-y-0 whitespace-nowrap shadow-xl border border-white/10">
          Command Hub
        </span>
      )}
    </div>
  );
};

const ToolButton: React.FC<{ onClick: () => void; icon: React.ReactNode; tooltip: string; active?: boolean; disabled?: boolean }> = ({ onClick, icon, tooltip, active, disabled }) => (
  <button 
    onClick={(e) => { e.stopPropagation(); if(!disabled) onClick(); }} 
    disabled={disabled}
    className={`group relative p-2.5 rounded-full transition-all active:scale-90 ${disabled ? 'opacity-20 cursor-not-allowed' : active ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
  >
    {icon}
    {!disabled && (
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1.5 bg-slate-950 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-y-1 group-hover:translate-y-0 whitespace-nowrap shadow-2xl border border-white/10 z-[110]">
        {tooltip}
      </span>
    )}
  </button>
);

export default CanvasControlHub;
