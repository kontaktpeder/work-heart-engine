import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  const [errorText, setErrorText] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      if (!code) {
        setErrorText("Mangler SSO-kode");
        toast.error("Mangler SSO-kode");
        navigate({ to: "/auth", replace: true });
        return;
      }
      const lockKey = `sso:done:${code}`;
      if (sessionStorage.getItem(lockKey) === "1") {
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      try {
        setMessage("Henter identitet fra Nexus…");
        const tokens = await completeSso({ data: { code } });
        setMessage("Starter lokal sesjon…");
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        if (error) throw error;
        sessionStorage.setItem(lockKey, "1");
        navigate({ to: "/dashboard", replace: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "SSO feilet";
        setErrorText(msg);
        toast.error(msg);
        window.setTimeout(() => navigate({ to: "/auth", replace: true }), 2500);
      }
    })();
  }, [code, completeSso, navigate]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <p className="text-sm text-muted-foreground text-center max-w-sm">{errorText ?? message}</p>
      {errorText ? (
        <button
          type="button"
          className="mt-4 text-sm text-primary underline"
          onClick={() => navigate({ to: "/auth", replace: true })}
        >
          Tilbake til innlogging
        </button>
      ) : null}
    </main>
  );
}
