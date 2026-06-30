import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/arbeidstyper")({
  beforeLoad: () => {
    throw redirect({ to: "/prosjekter" });
  },
  component: () => null,
});
