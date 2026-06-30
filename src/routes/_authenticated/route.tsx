import { createFileRoute, Outlet, redirect, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Home, List, FolderKanban, BarChart3, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const tabs = [
  { to: "/dashboard", label: "Start", icon: Home },
  { to: "/timeliste", label: "Timer", icon: List },
  { to: "/prosjekter", label: "Prosjekter", icon: FolderKanban },
  { to: "/rapport", label: "Rapport", icon: BarChart3 },
] as const;

function AuthedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 backdrop-blur bg-background/80 border-b border-border">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground inline-flex items-center justify-center font-bold">W</div>
            <span className="font-semibold">Work Core</span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-foreground p-2 -mr-2"
            aria-label="Logg ut"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-6">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-10 border-t border-border bg-background/95 backdrop-blur">
        <div className="max-w-2xl mx-auto grid grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => {
            const active = location.pathname.startsWith(t.to);
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
