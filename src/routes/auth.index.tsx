import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getNexusAppUrl, isSharedAuthEnabled } from "@/integrations/supabase/shared-auth";

export const Route = createFileRoute("/auth/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Logg inn · Work Core" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const shared = isSharedAuthEnabled();
  const nexusApp = getNexusAppUrl();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmergency, setShowEmergency] = useState(!shared || !nexusApp);

  useEffect(() => {
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
      if (!shared && mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Velkommen!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Kunne ikke logge inn med Google");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
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
            {shared ? "Logg inn via Platform Core (Nexus)" : "Verdens enkleste arbeidsmotor"}
          </p>
        </div>

        <div className="surface-card p-5 space-y-4">
          {shared && nexusApp ? (
            <>
              <button
                type="button"
                onClick={loginViaNexus}
                disabled={loading}
                className="w-full tap-target bg-primary text-primary-foreground disabled:opacity-60"
              >
                Logg inn via Nexus
              </button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground"
                onClick={() => setShowEmergency((v) => !v)}
              >
                {showEmergency ? "Skjul nødinnlogging" : "Nødinnlogging (e-post)"}
              </button>
              {showEmergency ? (
                <form onSubmit={handleEmail} className="space-y-3">
                  <input
                    type="email"
                    required
                    placeholder="E-post"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Passord"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full tap-target bg-secondary text-secondary-foreground border border-border disabled:opacity-60"
                  >
                    Logg inn
                  </button>
                </form>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex gap-1 p-1 rounded-xl bg-muted mb-1">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
                      mode === m ? "bg-card text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {m === "signin" ? "Logg inn" : "Opprett konto"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleEmail} className="space-y-3">
                {mode === "signup" && (
                  <input
                    type="text"
                    placeholder="Navn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
                <input
                  type="email"
                  required
                  placeholder="E-post"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="password"
                  required
                  minLength={6}
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
                  {mode === "signin" ? "Logg inn" : "Opprett konto"}
                </button>
              </form>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">eller</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="w-full tap-target bg-secondary text-secondary-foreground border border-border disabled:opacity-60"
              >
                Fortsett med Google
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
