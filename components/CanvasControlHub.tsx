
import React, { useState } from 'react';
import { 
  Plus, Minus, Maximize2, Minimize2, Home, Wand2, 
  Camera, Hash, MousePointer2, Hand, Info, Focus,
  Save, FolderOpen, Trash2, Download, Upload,
  Undo2, Redo2
} from 'lucide-react';

export type InteractionMode = 'select' | 'pan';

interface CanvasControlHubProps {
  scale: number;
  mode: InteractionMode;
  onSetMode: (mode: InteractionMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetScale: (scale: number) => void;
  onReset: () => void;
  onFitView: () => void;
  onAutoLayout: () => void;
  onExportImage: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
  onClearCanvas: () => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const CanvasControlHub: React.FC<CanvasControlHubProps> = ({
  scale, mode, onSetMode, onZoomIn, onZoomOut, onSetScale, onReset, onFitView, onAutoLayout, 
  onExportImage, onSaveProject, onLoadProject, onClearCanvas, isFullScreen, onToggleFullScreen, showGrid, onToggleGrid,
  onUndo, onRedo, canUndo, canRedo
}) => {
  const [showPresets, setShowPresets] = useState(false);
  const zoomPercentage = Math.round(scale * 100);
  const presets = [0.25, 0.5, 1, 1.5, 2];

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[100] ring-1 ring-white/10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Group: Modes */}
      <div className="flex items-center bg-slate-950/40 rounded-xl p-0.5 border border-white/5">
        <ControlButton 
          onClick={() => onSetMode('select')} 
          icon={<MousePointer2 className="w-4 h-4" />} 
          active={mode === 'select'}
          tooltip="指针模式 (V)" 
        />
        <ControlButton 
          onClick={() => onSetMode('pan')} 
          icon={<Hand className="w-4 h-4" />} 
          active={mode === 'pan'}
          tooltip="抓手模式 (H / Space)" 
        />
      </div>

      <div className="w-[1px] h-6 bg-white/10 mx-0.5" />

      {/* Group: History */}
      <div className="flex items-center bg-slate-950/40 rounded-xl p-0.5 border border-white/5 gap-0.5">
        <ControlButton 
          onClick={onUndo} 
          icon={<Undo2 className="w-4 h-4" />} 
          disabled={!canUndo}
          tooltip="撤销 (Ctrl+Z)" 
          className={!canUndo ? 'opacity-30' : ''}
        />
        <ControlButton 
          onClick={onRedo} 
          icon={<Redo2 className="w-4 h-4" />} 
          disabled={!canRedo}
          tooltip="重做 (Ctrl+Y)" 
          className={!canRedo ? 'opacity-30' : ''}
        />
      </div>

      <div className="w-[1px] h-6 bg-white/10 mx-0.5" />

      {/* Group: Zoom */}
      <div className="flex items-center bg-slate-950/40 rounded-xl p-0.5 border border-white/5">
        <ControlButton onClick={onZoomOut} icon={<Minus className="w-3.5 h-3.5" />} tooltip="缩小" />
        <div className="relative">
          <button 
            onClick={() => setShowPresets(!showPresets)}
            className="w-16 py-1.5 text-center text-[11px] font-black font-mono text-indigo-400 hover:bg-white/5 rounded-lg transition-colors select-none"
          >
            {zoomPercentage}%
          </button>
          {showPresets && (
            <>
              <div className="fixed inset-0 z-[-1]" onClick={() => setShowPresets(false)} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-20 bg-slate-800 border border-white/10 rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
                {presets.map(p => (
                  <button
                    key={p}
                    onClick={() => { onSetScale(p); setShowPresets(false); }}
                    className={`w-full py-2 text-[10px] font-bold transition-colors ${scale === p ? 'bg-indigo-600 text-white' : 'hover:bg-white/5'}`}
                  >
                    {p * 100}%
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <ControlButton onClick={onZoomIn} icon={<Plus className="w-3.5 h-3.5" />} tooltip="放大" />
      </div>

      <div className="w-[1px] h-6 bg-white/10 mx-0.5" />

      {/* Group: View & Layout */}
      <div className="flex items-center gap-0.5">
        <ControlButton onClick={onFitView} icon={<Focus className="w-4 h-4" />} tooltip="自适应全员" />
        <ControlButton onClick={onReset} icon={<Home className="w-4 h-4" />} tooltip="重置视图" />
        <ControlButton 
          onClick={onToggleGrid} 
          icon={<Hash className="w-4 h-4" />} 
          active={showGrid}
          tooltip="切换网格" 
        />
        <ControlButton onClick={onAutoLayout} icon={<Wand2 className="w-4 h-4 text-amber-400" />} tooltip="智能布局" />
      </div>

      <div className="w-[1px] h-6 bg-white/10 mx-0.5" />

      {/* Group: Project Management */}
      <div className="flex items-center bg-indigo-500/5 rounded-xl p-0.5 border border-indigo-500/10 gap-0.5">
        <ControlButton onClick={onSaveProject} icon={<Download className="w-4 h-4 text-indigo-400" />} tooltip="导出工程 (JSON)" />
        <ControlButton onClick={onLoadProject} icon={<Upload className="w-4 h-4 text-indigo-400" />} tooltip="导入工程" />
        <ControlButton onClick={onClearCanvas} icon={<Trash2 className="w-4 h-4 text-rose-500" />} tooltip="清空画布" />
      </div>

      <div className="w-[1px] h-6 bg-white/10 mx-0.5" />

      {/* Group: System */}
      <div className="flex items-center gap-0.5">
        <ControlButton onClick={onExportImage} icon={<Camera className="w-4 h-4 text-emerald-400" />} tooltip="截图导出 (PNG)" />
        
        <div className="group relative">
           <ControlButton icon={<Info className="w-4 h-4" />} tooltip="帮助" onClick={() => {}} />
           <div className="absolute bottom-full right-0 mb-4 w-60 p-4 bg-slate-800 border border-white/10 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-y-2 group-hover:translate-y-0 backdrop-blur-xl z-[120]">
              <h4 className="text-[11px] font-black text-white mb-3 uppercase tracking-tighter flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                快捷操作指南
              </h4>
              <ul className="space-y-2 text-[10px] text-slate-400">
                <li className="flex justify-between border-b border-white/5 pb-1.5"><span>全量备份</span><span className="text-indigo-400">Export JSON</span></li>
                <li className="flex justify-between border-b border-white/5 pb-1.5"><span>画布平移</span><span className="text-indigo-400">Space / Shift+Drag</span></li>
                <li className="flex justify-between border-b border-white/5 pb-1.5"><span>撤销/重做</span><span className="text-indigo-400">Ctrl + Z / Y</span></li>
                <li className="flex justify-between"><span>下钻分析</span><span className="text-indigo-400">点击图表节点</span></li>
              </ul>
           </div>
        </div>

        <ControlButton 
          onClick={onToggleFullScreen} 
          icon={isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />} 
          tooltip="全屏切换" 
        />
      </div>
    </div>
  );
};

interface ControlButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

const ControlButton: React.FC<ControlButtonProps> = ({ onClick, icon, tooltip, active, disabled, className = "" }) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      if (!disabled) onClick();
    }}
    disabled={disabled}
    className={`group relative p-2 rounded-xl transition-all active:scale-90 ${
      active 
      ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.5)]' 
      : 'text-slate-400 hover:text-white hover:bg-white/10'
    } ${disabled ? 'cursor-not-allowed text-slate-700' : ''} ${className}`}
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
