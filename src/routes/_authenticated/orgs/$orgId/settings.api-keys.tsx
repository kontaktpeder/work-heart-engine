import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Trash2 } from "lucide-react";
import {
  createApiKey,
  listApiClients,
  revokeApiClient,
} from "@/lib/api-keys.functions";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings/api-keys")({
  head: () => ({ meta: [{ title: "API keys · Work Core" }] }),
  component: ApiKeysPage,
});

const ALL_SCOPES = [
  "time:read",
  "time:write",
  "reports:read",
  "platform:read",
  "platform:verify",
] as const;

type Scope = (typeof ALL_SCOPES)[number];

function ApiKeysPage() {
  const { orgId } = Route.useRouteContext() as { orgId: string };
  const qc = useQueryClient();

  const listFn = useServerFn(listApiClients);
  const createFn = useServerFn(createApiKey);
  const revokeFn = useServerFn(revokeApiClient);

  const clientsQ = useQuery({
    queryKey: ["api-clients", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["time:read"]);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (input: { name: string; scopes: Scope[] }) =>
      createFn({ data: { organizationId: orgId, ...input } }),
    onSuccess: (res) => {
      setIssuedToken(res.token);
      setName("");
      setScopes(["time:read"]);
      qc.invalidateQueries({ queryKey: ["api-clients", orgId] });
      toast.success("API key created");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create key"),
  });

  const revokeMut = useMutation({
    mutationFn: (clientId: string) =>
      revokeFn({ data: { organizationId: orgId, clientId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-clients", orgId] });
      toast.success("Key revoked");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to revoke"),
  });

  const toggle = (s: Scope) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="font-medium">Create API key</h2>

        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="platform-verify"
          />
        </div>

        <div className="space-y-2">
          <Label>Scopes</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_SCOPES.map((s) => (
              <label
                key={s}
                className="flex items-center gap-2 text-sm border border-border rounded px-2 py-1.5"
              >
                <Checkbox
                  checked={scopes.includes(s)}
                  onCheckedChange={() => toggle(s)}
                />
                <span className="font-mono">{s}</span>
              </label>
            ))}
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScopes(["platform:read", "platform:verify"])}
            >
              Platform verify only
            </Button>
          </div>
        </div>

        <Button
          disabled={!name || scopes.length === 0 || createMut.isPending}
          onClick={() => createMut.mutate({ name, scopes })}
        >
          {createMut.isPending ? "Creating…" : "Create key"}
        </Button>

        {issuedToken && (
          <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs text-amber-500 uppercase tracking-wide">
              Copy this key now — it won't be shown again
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs break-all bg-background border border-border rounded p-2">
                {issuedToken}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(issuedToken);
                  toast.success("Copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setIssuedToken(null)}>
              Dismiss
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Existing keys</h2>
        {clientsQ.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {clientsQ.data && clientsQ.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        )}
        <div className="space-y-2">
          {clientsQ.data?.map((c: any) => (
            <div
              key={c.id}
              className="rounded-lg border border-border p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {(c.allowed_scopes ?? []).join(", ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.revoked_at ? "Revoked" : "Active"} · Created{" "}
                  {new Date(c.created_at).toLocaleDateString()}
                  {c.last_used_at
                    ? ` · Last used ${new Date(c.last_used_at).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              {!c.revoked_at && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Revoke "${c.name}"?`)) revokeMut.mutate(c.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
