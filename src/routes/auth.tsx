import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | Cursor Cloud Chat" },
      { name: "description", content: "Sign in or continue as a guest to use Cursor Cloud Chat." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const finish = async (action: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      await router.invalidate();
      await navigate({ to: "/chat", replace: true });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-svh place-items-center bg-background p-5">
      <section className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-5 grid size-12 place-items-center rounded-xl bg-primary font-mono font-bold text-primary-foreground">
            C_
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Cursor Cloud Chat</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to keep your agent threads and usage history.
          </p>
        </div>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void finish(() => supabase.auth.signInWithPassword({ email, password }));
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
            maxLength={255}
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
            minLength={8}
            maxLength={128}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button className="w-full" disabled={busy} type="submit">
            Sign in
          </Button>
          <Button
            className="w-full"
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() =>
              void finish(() =>
                supabase.auth.signUp({
                  email,
                  password,
                  options: { emailRedirectTo: window.location.origin },
                }),
              )
            }
          >
            Create account
          </Button>
        </form>
        <div className="mt-5 flex justify-center">
          <Button
            variant="link"
            onClick={async () => {
              if (!email) {
                setError("Enter your email first.");
                return;
              }
              const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              setError(resetError?.message ?? "Check your email for a reset link.");
            }}
          >
            Forgot password?
          </Button>
        </div>
      </section>
    </main>
  );
}
