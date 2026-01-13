
import React from 'react';
import { AgentStatus, AgentRole } from '../types';
import { CheckCircle, Loader2, AlertCircle, Circle } from 'lucide-react';

interface AgentPanelProps {
  agents: AgentStatus[];
}

const AgentPanel: React.FC<AgentPanelProps> = ({ agents }) => {
  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-xl p-4 shadow-2xl w-full">
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 px-1">智能体协同状态</h3>
      <div className="space-y-3">
        {agents.map((agent) => (
          <div key={agent.role} className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-slate-800 rounded-lg group-hover:bg-slate-700 transition-colors">
                {agent.status === 'processing' ? (
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                ) : agent.status === 'completed' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : agent.status === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate">{agent.role}</p>
                <p className="text-[10px] text-slate-500 truncate">{agent.message}</p>
              </div>
            </div>
            {agent.status === 'processing' && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentPanel;
