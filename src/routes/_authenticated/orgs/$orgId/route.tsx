import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Home, List, BarChart3, Settings, ArrowLeftRight, LogOut, Menu } from "lucide-react";
import { fetchOrganizations, type Organization } from "@/lib/work-core";
import { MissionReturnLink } from "@/components/mission-return-link";
import { ContentSheet } from "@/components/content-sheet";
import { authSupabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const OrgSearch = z.object({
  return: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/orgs/$orgId")({
  validateSearch: (s) => OrgSearch.parse(s),
  beforeLoad: async ({ params }) => {
    const orgs = await fetchOrganizations();
    const org = orgs.find((o) => o.id === params.orgId);
    if (!org) throw redirect({ to: "/orgs" });
    return { org, orgId: params.orgId };
  },
  component: OrgLayout,
});

const tabs = [
  { to: "/orgs/$orgId/start", label: "Hjem", icon: Home },
  { to: "/orgs/$orgId/timer", label: "Timer", icon: List },
  { to: "/orgs/$orgId/reports", label: "Rapport", icon: BarChart3 },
  { to: "/orgs/$orgId/settings", label: "Innstillinger", icon: Settings },
] as const;

function OrgLayout() {
  const { org, orgId } = Route.useRouteContext() as { org: Organization; orgId: string };
  const { return: returnUrl } = Route.useSearch();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await authSupabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setMenuOpen(true)} className="min-w-0 text-left">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Arbeidsrom</p>
          <h2 className="truncate text-lg font-semibold">{org.name}</h2>
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          aria-label="Åpne arbeidsrommeny"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {returnUrl ? (
        <div className="-mt-3 mb-4">
          <MissionReturnLink returnUrl={returnUrl} />
        </div>
      ) : null}

      <Outlet />

      <ContentSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={org.name}>
        <div className="space-y-2 pb-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                params={{ orgId }}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 font-medium transition hover:bg-accent"
              >
                <Icon className="h-5 w-5 text-primary" />
                {t.label}
              </Link>
            );
          })}
          <Link
            to="/orgs"
            onClick={() => setMenuOpen(false)}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-border px-4 font-medium"
          >
            <ArrowLeftRight className="h-5 w-5" /> Bytt arbeidsrom
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left font-medium text-destructive"
          >
            <LogOut className="h-5 w-5" /> Logg ut
          </button>
        </div>
      </ContentSheet>
    </div>
  );
}
