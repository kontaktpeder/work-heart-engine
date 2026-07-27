import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { completeNexusSsoLogin } from "@/lib/identity.functions";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  head: () => ({ meta: [{ title: "Fullfører innlogging · Work Core" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const completeSso = useServerFn(completeNexusSsoLogin);
  const [message, setMessage] = useState("Fullfører innlogging…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code) {
        toast.error("Mangler SSO-kode");
        navigate({ to: "/auth", replace: true });
        return;
      }
      try {
        setMessage("Henter identitet fra Nexus…");
        const tokens = await completeSso({ data: { code } });
        if (cancelled) return;
        setMessage("Starter lokal sesjon…");
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        if (error) throw error;
        if (cancelled) return;
        navigate({ to: "/dashboard", replace: true });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "SSO feilet");
        navigate({ to: "/auth", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, completeSso, navigate]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
