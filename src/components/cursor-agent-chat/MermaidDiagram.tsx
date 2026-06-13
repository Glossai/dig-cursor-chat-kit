import { useEffect, useId, useState } from "react";

type DiagramState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error" };

export function MermaidDiagram({ code }: { code: string }) {
  const reactId = useId();
  const [state, setState] = useState<DiagramState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const id = `cursor-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
      const parsed = await mermaid.parse(code, { suppressErrors: true });
      if (!parsed) {
        if (!cancelled) setState({ status: "error" });
        return;
      }
      const result = await mermaid.render(id, code);
      if (!cancelled) setState({ status: "ready", svg: result.svg });
    }).catch(() => {
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
      if (!cancelled) setState({ status: "error" });
    });
    return () => {
      cancelled = true;
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    };
  }, [code, reactId]);

  if (state.status === "ready") {
    return <div className="overflow-x-auto rounded-b-lg border border-border bg-card p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: state.svg }} />;
  }
  if (state.status === "error") {
    return <pre className="overflow-x-auto rounded-b-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"><code>{code}</code></pre>;
  }
  return <div className="flex min-h-32 items-center justify-center rounded-b-lg border border-border bg-muted/40 text-sm text-muted-foreground"><span className="animate-pulse">Rendering diagram…</span></div>;
}