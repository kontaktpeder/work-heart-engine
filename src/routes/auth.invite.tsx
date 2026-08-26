import { createFileRoute } from "@tanstack/react-router";
import { InviteAcceptPane } from "@/components/invite-accept";

export const Route = createFileRoute("/auth/invite")({
  ssr: false,
  head: () => ({ meta: [{ title: "Velg passord · Work Core" }] }),
  component: InviteAcceptPane,
});
