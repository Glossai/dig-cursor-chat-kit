import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UsageRow = {
  id: string;
  created_at: string;
  finished_at: string | null;
  agent_name: string;
  model: string | null;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  total_tokens: number | null;
  total_cost_micros: number | null;
  cost_source: string | null;
  duration_ms: number | null;
};

export type UsageStats = {
  rows: UsageRow[];
  totals: {
    runs: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    totalCostMicros: number;
    avgDurationMs: number | null;
  };
  byModel: Array<{ model: string; runs: number; totalTokens: number; totalCostMicros: number }>;
  byStatus: Array<{ status: string; runs: number }>;
  byAgent: Array<{ agent: string; runs: number; totalTokens: number }>;
  byDay: Array<{
    day: string;
    runs: number;
    inputTokens: number;
    outputTokens: number;
    totalCostMicros: number;
  }>;
};

export const getCursorUsageStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageStats> => {
    const { data, error } = await context.supabase
      .from("cursor_run_usage")
      .select(
        "id, created_at, finished_at, agent_name, model, status, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, total_cost_micros, cost_source, duration_ms",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as UsageRow[];

    const totals = {
      runs: rows.length,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      totalCostMicros: 0,
      avgDurationMs: null as number | null,
    };
    let durationCount = 0;
    let durationSum = 0;
    const modelMap = new Map<string, { runs: number; totalTokens: number; totalCostMicros: number }>();
    const statusMap = new Map<string, number>();
    const agentMap = new Map<string, { runs: number; totalTokens: number }>();
    const dayMap = new Map<
      string,
      { runs: number; inputTokens: number; outputTokens: number; totalCostMicros: number }
    >();

    for (const r of rows) {
      totals.inputTokens += r.input_tokens ?? 0;
      totals.outputTokens += r.output_tokens ?? 0;
      totals.cacheReadTokens += r.cache_read_tokens ?? 0;
      totals.cacheWriteTokens += r.cache_write_tokens ?? 0;
      totals.totalTokens += r.total_tokens ?? 0;
      totals.totalCostMicros += r.total_cost_micros ?? 0;
      if (r.duration_ms != null) {
        durationSum += r.duration_ms;
        durationCount += 1;
      }

      const m = r.model ?? "unknown";
      const mp = modelMap.get(m) ?? { runs: 0, totalTokens: 0, totalCostMicros: 0 };
      mp.runs += 1;
      mp.totalTokens += r.total_tokens ?? 0;
      mp.totalCostMicros += r.total_cost_micros ?? 0;
      modelMap.set(m, mp);

      statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);

      const ap = agentMap.get(r.agent_name) ?? { runs: 0, totalTokens: 0 };
      ap.runs += 1;
      ap.totalTokens += r.total_tokens ?? 0;
      agentMap.set(r.agent_name, ap);

      const day = (r.finished_at ?? r.created_at).slice(0, 10);
      const dp = dayMap.get(day) ?? { runs: 0, inputTokens: 0, outputTokens: 0, totalCostMicros: 0 };
      dp.runs += 1;
      dp.inputTokens += r.input_tokens ?? 0;
      dp.outputTokens += r.output_tokens ?? 0;
      dp.totalCostMicros += r.total_cost_micros ?? 0;
      dayMap.set(day, dp);
    }
    if (durationCount > 0) totals.avgDurationMs = Math.round(durationSum / durationCount);

    return {
      rows: rows.slice(0, 25),
      totals,
      byModel: [...modelMap.entries()]
        .map(([model, v]) => ({ model, ...v }))
        .sort((a, b) => b.totalTokens - a.totalTokens),
      byStatus: [...statusMap.entries()]
        .map(([status, runs]) => ({ status, runs }))
        .sort((a, b) => b.runs - a.runs),
      byAgent: [...agentMap.entries()]
        .map(([agent, v]) => ({ agent, ...v }))
        .sort((a, b) => b.runs - a.runs),
      byDay: [...dayMap.entries()]
        .map(([day, v]) => ({ day, ...v }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    };
  });
