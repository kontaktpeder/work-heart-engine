import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useLocation,
} from "@tanstack/react-router";
import { Home, List, FolderKanban, Wallet, BarChart3, ArrowLeftRight } from "lucide-react";
import { fetchOrganizations, type Organization } from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/orgs/$orgId")({
  beforeLoad: async ({ params }) => {
    const orgs = await fetchOrganizations();
    const org = orgs.find((o) => o.id === params.orgId);
    if (!org) throw redirect({ to: "/orgs" });
    return { org, orgId: params.orgId };
  },
  component: OrgLayout,
});

const tabs = [
  { to: "/orgs/$orgId/start", label: "Start", icon: Home },
  { to: "/orgs/$orgId/timer", label: "Timer", icon: List },
  { to: "/orgs/$orgId/projects", label: "Prosjekter", icon: FolderKanban },
  { to: "/orgs/$orgId/rates", label: "Satser", icon: Wallet },
  { to: "/orgs/$orgId/reports", label: "Rapport", icon: BarChart3 },
] as const;

function OrgLayout() {
  const { org, orgId } = Route.useRouteContext() as { org: Organization; orgId: string };
  const location = useLocation();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Arbeidsrom</p>
          <h2 className="text-lg font-semibold truncate">{org.name}</h2>
        </div>
        <Link
          to="/orgs"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border"
        >
          <ArrowLeftRight className="w-4 h-4" />
          Bytt org
        </Link>
      </div>

      <Outlet />

      <nav className="fixed bottom-0 inset-x-0 z-10 border-t border-border bg-background/95 backdrop-blur">
        <div className="max-w-2xl mx-auto grid grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => {
            const to = `/orgs/${orgId}/${t.path}`;
            const active = location.pathname === to || location.pathname.startsWith(to + "/");
            const Icon = t.icon;
            return (
              <Link
                key={t.path}
                to="/orgs/$orgId/$tab"
                params={{ orgId, tab: t.path }}
                className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition ${
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
