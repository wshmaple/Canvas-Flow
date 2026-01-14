
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
  }
];

export interface AgentStatus {
  role: AgentRole;
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
}

export interface ThinkingStep {
  id: string;
  agent: AgentRole;
  content: string;
  timestamp: number;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
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
  localChatInput?: string;
  isLocalUpdating?: boolean;
}

/**
 * 整个画布的完整持久化状态
 */
export interface CanvasProjectState {
  version: string;
  timestamp: number;
  elements: CanvasElement[];
  connections: Connection[];
  viewConfig: {
    offset: { x: number, y: number };
    scale: number;
    showGrid: boolean;
  };
}

export interface DiagramData {
  title: string;
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
  layoutRelativePosition: {
    x: number;
    y: number;
  };
}

export interface CollaborativeResponse {
  summary: string;
  diagrams: DiagramData[];
  relationships: {
    fromIndex: number;
    toIndex: number;
    label: string;
  }[];
}

// Define PaletteScheme to match the expected return type in geminiService.ts
export interface PaletteScheme {
  type: string;
  name: string;
  principle: string;
  colors: {
    hex: string;
    rgb: string;
    role: string;
  }[];
  contrastRatio: string;
  isWcagPassed: boolean;
  sceneSuggestions: string;
  usageNotes: string;
}
