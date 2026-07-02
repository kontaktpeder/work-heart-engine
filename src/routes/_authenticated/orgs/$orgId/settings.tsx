import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings")({
  head: () => ({ meta: [{ title: "Innstillinger · Work Core" }] }),
  component: SettingsLayout,
});

const subtabs = [
  { to: "/orgs/$orgId/settings/organization", label: "Organization" },
  { to: "/orgs/$orgId/settings/projects", label: "Projects" },
  { to: "/orgs/$orgId/settings/rates", label: "Rates" },
  { to: "/orgs/$orgId/settings/api-keys", label: "API keys" },
] as const;

function SettingsLayout() {
  const { orgId } = Route.useRouteContext() as { orgId: string };
  const location = useLocation();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Innstillinger</h1>
        <p className="text-sm text-muted-foreground">Administrer arbeidsrommet ditt</p>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto -mx-4 px-4">
        {subtabs.map((t) => {
          const resolved = t.to.replace("$orgId", orgId);
          const active =
            location.pathname === resolved || location.pathname.startsWith(resolved + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              params={{ orgId }}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
