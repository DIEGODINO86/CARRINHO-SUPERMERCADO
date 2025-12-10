import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ScannedItem } from "../types";

const apiKey = process.env.API_KEY || '';

// Initialize the client
const ai = new GoogleGenAI({ apiKey });

// Define the expected JSON schema for the model output
const productSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    productName: {
      type: Type.STRING,
      description: "O nome conciso do produto de supermercado visível na imagem (em português)."
    },
    price: {
      type: Type.NUMBER,
      description: "O preço do produto se visível. Se não estiver visível, estime um preço de mercado realista em Reais (BRL)."
    },
    category: {
      type: Type.STRING,
      description: "Uma categoria geral simples para agrupar produtos similares (ex: 'creme_dental', 'arroz', 'refrigerante', 'sabonete'). Use snake_case."
    },
    measureValue: {
      type: Type.NUMBER,
      description: "O valor numérico do peso ou volume da embalagem (ex: se for 90g, retorne 90). Se não visível, estime."
    },
    measureUnit: {
      type: Type.STRING,
      description: "A unidade de medida (use apenas: 'g', 'kg', 'ml', 'l', 'un'). Converta se necessário."
    }
  },
  required: ["productName", "price", "category"]
};

// Schema for Shopping List Extraction
const shoppingListSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.STRING
  }
};

/**
 * helper to convert file to base64
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const analyzeProductImage = async (file: File): Promise<ScannedItem> => {
  if (!apiKey) {
    throw new Error("API Key está faltando.");
  }

  const base64Data = await fileToBase64(file);
  const mimeType = file.type;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: "Analise esta imagem/documento. Identifique o produto, preço, e muito importante: o peso/volume da embalagem para cálculo de custo-benefício. Se houver vários itens iguais de marcas diferentes, escolha o mais legível. Categorize o produto."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: productSchema,
        systemInstruction: "Você é um assistente de supermercado brasileiro focado em economia. Identifique produtos, preços e TAMANHOS DE EMBALAGEM (peso/volume) com precisão. Responda em JSON."
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Não foi possível obter resposta da IA.");
    }

    const data = JSON.parse(text) as ScannedItem;
    return data;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Falha ao analisar o arquivo. Tente novamente.");
  }
};

export const extractShoppingList = async (file: File): Promise<string[]> => {
  if (!apiKey) throw new Error("API Key faltando");

  const base64Data = await fileToBase64(file);
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: file.type, data: base64Data } },
          { text: "Leia esta imagem (que pode ser uma lista manuscrita, nota fiscal antiga ou planilha) e extraia APENAS os nomes dos produtos para criar uma lista de compras. Retorne um array de strings simples." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: shoppingListSchema,
        systemInstruction: "Extraia uma lista de itens de compras. Ignore preços e quantidades, retorne apenas os nomes dos itens (ex: ['Arroz', 'Feijão', 'Leite'])."
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as string[];
  } catch (error) {
    console.error("List Extraction Error:", error);
    throw new Error("Falha ao ler a lista de compras.");
  }
};