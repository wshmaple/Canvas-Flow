
import { GoogleGenAI, Type } from "@google/genai";
import { CollaborativeResponse, CanvasElement, DiagramData, DiagramType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const processCollaborativeContent = async (content: string): Promise<CollaborativeResponse> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `请对以下内容进行深度拆解并建立宏观拓扑关系： "${content}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          diagrams: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
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
                    recommendedType: { type: Type.STRING },
                    reasoning: { type: Type.STRING }
                  },
                  required: ['recommendedType', 'reasoning']
                },
                generation: {
                  type: Type.OBJECT,
                  properties: {
                    mermaidCode: { type: Type.STRING }
                  },
                  required: ['mermaidCode']
                },
                layoutRelativePosition: {
                  type: Type.OBJECT,
                  properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } }
                }
              },
              required: ['title', 'parsing', 'decision', 'generation', 'layoutRelativePosition']
            }
          },
          relationships: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                fromIndex: { type: Type.INTEGER },
                toIndex: { type: Type.INTEGER },
                label: { type: Type.STRING }
              },
              required: ['fromIndex', 'toIndex', 'label']
            }
          }
        },
        required: ['summary', 'diagrams', 'relationships']
      }
    },
  });

  return JSON.parse(response.text || "{}");
};

/**
 * Smart Linking: Find logic relationship between two existing diagrams
 */
export const findRelationshipBetweenDiagrams = async (source: CanvasElement, target: CanvasElement): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `
    源图表 [${source.title}]: ${source.mermaidCode || source.content}
    目标图表 [${target.title}]: ${target.mermaidCode || target.content}
    请分析两者之间的逻辑联系，并提供一个简短的动词或短语作为连接线标签（例如: "调用", "持久化到", "解构为"）。
    请仅返回标签文本，不要包含引号。
    `
  });
  return response.text?.trim() || "关联";
};

/**
 * 多模态视觉解析：图片转图表
 * 注意：gemini-2.5-flash-image 不支持 responseMimeType 和 responseSchema
 */
export const visionToDiagram = async (base64Image: string): Promise<DiagramData> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image', 
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/png' } },
        { text: "请识别这张图片中的架构逻辑，并将其转化为一份结构严谨的 Mermaid 代码。同时给出合适的标题和推荐的图表类型。请仅以 JSON 格式返回，包含以下字段: title, decision (含 recommendedType, reasoning), generation (含 mermaidCode), parsing (含 entities), layoutRelativePosition (含 x, y)。" }
      ]
    }
  });

  const text = response.text || "{}";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (e) {
    console.error("JSON parsing failed in visionToDiagram", e);
    throw e;
  }
};

export const analyzeWorkspace = async (elements: CanvasElement[], query: string): Promise<string> => {
  const context = elements.map(el => `[图表: ${el.title}] 类型: ${el.type}\n内容: ${el.mermaidCode || el.content}`).join('\n\n');
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `工作空间背景：\n\n${context}\n\n指令/问题：${query}`,
    config: {
      systemInstruction: "你是一个资深的架构审查专家。请结合画布上所有的子模块逻辑，提供深度洞察或回答。"
    }
  });
  return response.text || "分析失败";
};

export const modifyDiagramContent = async (currentCode: string, instruction: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `当前代码：\n\`\`\`mermaid\n${currentCode}\n\`\`\`\n\n指令：${instruction}`,
    config: {
      systemInstruction: "你必须仅返回以 ```mermaid 开头和结尾的代码块。"
    }
  });
  const text = response.text || "";
  const match = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
};
