import { createFileRoute, redirect, getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteOrganizationMember, listOrganizationMembers } from "@/lib/members.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings/members")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/orgs/$orgId/start",
      params: { orgId: params.orgId },
      search: { ...(search as object), sheet: "settings", section: "members" },
    });
  },
  component: () => null,
});

const orgRoute = getRouteApi("/_authenticated/orgs/$orgId");

const ROLE_COPY: Record<string, { label: string; hint: string }> = {
  owner: { label: "Eier", hint: "" },
  admin: { label: "Admin", hint: "Kan også invitere andre" },
  editor: { label: "Kollega", hint: "Egne timer, felles prosjekter og satser" },
  viewer: { label: "Kun innsyn", hint: "Ser prosjekter og satser" },
};

export function MembersPane() {
  const { orgId } = orgRoute.useRouteContext() as { orgId: string };
  const qc = useQueryClient();
  const listMembersFn = useServerFn(listOrganizationMembers);
  const inviteFn = useServerFn(inviteOrganizationMember);

  const membersQ = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => listMembersFn({ data: { organizationId: orgId } }),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("editor");

  const inviteMut = useMutation({
    mutationFn: () =>
      inviteFn({
        data: {
          organizationId: orgId,
          email: inviteEmail.trim(),
          role: inviteRole,
        },
      }),
    onSuccess: (res) => {
      setInviteEmail("");
      qc.invalidateQueries({ queryKey: ["org-members", orgId] });
      if (res.alreadyMember) toast.message("Personen er allerede med i dette arbeidsrommet");
      else if (res.invited)
        toast.success("Invitasjon sendt. De åpner e-posten, velger passord og logger inn i Work.");
      else toast.success("Medlem lagt til");
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunne ikke invitere"),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border p-4 space-y-2">
        <h2 className="font-medium">Hvordan det funker</h2>
        <p className="text-sm text-muted-foreground">
          De får e-post fra Work, velger sitt eget passord og logger inn her. De trenger ikke Nexus.
          Dere deler prosjekter og satser — timene er hver for dere.
        </p>
      </div>

      <div className="space-y-2">
        {(membersQ.data?.members ?? []).map((m) => {
          const copy = ROLE_COPY[m.role] ?? { label: m.role, hint: "" };
          return (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 border rounded-md px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">{m.email ?? "Ukjent e-post"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {copy.hint || copy.label}
                  {m.localAccount ? " · Work-konto" : ""}
                </p>
              </div>
              <Badge variant={m.role === "owner" ? "default" : "secondary"}>{copy.label}</Badge>
            </div>
          );
        })}
        {membersQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Henter medlemmer…</p>
        ) : null}
      </div>

      {membersQ.data?.canInvite ? (
        <div className="rounded-md border border-border p-4 space-y-3">
          <div>
            <h2 className="font-medium">Inviter kollega</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Skriv e-posten deres. De får en lenke til Work — ikke til Nexus.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">E-post</Label>
            <Input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="navn@firma.no"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label>Hva kan de gjøre?</Label>
            <Select
              value={inviteRole}
              onValueChange={(v) => setInviteRole(v as "admin" | "editor" | "viewer")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Kollega — egne timer, felles prosjekter</SelectItem>
                <SelectItem value="admin">Admin — kan også invitere andre</SelectItem>
                <SelectItem value="viewer">Kun innsyn — ser prosjekter og satser</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={!inviteEmail.trim() || inviteMut.isPending}
            onClick={() => inviteMut.mutate()}
          >
            {inviteMut.isPending ? "Sender…" : "Send invitasjon"}
          </Button>
        </div>
      ) : membersQ.data && !membersQ.data.canInvite ? (
        <p className="text-sm text-muted-foreground">
          Bare eier eller admin kan invitere. Be dem gjøre det.
        </p>
      ) : null}
    </div>
  );
}
