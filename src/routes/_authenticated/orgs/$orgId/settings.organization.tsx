import { createFileRoute, Link } from "@tanstack/react-router";
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

      <Link
        to="/orgs/$orgId/settings/finance-integration"
        params={{ orgId: org.id }}
        className="block rounded-lg border border-border p-4 hover:border-primary transition"
      >
        <p className="font-medium">Finance integration →</p>
        <p className="text-sm text-muted-foreground">
          Connect a Finance API key to export time entries as expenses.
        </p>
      </Link>

      <Link
        to="/orgs/$orgId/settings/api-keys"
        params={{ orgId: org.id }}
        className="block rounded-lg border border-border p-4 hover:border-primary transition"
      >
        <p className="font-medium">Manage API keys →</p>
        <p className="text-sm text-muted-foreground">
          Create and revoke keys for Platform verify and external integrations.
        </p>
      </Link>

      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Medlemmer og flere innstillinger kommer snart.
      </div>
    </div>
  );
}
