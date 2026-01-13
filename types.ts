
export enum AgentRole {
  SCHEDULER = '协同调度智能体',
  CONTENT_PARSER = '内容解析智能体',
  DIAGRAM_DECISION = '图表决策智能体',
  DIAGRAM_GENERATOR = '图表生成智能体',
  CANVAS_LAYOUT = '画布布局智能体',
  INTERACTION_FEEDBACK = '交互反馈智能体'
}

export enum DiagramType {
  FLOWCHART = 'flowchart',
  SEQUENCE = 'sequenceDiagram',
  GANTT = 'gantt',
  MINDMAP = 'mindmap'
}

export interface ElementTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  bg: string;
  border: string;
  text: string;
  mermaidVars: any;
}

export const THEMES: ElementTheme[] = [
  {
    id: 'indigo-cyber',
    name: '赛博极光',
    primary: '#6366f1',
    secondary: '#818cf8',
    bg: 'bg-slate-900',
    border: 'border-indigo-500/50',
    text: 'text-indigo-400',
    mermaidVars: {
      primaryColor: '#6366f1',
      primaryTextColor: '#fff',
      primaryBorderColor: '#818cf8',
      lineColor: '#818cf8',
      secondaryColor: '#1e1b4b',
      tertiaryColor: '#0f172a'
    }
  },
  {
    id: 'emerald-matrix',
    name: '黑客矩阵',
    primary: '#10b981',
    secondary: '#34d399',
    bg: 'bg-zinc-950',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
    mermaidVars: {
      primaryColor: '#064e3b',
      primaryTextColor: '#34d399',
      primaryBorderColor: '#10b981',
      lineColor: '#10b981',
      secondaryColor: '#022c22',
      tertiaryColor: '#064e3b'
    }
  },
  {
    id: 'crimson-fury',
    name: '赤红风暴',
    primary: '#ef4444',
    secondary: '#f87171',
    bg: 'bg-stone-950',
    border: 'border-red-500/40',
    text: 'text-red-400',
    mermaidVars: {
      primaryColor: '#450a0a',
      primaryTextColor: '#f87171',
      primaryBorderColor: '#ef4444',
      lineColor: '#ef4444',
      secondaryColor: '#2d0606',
      tertiaryColor: '#450a0a'
    }
  },
  {
    id: 'amber-luxury',
    name: '琥珀流金',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    bg: 'bg-neutral-950',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
    mermaidVars: {
      primaryColor: '#451a03',
      primaryTextColor: '#fbbf24',
      primaryBorderColor: '#f59e0b',
      lineColor: '#f59e0b',
      secondaryColor: '#2d0f02',
      tertiaryColor: '#451a03'
    }
  },
  {
    id: 'pastel-dream',
    name: '粉甜梦境',
    primary: '#f472b6',
    secondary: '#fb923c',
    bg: 'bg-gray-900',
    border: 'border-pink-500/40',
    text: 'text-pink-400',
    mermaidVars: {
      primaryColor: '#500724',
      primaryTextColor: '#fbcfe8',
      primaryBorderColor: '#f472b6',
      lineColor: '#f472b6',
      secondaryColor: '#4c0519',
      tertiaryColor: '#500724'
    }
  }
];

export interface AgentStatus {
  role: AgentRole;
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
}

export interface CanvasElement {
  id: string;
  type: DiagramType;
  mermaidCode: string;
  x: number;
  y: number;
  scale: number;
  title: string;
  deconstructedElements: string[];
  isEditing?: boolean;
  parentId?: string;
  themeId: string;
}

export interface CollaborativeResponse {
  parsing: {
    entities: string[];
    relations: string[];
  };
  decision: {
    recommendedType: DiagramType;
    reasoning: string;
  };
  generation: {
    mermaidCode: string;
  };
  layout: {
    suggestedPosition: { x: number; y: number };
  };
}
