import { createFileRoute } from "@tanstack/react-router";
import type { Organization } from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings/organization")({
  head: () => ({ meta: [{ title: "Organisasjon · Work Core" }] }),
  component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
  const { org } = Route.useRouteContext() as { org: Organization };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Navn</p>
        <p className="text-lg font-medium">{org.name}</p>
      </div>

      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Medlemmer og API-tilgang kommer snart.
      </div>
    </div>
  );
}
