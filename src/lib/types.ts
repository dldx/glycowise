
export interface IngredientAnalysis {
  name: string;
  gi: number;
  gl: number;
  notes: string;
  citation?: string;
}

export interface SwapSuggestion {
  original: string;
  replacement: string;
  benefit: string;
}

export interface RecipeAnalysis {
  recipeName: string;
  totalGI: number;
  giCategory: 'Low' | 'Medium' | 'High';
  totalGL: number;
  glCategory: 'Low' | 'Medium' | 'High';
  ingredients: IngredientAnalysis[];
  methodImpact: string;
  swaps: SwapSuggestion[];
  summary: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface GIData {
  "Food Name": string;
  "GI": number;
  "Food Manufacturer": string;
  "Product Category": string;
  "Country of food production": string;
  "Serving Size (g)": number;
  "Carbohydrate portion (g) or Average Carbohydrate portion (g)": number;
  "GL": number;
}
