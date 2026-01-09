
import { GoogleGenAI, Type, type Chat } from "@google/genai";
import type { RecipeAnalysis } from "./types";
import { dbService } from "./dbService.svelte";
import { usageService } from "./usageService.svelte";

function getAI() {
  if (typeof localStorage === 'undefined') return new GoogleGenAI({ apiKey: '' });
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  return new GoogleGenAI({ apiKey });
}

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    recipeName: { type: Type.STRING, description: "Name of the dish or recipe analysed" },
    totalGI: { type: Type.NUMBER, description: "Average Glycaemic Index of the recipe" },
    giCategory: { type: Type.STRING, description: "GI Category (Low < 55, Medium 56-69, High 70+)" },
    totalGL: { type: Type.NUMBER, description: "Estimated Glycaemic Load for a standard serving" },
    glCategory: { type: Type.STRING, description: "GL Category (Low < 10, Medium 11-19, High 20+)" },
    healthMetrics: {
      type: Type.OBJECT,
      properties: {
        glycaemicLoad: { type: Type.NUMBER },
        macronutrientSynergy: { type: Type.NUMBER, description: "Score 0-10 of how well fibre/protein/fat blunt glucose spikes" },
        lipidProfileRatio: { type: Type.NUMBER, description: "Unsaturated to Saturated fat ratio" },
        sodiumPotassiumRatio: { type: Type.NUMBER, description: "Goal is < 1.0 (More K than Na)" },
        solubleFibreContent: { type: Type.NUMBER, description: "Total grams of soluble fibre" },
        ageRisk: { type: Type.STRING, enum: ["low", "moderate", "high"], description: "Risk of Advanced Glycation End-products (AGEs) based on cooking method" },
        pillarExplanation: { type: Type.STRING, description: "Concise summary of how the recipe performs against these 5 metrics" },
        fibreToCarbRatio: { type: Type.STRING, description: "Ratio of Fibre to Total Carbs (e.g. 1:5)" },
        saturatedFatCaloriesPercent: { type: Type.NUMBER, description: "Percentage of total calories derived from saturated fat" },
        heartHealthScore: { type: Type.NUMBER, description: "Composite score 0-100 based on fibre, omega-3s, and low sodium" }
      },
      required: ["glycaemicLoad", "macronutrientSynergy", "lipidProfileRatio", "sodiumPotassiumRatio", "solubleFibreContent", "ageRisk", "pillarExplanation", "fibreToCarbRatio", "saturatedFatCaloriesPercent", "heartHealthScore"]
    },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          netCarbs: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          saturatedFat: { type: Type.NUMBER },
          fibre: { type: Type.NUMBER },
          solubleFibre: { type: Type.NUMBER },
          potassium: { type: Type.NUMBER },
          sodium: { type: Type.NUMBER },
          gi: { type: Type.NUMBER },
          gl: { type: Type.NUMBER },
          smokePointWarning: { type: Type.STRING, description: "Warning if cooking temperature exceeds fat's stability" },
          hiddenSugarDetection: { type: Type.STRING, description: "Identified non-obvious sweeteners found in this ingredient" },
          notes: { type: Type.STRING },
          groundingSource: { type: Type.STRING, enum: ["USDA", "GI_DB", "ESTIMATED"] },
          citation: { type: Type.STRING, description: "Reference value from databases if available" },
          matchConfidence: { type: Type.NUMBER }
        },
        required: ["name", "netCarbs", "protein", "fat", "fibre", "gi", "gl", "groundingSource"]
      }
    },
    methodImpact: { type: Type.STRING, description: "How cooking affects GI and AGE risk" },
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
    summary: { type: Type.STRING, description: "Overall metabolic health impact assessment" }
  },
  required: ["recipeName", "totalGI", "giCategory", "totalGL", "glCategory", "healthMetrics", "ingredients", "methodImpact", "swaps", "summary"]
};

export async function analyseRecipe(
  input: string,
  imageData?: string
): Promise<RecipeAnalysis> {
  const model = "gemini-3-flash-preview";

  const groundingData = dbService.getRelevantContext(input);

  const prompt = `
    Act as a world-class endocrinologist and clinical dietitian (UK/EU focused).
    Analyse the following recipe or food image using these Five Scientific Pillars, ensuring all analysis is tailored for a UK/EU audience:
    1. Glycaemic Load (Precision GL based on database values)
    2. Macronutrient Synergy (How protein, fat, and fibre blunt glucose absorption)
    3. Lipid Profile Ratios (Unsaturated vs. Saturated fats for cardiovascular health)
    4. Soluble Fibre (Critical for gut microbiome and post-prandial stability)
    5. Sodium-to-Potassium Balance (Goal Na:K < 1.0 for blood pressure)

    USER INPUT: ${input}

    GROUNDING DATA (Use these for accuracy):
    ${groundingData}

    SPECIFIC INSTRUCTIONS:
    - LANGUAGE & UNITS: Use UK English (e.g., 'fibre', 'colour') and METRIC units exclusively (grams, ml, kg).
    - TEMPERATURE: Use CELSIUS for all temperature references.
    - For EVERY ingredient, look for a match in the GROUNDING DATA.
    - If a match is found in the USDA data, extract protein, fat, fibre, potassium, and sodium.
    - If a match is found in the GI Database, extract GI/GL.
    - HIDDEN SUGAR: Look for 50+ alternative names for sugar in processed ingredients (e.g. maltodextrin, syrups, agave) and flag them in the summary/notes.
    - SMOKE POINTS: If the cooking method involves heating fats, warn if the fat used (e.g. flax, EVOO) is likely to exceed its smoke point (in Celsius).
    - Calculate 'macronutrientSynergy' from 0-10 based on the presence of blunting factors (Fibre/Protein/Fat).
    - Assess 'ageRisk' (Advanced Glycation End-products) based on cooking methods like frying/grilling vs steaming.
    - Provide deep clinical insights in the 'pillarExplanation' using UK clinical terminology (NHS-aligned).
    - Calculate the specific 'fibreToCarbRatio' and 'saturatedFatCaloriesPercent' accurately.
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

  const analysis = JSON.parse(response.text) as RecipeAnalysis;

  if (response.usageMetadata) {
    analysis.usage = usageService.recordUsage(
      response.usageMetadata.promptTokenCount || 0,
      response.usageMetadata.candidatesTokenCount || 0
    );
  }

  return analysis;
}

export function startRecipeChat(analysis: RecipeAnalysis): Chat {
  return getAI().chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `Act as a clinical dietitian. You are discussing the following recipe analysis for a UK/EU audience:
        Analysis Results: ${JSON.stringify(analysis)}

        The user will ask follow-up questions about this specific dish, its ingredients, and blood sugar management.
        Be concise, evidence-based, and encouraging. Use UK English spelling and Metric units. If they ask about something unrelated to nutrition or the dish,
        politely guide them back to their glycaemic health goals.`,
    },
  }) as unknown as Chat;
}
