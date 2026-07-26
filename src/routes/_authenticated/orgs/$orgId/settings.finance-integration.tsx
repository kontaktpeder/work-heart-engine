import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getFinanceIntegration,
  saveFinanceIntegration,
  testFinanceIntegration,
} from "@/lib/finance-integration.functions";

export const Route = createFileRoute(
  "/_authenticated/orgs/$orgId/settings/finance-integration",
)({
  head: () => ({ meta: [{ title: "Finance integration · Work Core" }] }),
  component: FinanceIntegrationPage,
});

function FinanceIntegrationPage() {
  const { orgId } = Route.useRouteContext() as { orgId: string };
  const qc = useQueryClient();

  const getFn = useServerFn(getFinanceIntegration);
  const saveFn = useServerFn(saveFinanceIntegration);
  const testFn = useServerFn(testFinanceIntegration);

  const infoQ = useQuery({
    queryKey: ["finance-integration", orgId],
    queryFn: () => getFn({ data: { organizationId: orgId } }),
  });

  const [baseUrl, setBaseUrl] = useState("https://financecore.lovable.app");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (infoQ.data?.financeBaseUrl) setBaseUrl(infoQ.data.financeBaseUrl);
  }, [infoQ.data?.financeBaseUrl]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: { organizationId: orgId, financeBaseUrl: baseUrl, financeApiKey: apiKey },
      }),
    onSuccess: () => {
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["finance-integration", orgId] });
      toast.success("Finance integration saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const testMut = useMutation({
    mutationFn: () => testFn({ data: { organizationId: orgId } }),
    onSuccess: () => toast.success("Finance connection OK"),
    onError: (e: any) => toast.error(e?.message ?? "Connection failed"),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="font-medium">Finance Core connection</h2>
        <p className="text-sm text-muted-foreground">
          Configure the Finance API key used to export time entries as expense
          entries. The key is stored encrypted server-side.
        </p>

        <div className="space-y-2">
          <Label htmlFor="baseUrl">Finance base URL</Label>
          <Input
            id="baseUrl"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://financecore.lovable.app"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey">Finance API key</Label>
          <Input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              infoQ.data?.configured
                ? "•••••••• (leave blank to keep current)"
                : "fc_live_..."
            }
          />
          <p className="text-xs text-muted-foreground">
            Needs scope <code className="font-mono">entries:write</code>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!baseUrl || !apiKey || saveMut.isPending}
          >
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={() => testMut.mutate()}
            disabled={!infoQ.data?.configured || testMut.isPending}
          >
            {testMut.isPending ? "Testing…" : "Test connection"}
          </Button>
        </div>

        {infoQ.data?.configured && (
          <p className="text-xs text-muted-foreground">
            Configured · updated{" "}
            {infoQ.data.updatedAt
              ? new Date(infoQ.data.updatedAt).toLocaleString()
              : "—"}
          </p>
        )}
      </div>
    </div>
  );
}
