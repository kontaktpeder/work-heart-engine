import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getNexusAppUrl, isSharedAuthEnabled } from "@/integrations/supabase/shared-auth";
import { enterAppAfterAuth, readInviteLanding } from "@/lib/invite-auth";
import { InviteAcceptPane } from "@/components/invite-accept";
import { BrandLockup } from "@/components/brand-mark";

export const Route = createFileRoute("/auth/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Logg inn · Work Core" }] }),
  component: AuthPage,
});

function AuthPage() {
  const shared = isSharedAuthEnabled();
  const nexusApp = getNexusAppUrl();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteLanding, setInviteLanding] = useState(false);

  useEffect(() => {
    const landing = readInviteLanding(window.location.href);
    if (landing.kind !== "none") {
      setInviteLanding(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) enterAppAfterAuth();
    });
  }, []);

  function loginViaNexus() {
    if (!nexusApp) {
      toast.error("NEXUS_APP_URL er ikke satt");
      return;
    }
    window.location.assign(
      `${nexusApp}/auth?return_to=${encodeURIComponent(window.location.origin)}`,
    );
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      enterAppAfterAuth();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Noe gikk galt";
      const msg = /invalid login credentials/i.test(raw)
        ? "Feil e-post eller passord. Har du fått invitasjon? Åpne lenken i e-posten og velg passord først."
        : raw;
      toast.error(msg);
      setLoading(false);
    }
  }

  if (inviteLanding) {
    return <InviteAcceptPane />;
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary" />
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="sr-only">Work Core</h1>
          <BrandLockup size="lg" />
          <p className="stamp mt-4 text-muted-foreground">Logg inn med e-post og passord</p>
        </div>

        <div className="surface-card space-y-4 p-5">
          <form onSubmit={handleEmail} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="E-post"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full rounded-md border border-border bg-input px-4 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              placeholder="Passord"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-md border border-border bg-input px-4 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={loading}
              className="tap-target cta-brand w-full bg-primary text-primary-foreground disabled:opacity-60"
            >
              {loading ? "Logger inn…" : "Logg inn"}
            </button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            Ny her? Du får en e-post når noen inviterer deg. Åpne lenken og velg passord — så logger
            du inn her.
          </p>

          {shared && nexusApp ? (
            <button
              type="button"
              onClick={loginViaNexus}
              disabled={loading}
              className="w-full text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
            >
              Jeg bruker Nexus
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
