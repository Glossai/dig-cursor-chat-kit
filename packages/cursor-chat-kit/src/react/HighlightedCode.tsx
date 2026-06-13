import { useEffect, useState } from "react";
import { codeToHtml, bundledLanguages } from "shiki";

const SUPPORTED = new Set(Object.keys(bundledLanguages));

function normalizeLang(lang?: string): string {
  if (!lang) return "text";
  const l = lang.toLowerCase();
  const alias: Record<string, string> = {
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    "c++": "cpp",
    "c#": "csharp",
    objc: "objective-c",
    rs: "rust",
    py: "python",
    js: "javascript",
    ts: "typescript",
    jsx: "jsx",
    tsx: "tsx",
    md: "markdown",
  };
  const mapped = alias[l] ?? l;
  return SUPPORTED.has(mapped) ? mapped : "text";
}

export function HighlightedCode({ code, language }: { code: string; language?: string }) {
  const lang = normalizeLang(language);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    codeToHtml(code, {
      lang,
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    })
      .then((out) => {
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  if (html) {
    return (
      <div
        className="cursor-shiki overflow-x-auto rounded-b-lg border border-border bg-muted/40 p-4 text-sm [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <pre className="overflow-x-auto rounded-b-lg border border-border bg-muted/40 p-4 text-sm">
      <code>{code}</code>
    </pre>
  );
}
