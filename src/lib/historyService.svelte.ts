import Dexie, { type Table } from 'dexie';
import type { RecipeAnalysis } from './types';

export interface HistoryEntry {
  id?: number;
  timestamp: number;
  recipeName: string;
  inputHash: string; // Hash of text + image to detect duplicates
  input: {
    text: string;
    image: string | null;
  };
  analysis: RecipeAnalysis;
}

class HistoryDatabase extends Dexie {
  history!: Table<HistoryEntry>;

  constructor() {
    super('GlycoWiseHistory');
    this.version(1).stores({
      history: '++id, inputHash, timestamp, recipeName'
    });
  }
}

const db = new HistoryDatabase();

// Simple hash function for caching
async function generateHash(text: string, image: string | null): Promise<string> {
  const data = text + (image || '');
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

class HistoryService {
  entries = $state<HistoryEntry[]>([]);

  constructor() {
    this.loadHistory();
  }

  async loadHistory() {
    this.entries = await db.history.orderBy('timestamp').reverse().toArray();
  }

  async getCachedAnalysis(text: string, image: string | null): Promise<RecipeAnalysis | null> {
    const hash = await generateHash(text, image);
    const match = await db.history.where('inputHash').equals(hash).first();
    return match ? match.analysis : null;
  }

  async saveEntry(text: string, image: string | null, analysis: RecipeAnalysis) {
    const hash = await generateHash(text, image);

    // Don't save if duplicate hash already exists (caching is handled by getCachedAnalysis)
    const existing = await db.history.where('inputHash').equals(hash).first();
    if (existing) return;

    const entry: HistoryEntry = {
      timestamp: Date.now(),
      recipeName: analysis.recipeName,
      inputHash: hash,
      input: { text, image },
      analysis
    };

    await db.history.add(entry);
    await this.loadHistory();
  }

  async deleteEntry(id: number) {
    await db.history.delete(id);
    await this.loadHistory();
  }

  async clearHistory() {
    await db.history.clear();
    this.entries = [];
  }
}

export const historyService = new HistoryService();
