import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Turnstile, turnstileEnabled } from "@/components/Turnstile";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [{ title: "Sign in — Slate" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { configured, user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dest = redirect || "/tutor";

  // Already signed in → bounce to destination.
  useEffect(() => {
    if (!loading && user) {
      navigate({ to: dest });
    }
  }, [loading, user, navigate, dest]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (turnstileEnabled && !captcha) {
      setError("Please complete the verification below.");
      return;
    }
    setBusy(true);
    const fn = mode === "signin" ? signIn : signUp;
    const { error: err } = await fn(email.trim(), password, captcha ?? undefined);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (mode === "signup") {
      // If email confirmation is on, there's no session yet.
      setNotice("Account created. Check your email to confirm, then sign in.");
      setMode("signin");
      return;
    }
    navigate({ to: dest });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Slate
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex max-w-md flex-col px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to practice and keep your progress."
            : "Free to start. Your progress and history are saved to your account."}
        </p>

        {!configured && (
          <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
            Accounts aren't configured yet. Add your Supabase keys to{" "}
            <code>.dev.vars</code> and restart the dev server.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={!configured || busy}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={!configured || busy}
            />
          </div>

          {turnstileEnabled && (
            <div className="pt-1">
              <Turnstile onToken={setCaptcha} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}

          <Button type="submit" className="w-full" disabled={!configured || busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New to Slate?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </main>
    </div>
  );
}
