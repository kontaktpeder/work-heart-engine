import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/timeliste")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
