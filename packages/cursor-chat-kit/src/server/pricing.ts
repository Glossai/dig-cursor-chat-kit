// Static pricing table + cost resolver. Pure. No I/O, no project deps.
// Provider-reported cost always wins; static table is the fallback for known
// models; otherwise cost is marked `unavailable` and the consumer decides
// whether to render or hide it.

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

type Rates = Omit<TokenUsage, "totalTokens">;

export const PRICING_VERSION = "2026-06-12";

// USD micros per one million tokens.
const STATIC_RATES: Record<string, Rates> = {
  "claude-4-sonnet": {
    inputTokens: 3_000_000,
    outputTokens: 15_000_000,
    cacheReadTokens: 300_000,
    cacheWriteTokens: 3_750_000,
  },
  "claude-4-sonnet-thinking": {
    inputTokens: 3_000_000,
    outputTokens: 15_000_000,
    cacheReadTokens: 300_000,
    cacheWriteTokens: 3_750_000,
  },
  "gemini-2.5-pro": {
    inputTokens: 1_250_000,
    outputTokens: 10_000_000,
    cacheReadTokens: 310_000,
    cacheWriteTokens: 1_250_000,
  },
  "gpt-4.1": {
    inputTokens: 2_000_000,
    outputTokens: 8_000_000,
    cacheReadTokens: 500_000,
    cacheWriteTokens: 2_000_000,
  },
};

export type CostResolution = {
  inputCostMicros: number | null;
  outputCostMicros: number | null;
  cacheReadCostMicros: number | null;
  cacheWriteCostMicros: number | null;
  totalCostMicros: number | null;
  source: "provider" | "static_table" | "unavailable";
  pricingVersion: string | null;
  providerCost: Record<string, unknown> | null;
};

const integer = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

export function resolveRunCost(
  modelId: string | null,
  usage: TokenUsage,
  provider: unknown,
): CostResolution {
  if (provider && typeof provider === "object") {
    const record = provider as Record<string, unknown>;
    const totalMicros =
      integer(record.totalCostMicros) ??
      (typeof record.totalCostUsd === "number"
        ? Math.round(record.totalCostUsd * 1_000_000)
        : null);
    if (totalMicros !== null) {
      return {
        inputCostMicros: integer(record.inputCostMicros),
        outputCostMicros: integer(record.outputCostMicros),
        cacheReadCostMicros: integer(record.cacheReadCostMicros),
        cacheWriteCostMicros: integer(record.cacheWriteCostMicros),
        totalCostMicros: totalMicros,
        source: "provider",
        pricingVersion: null,
        providerCost: record,
      };
    }
  }

  const rates = modelId ? STATIC_RATES[modelId] : undefined;
  if (!rates)
    return {
      inputCostMicros: null,
      outputCostMicros: null,
      cacheReadCostMicros: null,
      cacheWriteCostMicros: null,
      totalCostMicros: null,
      source: "unavailable",
      pricingVersion: null,
      providerCost: null,
    };
  const calculate = (tokens: number, rate: number) => Math.round((tokens * rate) / 1_000_000);
  const inputCostMicros = calculate(usage.inputTokens, rates.inputTokens);
  const outputCostMicros = calculate(usage.outputTokens, rates.outputTokens);
  const cacheReadCostMicros = calculate(usage.cacheReadTokens, rates.cacheReadTokens);
  const cacheWriteCostMicros = calculate(usage.cacheWriteTokens, rates.cacheWriteTokens);
  return {
    inputCostMicros,
    outputCostMicros,
    cacheReadCostMicros,
    cacheWriteCostMicros,
    totalCostMicros:
      inputCostMicros + outputCostMicros + cacheReadCostMicros + cacheWriteCostMicros,
    source: "static_table",
    pricingVersion: PRICING_VERSION,
    providerCost: null,
  };
}
