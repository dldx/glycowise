import { browser } from '$app/environment';

class UsageService {
  totalCost = $state(0);
  totalTokens = $state(0);

  constructor() {
    if (browser) {
      const saved = localStorage.getItem('glycowise_usage');
      if (saved) {
        const data = JSON.parse(saved);
        this.totalCost = data.totalCost || 0;
        this.totalTokens = data.totalTokens || 0;
      }
    }
  }

  recordUsage(inputTokens: number, outputTokens: number) {
    // Gemini 3.0 Flash Pricing
    // $0.5 / 1M input tokens
    // $3.0 / 1M output tokens
    const inputCost = (inputTokens / 1_000_000) * 0.5;
    const outputCost = (outputTokens / 1_000_000) * 3.0;
    const cost = inputCost + outputCost;

    this.totalCost += cost;
    this.totalTokens += (inputTokens + outputTokens);

    if (browser) {
      localStorage.setItem('glycowise_usage', JSON.stringify({
        totalCost: this.totalCost,
        totalTokens: this.totalTokens
      }));
    }

    return { totalTokens: inputTokens + outputTokens, estimatedCost: cost };
  }

  reset() {
    this.totalCost = 0;
    this.totalTokens = 0;
    if (browser) {
      localStorage.removeItem('glycowise_usage');
    }
  }
}

export const usageService = new UsageService();
