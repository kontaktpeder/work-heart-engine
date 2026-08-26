import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getNexusAppUrl, isSharedAuthEnabled } from "@/integrations/supabase/shared-auth";
import { readInviteLanding } from "@/lib/invite-auth";
import { InviteAcceptPane } from "@/components/invite-accept";

export const Route = createFileRoute("/auth/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Logg inn · Work Core" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
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
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

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
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Noe gikk galt";
      const msg = /invalid login credentials/i.test(raw)
        ? "Feil e-post eller passord. Har du fått invitasjon? Åpne lenken i e-posten og velg passord først."
        : raw;
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  if (inviteLanding) {
    return <InviteAcceptPane />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-4">
            W
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Work Core</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Logg inn med e-post og passord
          </p>
        </div>

        <div className="surface-card p-5 space-y-4">
          <form onSubmit={handleEmail} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="E-post"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              placeholder="Passord"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full tap-target bg-primary text-primary-foreground disabled:opacity-60"
            >
              {loading ? "Logger inn…" : "Logg inn"}
            </button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            Ny her? Du får en e-post når noen inviterer deg. Åpne lenken og velg passord — så
            logger du inn her.
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
