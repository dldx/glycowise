
export type GroundingSource = 'USDA' | 'GI_DB' | 'ESTIMATED';

export interface IngredientAnalysis {
  name: string;
  netCarbs: number;
  protein: number;
  fat: number;
  saturatedFat?: number;
  fibre: number;
  solubleFibre?: number;
  potassium?: number;
  sodium?: number;
  gi: number;
  gl: number;
  notes: string;
  groundingSource: GroundingSource;
  citation?: string;
  matchConfidence: number;
  smokePointWarning?: string;
  hiddenSugarDetection?: string;
}

export interface SwapSuggestion {
  original: string;
  replacement: string;
  benefit: string;
}

export interface HealthMetrics {
  glycaemicLoad: number;
  macronutrientSynergy: number; // 0-10
  lipidProfileRatio: number; // Unsat:Sat
  sodiumPotassiumRatio: number; // Na:K
  solubleFibreContent: number; // grams
  ageRisk: 'low' | 'moderate' | 'high';
  pillarExplanation: string;
  // Specific requested data points
  fibreToCarbRatio: string; // e.g. "1:5"
  saturatedFatCaloriesPercent: number; // NHS/BHF recommends < 11% (or similar, keeping generic but removing AHA)
  heartHealthScore: number; // 0-100 composite
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
  healthMetrics: HealthMetrics;
  usage?: {
    totalTokens: number;
    estimatedCost: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  usage?: {
    totalTokens: number;
    estimatedCost: number;
  };
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
