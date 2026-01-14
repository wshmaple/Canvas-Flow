
import React, { useEffect, useRef } from 'react';
import { AgentStatus, AgentRole, ThinkingStep } from '../types';
import { CheckCircle, Loader2, AlertCircle, Circle, Terminal } from 'lucide-react';

interface AgentPanelProps {
  agents: AgentStatus[];
  thinkingSteps?: ThinkingStep[];
}

const AgentPanel: React.FC<AgentPanelProps> = ({ agents, thinkingSteps = [] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thinkingSteps]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-xl p-4 shadow-2xl">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-1 flex items-center justify-between">
          <span>智能体协同状态</span>
          <ActivityPulse />
        </h3>
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.role} className="flex items-center justify-between group">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`p-1.5 rounded-lg transition-colors ${
                  agent.status === 'processing' ? 'bg-indigo-500/10' : 'bg-slate-800'
                }`}>
                  {agent.status === 'processing' ? (
                    <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  ) : agent.status === 'completed' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  ) : agent.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-slate-300 truncate">{agent.role}</p>
                  <p className="text-[9px] text-slate-500 truncate">{agent.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Thinking Chain Console */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-48 shadow-inner">
        <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
          <Terminal className="w-3 h-3 text-emerald-400" />
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/80">Thinking Chain</span>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar font-mono text-[9px]">
          {thinkingSteps.map((step) => (
            <div key={step.id} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
              <span className="text-slate-600">[{new Date(step.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}]</span>
              <span className="text-indigo-400 font-bold shrink-0">{step.agent}:</span>
              <span className="text-slate-400 leading-relaxed">{step.content}</span>
            </div>
          ))}
          {thinkingSteps.length === 0 && (
            <div className="h-full flex items-center justify-center text-slate-700 italic">
              等待指令输入...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ActivityPulse = () => (
  <span className="flex h-1.5 w-1.5 relative">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
  </span>
);

export default AgentPanel;
