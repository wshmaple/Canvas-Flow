
import { GoogleGenAI, Type } from "@google/genai";
import { CollaborativeResponse, PaletteScheme } from "../types";

// Always use named parameter for initialization and process.env.API_KEY directly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const processCollaborativeContent = async (content: string): Promise<CollaborativeResponse> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `请对以下长文本进行深度拆解，并将其转化为一系列逻辑连贯的图表： "${content}"`,
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
                  properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER }
                  }
                }
              },
              required: ['title', 'parsing', 'decision', 'generation', 'layoutRelativePosition']
            }
          }
        },
        required: ['summary', 'diagrams']
      }
    },
  });

  // response.text is a property, not a method.
  const text = response.text;
  if (!text) throw new Error("AI 未返回内容");
  return JSON.parse(text);
};

export const generateProfessionalPalette = async (baseColor: string): Promise<PaletteScheme[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `请作为专业配色专家，基于输入颜色 "${baseColor}" 生成 6 类专业配色方案（单色、互补、邻近、三分、四分、中性）。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, description: "单色, 互补色, 邻近色, 三分色, 四分色, 中性色" },
            name: { type: Type.STRING },
            principle: { type: Type.STRING },
            colors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  hex: { type: Type.STRING },
                  rgb: { type: Type.STRING },
                  role: { type: Type.STRING }
                },
                required: ['hex', 'rgb', 'role']
              }
            },
            contrastRatio: { type: Type.STRING },
            isWcagPassed: { type: Type.BOOLEAN },
            sceneSuggestions: { type: Type.STRING },
            usageNotes: { type: Type.STRING }
          },
          required: ['type', 'name', 'principle', 'colors', 'contrastRatio', 'isWcagPassed', 'sceneSuggestions', 'usageNotes']
        }
      },
      systemInstruction: `你是一个融合了色彩心理学和计算美学的配色专家。
      1. 接收输入颜色（#HEX, RGB 或颜色名）。
      2. 基于 HSV 空间精确计算。
      3. 确保 WCAG 2.1 AA 标准（对比度 >= 4.5:1）。
      4. 为每套方案提供中文解释、场景建议（UI、品牌、海报等）。
      5. 输出必须为严谨的 JSON。`
    }
  });

  const text = response.text;
  if (!text) throw new Error("配色生成失败");
  return JSON.parse(text);
};

export const modifyDiagramContent = async (currentCode: string, instruction: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `当前图表代码是：\n\`\`\`mermaid\n${currentCode}\n\`\`\`\n用户的修改指令是："${instruction}"\n请根据指令更新图表代码并仅返回更新后的 Mermaid 代码。`,
  });
  const text = response.text;
  if (!text) throw new Error("AI 修改失败");
  // Basic cleanup to remove markdown code blocks if the model included them.
  return text.replace(/```mermaid/g, '').replace(/```/g, '').trim();
};
