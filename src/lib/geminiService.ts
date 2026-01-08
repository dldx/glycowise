
import { GoogleGenAI, Type, type Chat } from "@google/genai";
import type { RecipeAnalysis, GIData } from "./types";
import Papa from 'papaparse';
import Fuse from 'fuse.js';

function getAI() {
  if (typeof localStorage === 'undefined') return new GoogleGenAI({ apiKey: '' });
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  return new GoogleGenAI({ apiKey });
}

let cachedGIData: GIData[] = [];
let fuseInstance: Fuse<GIData> | null = null;

async function loadGIData() {
  if (cachedGIData.length > 0) return;

  try {
    console.log("Fetching GI Database...");
    const response = await fetch('/gi_data.csv');
    const csvText = await response.text();
    console.log("GI Data CSV fetched (size: " + csvText.length + " bytes), parsing...");

    return new Promise<void>((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          cachedGIData = results.data as GIData[];
          console.log(`Successfully indexed ${cachedGIData.length} entries for fuzzy search.`);
          fuseInstance = new Fuse(cachedGIData, {
            keys: ['Food Name', 'Product Category'],
            threshold: 0.4,
            distance: 100,
          });
          resolve();
        },
        error: (error: any) => {
          console.error("CSV Parsing Error:", error);
          reject(error);
        }
      });
    });
  } catch (err) {
    console.error("Failed to load GI data from /gi_data.csv:", err);
  }
}

async function getRelevantContext(input: string): Promise<string> {
  await loadGIData();
  if (!fuseInstance) return "";

  const results = fuseInstance.search(input, { limit: 15 });
  if (results.length === 0) return "";

  const contextData = results.map(r => {
    const item = r.item;
    return `- ${item['Food Name']}: GI=${item.GI}, GL=${item.GL} (${item['Product Category']})`;
  }).join('\n');
  console.log("Relevant GI Data Found:\n", contextData);

  return `\nRELEVANT GI DATABASE ENTRIES (Use these as reference for accurate analysis):\n${contextData}\n`;
}

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    recipeName: { type: Type.STRING, description: "Name of the dish or recipe analyzed" },
    totalGI: { type: Type.NUMBER, description: "Average Glycemic Index of the recipe" },
    giCategory: { type: Type.STRING, description: "GI Category (Low < 55, Medium 56-69, High 70+)" },
    totalGL: { type: Type.NUMBER, description: "Estimated Glycemic Load for a standard serving" },
    glCategory: { type: Type.STRING, description: "GL Category (Low < 10, Medium 11-19, High 20+)" },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          gi: { type: Type.NUMBER },
          gl: { type: Type.NUMBER },
          notes: { type: Type.STRING },
          citation: { type: Type.STRING, description: "Exact 'Food Name' from the provided RELEVANT GI DATABASE entries if it directly matches an ingredient. Omit this field OR set to empty string if no direct database match is found." }
        },
        required: ["name", "gi", "gl", "notes"]
      }
    },
    methodImpact: { type: Type.STRING, description: "How the cooking method (boiling, frying, etc.) affects the GI/GL" },
    swaps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          original: { type: Type.STRING },
          replacement: { type: Type.STRING },
          benefit: { type: Type.STRING }
        },
        required: ["original", "replacement", "benefit"]
      }
    },
    summary: { type: Type.STRING, description: "Overall nutritional advice regarding blood sugar management" }
  },
  required: ["recipeName", "totalGI", "giCategory", "totalGL", "glCategory", "ingredients", "methodImpact", "swaps", "summary"]
};

export async function analyzeRecipe(
  input: string,
  imageData?: string
): Promise<RecipeAnalysis> {
  const model = "gemini-3-flash-preview";

  const relevantGI = await getRelevantContext(input);

  const prompt = `
    Act as a clinical nutritionist and dietitian expert in glycemic indexing.
    Analyze the following recipe or food image for its Glycemic Index (GI) and Glycemic Load (GL).

    User Input: ${input}
    ${relevantGI}

    Tasks:
    1. Estimate the GI and GL for each ingredient and the overall dish. Use the provided database entries if they match.
    2. IMPORTANT: If you use a value from the "RELEVANT GI DATABASE ENTRIES" section, you MUST populate the "citation" field for that ingredient with the exact "Food Name" from the database.
    3. Explain how the preparation method (e.g., overcooking pasta, blending fruit) alters the GI.
    4. Suggest lower-GI swaps for high-GI ingredients.
    4. Provide a summary of the dish's impact on blood glucose.

    If an image is provided, identify the dish and its likely ingredients first.
  `;

  const contents: any = imageData
    ? { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imageData.split(',')[1] } }] }
    : prompt;

  const response = await getAI().models.generateContent({
    model,
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: analysisSchema as any,
    },
  });

  if (!response.text) {
    throw new Error("Empty response from AI");
  }

  return JSON.parse(response.text) as RecipeAnalysis;
}

export function startRecipeChat(analysis: RecipeAnalysis): Chat {
  return getAI().chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `Act as a clinical nutritionist. You are discussing the following recipe analysis:
        Analysis Results: ${JSON.stringify(analysis)}

        The user will ask follow-up questions about this specific dish, its ingredients, and blood sugar management.
        Be concise, evidence-based, and encouraging. If they ask about something unrelated to nutrition or the dish,
        politely guide them back to their glycemic health goals.`,
    },
  }) as unknown as Chat;
}
