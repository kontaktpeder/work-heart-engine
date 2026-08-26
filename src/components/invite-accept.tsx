import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  invitedOrganizationIdFromMetadata,
  readInviteLanding,
} from "@/lib/invite-auth";
import { setDefaultOrgId } from "@/lib/work-core";

export function InviteAcceptPane() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"loading" | "password" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const landing = readInviteLanding(window.location.href);
      try {
        if (landing.error) {
          throw new Error(landing.error);
        }

        const existing = await supabase.auth.getSession();
        if (!existing.data.session?.user) {
          if (landing.tokenHash) {
            const type = landing.kind === "recovery" ? "recovery" : "invite";
            const { error } = await supabase.auth.verifyOtp({
              token_hash: landing.tokenHash,
              type,
            });
            if (error) throw error;
          } else if (landing.code) {
            const { error } = await supabase.auth.exchangeCodeForSession(landing.code);
            if (error) throw error;
          }
        }

        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          throw new Error("Lenken er ugyldig eller utløpt. Be om en ny invitasjon.");
        }
        if (cancelled) return;
        setEmail(data.user.email ?? "");
        setPhase("password");
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Kunne ikke åpne invitasjonen";
        setErrorText(msg);
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Passordet må ha minst 6 tegn");
      return;
    }
    if (password !== confirm) {
      toast.error("Passordene er ikke like");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const { data } = await supabase.auth.getUser();
      const orgId = invitedOrganizationIdFromMetadata(
        (data.user?.user_metadata ?? {}) as Record<string, unknown>,
      );
      if (orgId) {
        try {
          await setDefaultOrgId(orgId);
        } catch {
          /* still continue into the app */
        }
      }
      toast.success("Passord lagret. Du er inne.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke lagre passord");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-4">
            W
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Velkommen til Work</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Velg et passord. Etterpå logger du inn med e-post her — du trenger ikke Nexus.
          </p>
        </div>

        <div className="surface-card p-5 space-y-4">
          {phase === "loading" ? (
            <p className="text-sm text-muted-foreground text-center">Åpner invitasjonen…</p>
          ) : null}

          {phase === "error" ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{errorText}</p>
              <button
                type="button"
                className="w-full tap-target bg-secondary text-secondary-foreground border border-border"
                onClick={() => navigate({ to: "/auth", replace: true })}
              >
                Til innlogging
              </button>
            </div>
          ) : null}

          {phase === "password" ? (
            <form onSubmit={savePassword} className="space-y-3">
              {email ? (
                <p className="text-sm text-muted-foreground">
                  Konto: <span className="text-foreground font-medium">{email}</span>
                </p>
              ) : null}
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Velg passord"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Gjenta passord"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full tap-target bg-primary text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Lagrer…" : "Lagre passord og fortsett"}
              </button>
              <p className="text-xs text-muted-foreground">
                Timerne dine er bare dine. Dere deler prosjekter og satser i samme arbeidsrom.
              </p>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
