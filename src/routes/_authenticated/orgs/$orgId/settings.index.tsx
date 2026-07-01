import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/orgs/$orgId/settings/organization",
      params: { orgId: params.orgId },
    });
  },
  component: () => null,
});
