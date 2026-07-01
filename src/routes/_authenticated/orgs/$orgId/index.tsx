import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/orgs/$orgId/start", params: { orgId: params.orgId } });
  },
  component: () => null,
});
