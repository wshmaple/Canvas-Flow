
import { GoogleGenAI, Type } from "@google/genai";
import { DeconstructionPlan, CategoryNode, DiagramType, CanvasElement } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * 分类智能体：执行逻辑解构
 */
export const classifyContentAgent = async (content: string, customHierarchy?: string): Promise<DeconstructionPlan> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `
    请对以下内容进行深度解构。
    目标：确定分类层级并建立树状结构。
    
    用户内容："${content}"
    ${customHierarchy ? `用户指定的层级规则：${customHierarchy}` : '请根据语义自动确定最佳层级。'}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          projectName: { type: Type.STRING },
          hierarchy: { type: Type.ARRAY, items: { type: Type.STRING } },
          nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                level: { type: Type.INTEGER },
                description: { type: Type.STRING },
                suggestedType: { type: Type.STRING, description: 'flowchart, sequenceDiagram, gantt, mindmap 之一' }
              },
              required: ['title', 'level', 'description', 'suggestedType']
            }
          }
        },
        required: ['projectName', 'hierarchy', 'nodes']
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

/**
 * 绘图智能体
 */
export const generateDiagramAgent = async (node: CategoryNode, context: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `
    请为 [${node.title}] 生成 Mermaid 代码。
    描述：${node.description}
    类型：${node.suggestedType}
    上下文背景：${context}
    
    规则：仅输出以 \`\`\`mermaid 开头的代码块。
    `
  });
  const text = response.text || "";
  const match = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
};

/**
 * 视觉解构智能体
 */
export const visionToDiagram = async (base64Image: string): Promise<any> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image', 
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/png' } },
        { text: "识别此图片中的架构逻辑并转化为 Mermaid 代码。请以 JSON 格式返回，包含 title, suggestedType, mermaidCode 字段。" }
      ]
    }
  });
  const text = response.text || "{}";
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
};

/**
 * 架构审计智能体
 */
export const analyzeWorkspace = async (elements: CanvasElement[], query: string): Promise<string> => {
  const context = elements.map(el => `[图表: ${el.title}] 内容: ${el.mermaidCode || el.content}`).join('\n\n');
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `工作空间背景：\n${context}\n\n指令：${query}`,
    config: {
      systemInstruction: "你是一个资深的架构审查专家。"
    }
  });
  return response.text || "分析失败";
};

export const modifyDiagramContent = async (currentCode: string, instruction: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `当前代码：\n\`\`\`mermaid\n${currentCode}\n\`\`\`\n\n指令：${instruction}`
  });
  const text = response.text || "";
  const match = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
};

export const findRelationshipBetweenDiagrams = async (source: CanvasElement, target: CanvasElement): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `分析 [${source.title}] -> [${target.title}] 的联系标签，仅返回短词。`
  });
  return response.text?.trim().slice(0, 10) || "关联";
};
