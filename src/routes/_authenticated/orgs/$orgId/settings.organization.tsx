import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Organization } from "@/lib/work-core";
import {
  getOrganizationPlatformLink,
  saveOrganizationPlatformLink,
} from "@/lib/organization.functions";
import {
  inviteOrganizationMember,
  listOrganizationMembers,
} from "@/lib/members.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings/organization")({
  head: () => ({ meta: [{ title: "Organisasjon · Work Core" }] }),
  component: OrganizationSettingsPage,
});

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} kopiert`);
  } catch {
    toast.error("Kunne ikke kopiere");
  }
}

function OrganizationSettingsPage() {
  const { org, orgId } = Route.useRouteContext() as {
    org: Organization;
    orgId: string;
  };
  const qc = useQueryClient();
  const getFn = useServerFn(getOrganizationPlatformLink);
  const saveFn = useServerFn(saveOrganizationPlatformLink);
  const listMembersFn = useServerFn(listOrganizationMembers);
  const inviteFn = useServerFn(inviteOrganizationMember);

  const linkQ = useQuery({
    queryKey: ["org-platform-link", orgId],
    queryFn: () => getFn({ data: { organizationId: orgId } }),
  });

  const membersQ = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => listMembersFn({ data: { organizationId: orgId } }),
  });

  const [platformOrgId, setPlatformOrgId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("editor");
  useEffect(() => {
    setPlatformOrgId(linkQ.data?.externalIdentityOrgId ?? "");
  }, [linkQ.data?.externalIdentityOrgId]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          organizationId: orgId,
          externalIdentityOrgId: platformOrgId.trim(),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-platform-link", orgId] });
      toast.success("Platform-kobling lagret");
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunne ikke lagre"),
  });

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
      if (res.alreadyMember) toast.message("Brukeren er allerede medlem");
      else if (res.invited) toast.success("Invitasjon sendt på e-post");
      else toast.success("Medlem lagt til");
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunne ikke invitere"),
  });

  const appBase =
    typeof window !== "undefined" ? window.location.origin : "https://…";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Navn</p>
        <p className="text-lg font-medium">{org.name}</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div>
          <h2 className="font-medium">Platform-kobling (Nexus)</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Bruk disse verdiene når du kobler Work i Nexus → Moduler. Opprett en
            API-nøkkel med <code className="font-mono text-xs">platform:read</code>{" "}
            + <code className="font-mono text-xs">platform:verify</code>.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Work org-ID</Label>
          <div className="flex gap-2">
            <Input readOnly value={orgId} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void copyText(orgId, "Org-ID")}
              aria-label="Kopier org-ID"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Base URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={appBase} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void copyText(appBase, "Base URL")}
              aria-label="Kopier base URL"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="platformOrgId">Platform (Nexus) org-ID</Label>
          <Input
            id="platformOrgId"
            value={platformOrgId}
            onChange={(e) => setPlatformOrgId(e.target.value)}
            placeholder="uuid fra Nexus-organisasjonen"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Kreves for Finance-eksport. Lim inn org-ID fra Nexus.
          </p>
          <Button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || linkQ.isLoading}
          >
            {saveMut.isPending ? "Lagrer…" : "Lagre Platform-kobling"}
          </Button>
        </div>

        <Link
          to="/orgs/$orgId/settings/api-keys"
          params={{ orgId }}
          className="inline-flex text-sm text-primary hover:underline"
        >
          Opprett platform-verify-nøkkel →
        </Link>
      </div>

      <Link
        to="/orgs/$orgId/settings/finance-integration"
        params={{ orgId }}
        className="block rounded-lg border border-border p-4 hover:border-primary transition"
      >
        <p className="font-medium">Finance integration →</p>
        <p className="text-sm text-muted-foreground">
          Connect a Finance API key to export time entries as expenses.
        </p>
      </Link>

      <Link
        to="/orgs/$orgId/settings/api-keys"
        params={{ orgId }}
        className="block rounded-lg border border-border p-4 hover:border-primary transition"
      >
        <p className="font-medium">Manage API keys →</p>
        <p className="text-sm text-muted-foreground">
          Create and revoke keys for Platform verify and external integrations.
        </p>
      </Link>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div>
          <h2 className="font-medium">Medlemmer</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Inviter kolleger via e-post.
          </p>
        </div>

        <div className="space-y-2">
          {(membersQ.data?.members ?? []).map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 border rounded-md px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">{m.email ?? "Ukjent e-post"}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{m.userId}</p>
              </div>
              <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
            </div>
          ))}
        </div>

        {membersQ.data?.canInvite && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">E-post</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="navn@firma.no"
              />
            </div>
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as "admin" | "editor" | "viewer")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={!inviteEmail.trim() || inviteMut.isPending}
              onClick={() => inviteMut.mutate()}
            >
              {inviteMut.isPending ? "Sender…" : "Inviter"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
