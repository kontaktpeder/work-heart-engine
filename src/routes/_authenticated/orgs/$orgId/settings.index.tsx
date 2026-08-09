import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings/")({
  component: () => null,
});
