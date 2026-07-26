import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/prosjekter")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
