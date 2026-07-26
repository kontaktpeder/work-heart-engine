import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/satser")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
