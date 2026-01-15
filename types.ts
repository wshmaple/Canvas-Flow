
export enum AgentRole {
  SCHEDULER = '协同调度智能体',
  CLASSIFIER = '分类层级智能体',
  TITLER = '标题样式智能体',
  GENERATOR = '绘图执行智能体',
  REVIEWER = '架构审计智能体',
  INTERACTION_FEEDBACK = '交互反馈智能体'
}

export interface AgentStatus {
  role: AgentRole;
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
}

export enum DiagramType {
  FLOWCHART = 'flowchart',
  SEQUENCE = 'sequenceDiagram',
  GANTT = 'gantt',
  MINDMAP = 'mindmap',
  NOTE = 'note'
}

export interface PlanNode extends CategoryNode {
  selected: boolean;
  id: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  agent?: AgentRole;
  content: string;
  timestamp: number;
  type?: 'text' | 'plan';
  plan?: PlanNode[];
}

export interface ThinkingStep {
  id: string;
  agent: AgentRole;
  content: string;
  timestamp: number;
}

export interface CategoryNode {
  title: string;
  level: number;
  description: string;
  suggestedType: DiagramType;
  subCategories?: CategoryNode[];
}

export interface DeconstructionPlan {
  projectName: string;
  hierarchy: string[];
  nodes: CategoryNode[];
}

export interface CanvasElement {
  id: string;
  type: DiagramType;
  mermaidCode: string;
  x: number;
  y: number;
  scale: number;
  title: string;
  level: number;
  deconstructedElements: string[];
  themeId: string;
  localChatInput?: string;
  isLocalUpdating?: boolean;
  content?: string;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
}

export const THEMES = [
  {
    id: 'indigo-cyber',
    name: '赛博极光',
    primary: '#6366f1',
    mermaidVars: { primaryColor: '#6366f1', lineColor: '#818cf8' }
  }
];
