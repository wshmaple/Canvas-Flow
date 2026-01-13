
import { GoogleGenAI, Type } from "@google/genai";
import { CollaborativeResponse, DiagramType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export const processCollaborativeContent = async (content: string): Promise<CollaborativeResponse> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `请作为多智能体协同系统（调度、解析、决策、生成、布局）处理以下输入并生成图表： "${content}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          parsing: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.ARRAY, items: { type: Type.STRING } },
              relations: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['entities', 'relations']
          },
          decision: {
            type: Type.OBJECT,
            properties: {
              recommendedType: { type: Type.STRING, description: '必须是以下之一: flowchart, sequenceDiagram, gantt, mindmap' },
              reasoning: { type: Type.STRING }
            },
            required: ['recommendedType', 'reasoning']
          },
          generation: {
            type: Type.OBJECT,
            properties: {
              mermaidCode: { type: Type.STRING, description: '符合 Mermaid.js 语法的代码字符串' }
            },
            required: ['mermaidCode']
          },
          layout: {
            type: Type.OBJECT,
            properties: {
              suggestedPosition: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER }
                }
              }
            }
          }
        },
        required: ['parsing', 'decision', 'generation', 'layout']
      },
      systemInstruction: `你是一个多智能体协同系统。请以中文输出并执行以下角色：
1. 内容解析智能体：提取核心逻辑实体和关系。
2. 图表决策智能体：根据逻辑复杂度选择最适合的图表类型（流程图、时序图、甘特图或思维导图）。
3. 图表生成智能体：编写高质量的 Mermaid 代码。
4. 画布布局智能体：建议坐标。
5. 协同调度智能体：协调所有任务。
注意：Mermaid 代码中如果包含中文，请确保语法正确（例如使用引号包围节点文本）。`
    },
  });

  const text = response.text;
  if (!text) throw new Error("AI 未返回内容");
  
  try {
    return JSON.parse(text) as CollaborativeResponse;
  } catch (e) {
    console.error("解析智能体响应失败", text);
    throw new Error("智能体响应格式无效");
  }
};
