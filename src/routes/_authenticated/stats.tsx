import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Activity, Coins, Cpu, Hash, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCursorUsageStats, type UsageStats } from "@/lib/cursor/usage.functions";

const usageStatsQuery = queryOptions({
  queryKey: ["cursor-usage-stats"],
  queryFn: () => getCursorUsageStats(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({
    meta: [
      { title: "Usage stats — Cursor Cloud Chat" },
      {
        name: "description",
        content:
          "Per-user token, cost, model, and run-status analytics for Cursor cloud agent traffic.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(usageStatsQuery),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-10">
      <h1 className="text-xl font-semibold">Could not load stats</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-10">No usage yet.</div>,
  component: StatsPage,
});

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 197 37% 50%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 27 87% 67%))",
];

function fmtNum(n: number) {
  return n.toLocaleString();
}
function fmtCost(micros: number) {
  if (!micros) return "$0.00";
  return `$${(micros / 1_000_000).toFixed(4)}`;
}
function fmtMs(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function StatsPage() {
  const router = useRouter();
  const { data } = useSuspenseQuery(usageStatsQuery);

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft /> Home
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Usage stats</h1>
              <p className="text-xs text-muted-foreground">
                The data you get out of the box with cursor-chat-kit.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.invalidate()}>
              Refresh
            </Button>
            <Button asChild size="sm">
              <Link to="/chat">Open chat</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {data.totals.runs === 0 ? <EmptyHint /> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi icon={Activity} label="Runs" value={fmtNum(data.totals.runs)} />
          <Kpi icon={Hash} label="Total tokens" value={fmtNum(data.totals.totalTokens)} />
          <Kpi
            icon={Coins}
            label="Spend"
            value={fmtCost(data.totals.totalCostMicros)}
            hint={data.rows[0]?.cost_source ? `source: ${data.rows[0].cost_source}` : undefined}
          />
          <Kpi
            icon={Timer}
            label="Avg duration"
            value={fmtMs(data.totals.avgDurationMs)}
          />
          <Kpi icon={Cpu} label="Models used" value={fmtNum(data.byModel.length)} />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tokens over time</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.byDay} margin={{ left: -10, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE[0]} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={PALETTE[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE[1]} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={PALETTE[1]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="inputTokens"
                    name="Input"
                    stroke={PALETTE[0]}
                    fill="url(#g-in)"
                  />
                  <Area
                    type="monotone"
                    dataKey="outputTokens"
                    name="Output"
                    stroke={PALETTE[1]}
                    fill="url(#g-out)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Run status</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.byStatus}
                    dataKey="runs"
                    nameKey="status"
                    innerRadius={48}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {data.byStatus.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {data.byStatus.map((s, i) => (
                  <Badge key={s.status} variant="secondary" className="font-mono text-[10px]">
                    <span
                      className="mr-1.5 inline-block size-2 rounded-full"
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                    {s.status} · {s.runs}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tokens by model</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byModel} margin={{ left: -10, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="model" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="totalTokens" name="Tokens" radius={[6, 6, 0, 0]}>
                    {data.byModel.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Token mix</CardTitle>
            </CardHeader>
            <CardContent>
              <TokenMix totals={data.totals} />
              <div className="mt-6 flex flex-wrap gap-2">
                {data.byAgent.map((a) => (
                  <Badge key={a.agent} variant="outline" className="font-mono">
                    {a.agent} · {a.runs} runs · {fmtNum(a.totalTokens)} tok
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent runs</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 text-right font-medium">In</th>
                  <th className="py-2 pr-3 text-right font-medium">Out</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 pr-3 text-right font-medium">Cost</th>
                  <th className="py-2 pr-3 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{r.agent_name}</td>
                    <td className="py-2 pr-3 font-mono">{r.model ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {fmtNum(r.input_tokens ?? 0)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {fmtNum(r.output_tokens ?? 0)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {fmtNum(r.total_tokens ?? 0)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {fmtCost(r.total_cost_micros ?? 0)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{fmtMs(r.duration_ms)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      No runs recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <Icon className="size-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function TokenMix({ totals }: { totals: UsageStats["totals"] }) {
  const parts = [
    { label: "Input", value: totals.inputTokens, color: PALETTE[0] },
    { label: "Output", value: totals.outputTokens, color: PALETTE[1] },
    { label: "Cache read", value: totals.cacheReadTokens, color: PALETTE[2] },
    { label: "Cache write", value: totals.cacheWriteTokens, color: PALETTE[3] },
  ];
  const sum = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (
          <div
            key={p.label}
            style={{ width: `${(p.value / sum) * 100}%`, background: p.color }}
            title={`${p.label}: ${fmtNum(p.value)}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center justify-between rounded border p-2">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="font-mono tabular-nums">{fmtNum(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium">No runs recorded yet</p>
          <p className="text-sm text-muted-foreground">
            Send a message in the chat — each run records tokens, cost source, and duration in
            <code className="mx-1 font-mono">cursor_run_usage</code>.
          </p>
        </div>
        <Button asChild>
          <Link to="/chat">Open chat</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
