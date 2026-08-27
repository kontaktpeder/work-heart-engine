import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authSupabase } from "@/integrations/supabase/client";
import { useAppFrame } from "@/hooks/useAppFrame";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await authSupabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  useAppFrame();
  return (
    <main
      className="overflow-hidden bg-background"
      style={{ height: "var(--app-height, 100svh)" }}
    >
      <Outlet />
    </main>
  );
}
