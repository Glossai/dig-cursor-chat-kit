import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cursor Cloud Chat" },
      {
        name: "description",
        content: "A reusable, traceable chat interface for Cursor Cloud Agents.",
      },
      { property: "og:title", content: "Cursor Cloud Chat" },
      {
        property: "og:description",
        content:
          "Run persistent Cursor Cloud Agent conversations with streaming, history, usage, and cost tracking.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-svh bg-background">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">
            C_
          </div>
          <span className="font-semibold">Cursor Cloud Chat</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/stats">Usage stats</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </nav>
      <section className="mx-auto grid max-w-6xl gap-16 px-6 pb-20 pt-20 lg:grid-cols-[1.15fr_.85fr] lg:pt-28">
        <div>
          <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">
            assistant-ui × Cursor Cloud API v1
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-.045em] md:text-7xl">
            A durable interface for cloud agents.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
            Persistent threads, live SSE responses, per-user traceability, token usage, and
            explainable cost accounting—wrapped in one reusable component.
          </p>
          <div className="mt-9 flex gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Open test chat <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid content-start gap-3 pt-3">
          {[
            [Radio, "SSE native", "Assistant deltas stream directly from each Cursor run."],
            [
              ShieldCheck,
              "Secrets stay server-side",
              "Webhook and Cursor credentials never reach the browser.",
            ],
            [
              BarChart3,
              "Usage you can audit",
              "Every run records tokens, cost source, and pricing version.",
            ],
          ].map(([Icon, title, copy]) => {
            const FeatureIcon = Icon as typeof Radio;
            return (
              <article key={String(title)} className="border-l-2 border-primary py-3 pl-5">
                <FeatureIcon className="mb-3 text-primary" />
                <h2 className="font-semibold">{String(title)}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{String(copy)}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
