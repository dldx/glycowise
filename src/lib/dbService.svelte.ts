import { asset } from '$app/paths';
import Papa from 'papaparse';
import Fuse from 'fuse.js';
import type { GIData } from './types';

export interface USDAFood {
  description: string;
  foodNutrients: {
    nutrient: { name: string; unitName: string };
    amount: number;
  }[];
}

class DBService {
  giData = $state<GIData[]>([]);
  usdaData = $state<USDAFood[]>([]);
  giFuse = $state<Fuse<GIData> | null>(null);
  usdaFuse = $state<Fuse<USDAFood> | null>(null);
  progress = $state(0);
  isLoaded = $state(false);
  loadingStatus = $state('');

  async loadDatabases() {
    if (this.isLoaded) return;

    try {
      this.loadingStatus = 'Fetching Glycemic Index database...';
      const giCsvText = await this.fetchWithProgress(asset('/gi_data.csv'), 0, 30);

      this.loadingStatus = 'Parsing GI data...';
      this.giData = await this.parseGI(giCsvText);
      this.giFuse = new Fuse(this.giData, {
        keys: ['Food Name', 'Product Category'],
        threshold: 0.4,
      });
      this.progress = 40;

      this.loadingStatus = 'Fetching USDA Foundation database...';
      // USDA JSON is much larger, giving it more weight
      const usdaJsonText = await this.fetchWithProgress(asset('/FoodData_Central_foundation_food_json_2025-12-18.json'), 40, 90);

      this.loadingStatus = 'Parsing USDA data...';
      const parsedUsda = JSON.parse(usdaJsonText);
      this.usdaData = parsedUsda.FoundationFoods;
      this.usdaFuse = new Fuse(this.usdaData, {
        keys: ['description'],
        threshold: 0.4,
      });

      this.progress = 100;
      this.isLoaded = true;
      this.loadingStatus = 'Databases ready';
    } catch (err: any) {
      console.error('Database loading failed:', err);
      this.loadingStatus = 'Error loading databases';
    }
  }

  private async fetchWithProgress(url: string, startProgress: number, endProgress: number): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const contentLength = +(response.headers.get('Content-Length') || 0);
    if (contentLength === 0) {
      // Fallback if no content-length
      const text = await response.text();
      this.progress = endProgress;
      return text;
    }

    const reader = response.body?.getReader();
    if (!reader) return await response.text();

    let receivedLength = 0;
    const chunks = [];

    while(true) {
      const {done, value} = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;

      const stepProgress = (receivedLength / contentLength) * (endProgress - startProgress);
      this.progress = Math.round(startProgress + stepProgress);
    }

    const allChunks = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    return new TextDecoder("utf-8").decode(allChunks);
  }

  private parseGI(csvText: string): Promise<GIData[]> {
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data as GIData[])
      });
    });
  }

  getRelevantContext(input: string): string {
    if (!this.giFuse || !this.usdaFuse) return "";

    const giResults = this.giFuse.search(input, { limit: 12 });
    const usdaResults = this.usdaFuse.search(input, { limit: 12 });

    let context = "";

    if (giResults.length > 0) {
      context += "\n# RELEVANT GLYCEMIC INDEX DATA:\n";
      giResults.forEach(r => {
        const item = r.item;
        context += `- ${item['Food Name']}: GI=${item.GI}, GL=${item.GL} (${item['Product Category']})\n`;
      });
    }

    if (usdaResults.length > 0) {
      context += "\n# RELEVANT USDA NUTRITIONAL DATA (per 100g):\n";
      usdaResults.forEach(r => {
        const item = r.item;
        // Extract key focus nutrients for the 5 pillars
        const relevantNutrients = item.foodNutrients
          .filter(n => {
            const name = n.nutrient.name.toLowerCase();
              return name.includes('protein') ||
                  name.includes('total lipid') ||
                  name.includes('saturated') ||
                  name.includes('fiber') ||
                  name.includes('sodium') ||
                   name.includes('potassium');
          })
          .map(n => `${n.nutrient.name}: ${n.amount}${n.nutrient.unitName}`)
          .join(', ');

        context += `- ${item.description}: ${relevantNutrients}\n`;
      });
    }

    return context;
  }
}

export const dbService = new DBService();
