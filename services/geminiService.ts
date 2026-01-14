
import { GoogleGenAI, Type } from "@google/genai";
import { CollaborativeResponse, PaletteScheme, CanvasElement, DiagramData, DiagramType } from "../types";

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
                fromIndex: { type: Type.INTEGER, description: "源图表在 diagrams 数组中的索引" },
                toIndex: { type: Type.INTEGER, description: "目标图表在 diagrams 数组中的索引" },
                label: { type: Type.STRING, description: "描述连接逻辑的简短标签" }
              },
              required: ['fromIndex', 'toIndex', 'label']
            }
          }
        },
        required: ['summary', 'diagrams', 'relationships']
      },
      systemInstruction: `作为多智能体图表架构专家：
      1. 分析全文逻辑阶段。
      2. 生成 Mermaid 代码。
      3. 关键：建立模块间的逻辑连线（relationships），描述流程如何在不同图表间流转。`
    },
  });

  const text = response.text;
  if (!text) throw new Error("AI 未返回内容");
  return JSON.parse(text);
};

export const drillDownElement = async (parent: CanvasElement, entity: string): Promise<DiagramData> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `父级图表：[${parent.title}] (类型: ${parent.type})。
    你需要对该图表中的子组件「${entity}」进行深度下钻拆解。
    请生成一个更详尽的、专门描述「${entity}」内部逻辑或结构的 Mermaid 图表。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
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
    }
  });

  const text = response.text;
  if (!text) throw new Error("下钻生成失败");
  return JSON.parse(text);
};

export const handleGlobalAction = async (elements: CanvasElement[], instruction: string): Promise<any> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `当前画布包含以下图表信息：${JSON.stringify(elements.map(el => ({ id: el.id, title: el.title, type: el.type })))}。
    用户的全局指令是："${instruction}"。
    请分析指令并返回对应的操作序列。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING, description: "对用户的友好回复" },
          actions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: "UPDATE_CODE, DELETE, MOVE_RELATIVELY" },
                targetId: { type: Type.STRING },
                payload: { type: Type.OBJECT, description: "如 { code: '...' } 或 { dx: 100, dy: 100 }" }
              },
              required: ['type', 'targetId', 'payload']
            }
          }
        },
        required: ['reply', 'actions']
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("全局操作失败");
  return JSON.parse(text);
};

export const generateProfessionalPalette = async (baseColor: string): Promise<PaletteScheme[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `配色专家：基于 "${baseColor}" 生成 6 类方案。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            name: { type: Type.STRING },
            principle: { type: Type.STRING },
            colors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { hex: { type: Type.STRING }, rgb: { type: Type.STRING }, role: { type: Type.STRING } }
              }
            },
            contrastRatio: { type: Type.STRING },
            isWcagPassed: { type: Type.BOOLEAN },
            sceneSuggestions: { type: Type.STRING },
            usageNotes: { type: Type.STRING }
          }
        }
      }
    }
  });
  
  const text = response.text;
  if (!text) throw new Error("配色方案生成失败");
  return JSON.parse(text);
};

export const modifyDiagramContent = async (currentCode: string, instruction: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `当前代码：\n\`\`\`mermaid\n${currentCode}\n\`\`\`\n\n修改指令：${instruction}\n\n请严格仅返回修改后的 Mermaid 代码块。`,
    config: {
      systemInstruction: "你是一个专业的 Mermaid 代码专家。在处理修改指令时，你必须且仅能输出以 \`\`\`mermaid 开头并以 \`\`\` 结尾的代码块。严禁包含任何前导文本、后缀说明或解释性文字。如果用户要求进行分析，请将其结果体现为图表中的注释或节点，而不是外部文本。"
    }
  });
  
  const text = response.text;
  if (!text) throw new Error("图表修改失败");
  
  // Robustly extract content inside the first available code block
  const codeBlockRegex = /```(?:mermaid)?\s*([\s\S]*?)```/;
  const match = text.match(codeBlockRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Fallback: cleaning simple markers if regex failed but markers exist
  return text.replace(/```mermaid/g, '').replace(/```/g, '').trim();
};
