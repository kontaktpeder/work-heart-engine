import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings")({
  head: () => ({ meta: [{ title: "Innstillinger · Work Core" }] }),
  component: SettingsLayout,
});

const subtabs = [
  { to: "/orgs/$orgId/settings/organization", label: "Organization", hint: "Navn og detaljer" },
  { to: "/orgs/$orgId/settings/projects", label: "Projects", hint: "Prosjektliste" },
  { to: "/orgs/$orgId/settings/rates", label: "Rates", hint: "Timepriser" },
  { to: "/orgs/$orgId/settings/finance-integration", label: "Finance", hint: "Eksport og kobling" },
  { to: "/orgs/$orgId/settings/api-keys", label: "API keys", hint: "Nøkler for integrasjoner" },
] as const;

function SettingsLayout() {
  const { orgId } = Route.useRouteContext() as { orgId: string };
  const location = useLocation();
  const onIndex =
    location.pathname === `/orgs/${orgId}/settings` ||
    location.pathname === `/orgs/${orgId}/settings/`;

  if (onIndex) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Innstillinger</h1>
          <p className="text-sm text-muted-foreground">Administrer arbeidsrommet ditt</p>
        </div>

        <div className="space-y-2">
          {subtabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              params={{ orgId }}
              className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 transition hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.hint}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/orgs/$orgId/settings"
        params={{ orgId }}
        className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Innstillinger
      </Link>
      <Outlet />
    </div>
  );
}
