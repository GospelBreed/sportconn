import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { supabaseConfigured } from "@/lib/supabase";
import { BRAND } from "@/lib/branding";
import { Button, Field, Input } from "@/components/ui/primitives";
import { BrandMark } from "@/components/layout/BrandMark";

export function LoginPage() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Enter your email and password");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      navigate("/pipeline");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(600px circle at 50% 0%, rgb(var(--brand) / 0.10), transparent 70%)",
        }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <BrandMark size={46} />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">{BRAND.name}</h1>
            <p className="text-sm text-muted">{BRAND.tagline} · staff sign in</p>
          </div>
        </div>

        <form onSubmit={submit} className="card-base space-y-4 p-6">
          <Field label="Work email">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@sportconn.com"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
          {!supabaseConfigured && (
            <p className="rounded-control bg-warning/10 px-3 py-2 text-xs text-warning">
              Supabase isn't configured. Copy <code>frontend/.env.example</code> to{" "}
              <code>.env</code> and set your project URL and anon key.
            </p>
          )}
          <p className="text-center text-xs text-muted">
            Access is invite-only. Ask an admin to add you in Settings.
          </p>
        </form>
      </div>
    </div>
  );
}
