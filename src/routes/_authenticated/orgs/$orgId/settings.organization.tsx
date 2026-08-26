import { createFileRoute, Link, redirect, getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateOrganizationReportFields,
  type Organization,
} from "@/lib/work-core";
import {
  getOrganizationPlatformLink,
  saveOrganizationPlatformLink,
} from "@/lib/organization.functions";
import { sheetFieldClass } from "@/lib/sheetField";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings/organization")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/orgs/$orgId/start",
      params: { orgId: params.orgId },
      search: { ...(search as object), sheet: "settings", section: "organization" },
    });
  },
  component: () => null,
});

const orgRoute = getRouteApi("/_authenticated/orgs/$orgId");

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} kopiert`);
  } catch {
    toast.error("Kunne ikke kopiere");
  }
}

export function OrganizationSettingsPane() {
  const { org, orgId } = orgRoute.useRouteContext() as {
    org: Organization;
    orgId: string;
  };
  const qc = useQueryClient();
  const getFn = useServerFn(getOrganizationPlatformLink);
  const saveFn = useServerFn(saveOrganizationPlatformLink);

  const linkQ = useQuery({
    queryKey: ["org-platform-link", orgId],
    queryFn: () => getFn({ data: { organizationId: orgId } }),
  });

  const [platformOrgId, setPlatformOrgId] = useState("");
  const [companyName, setCompanyName] = useState(org.report_company_name ?? org.name ?? "");
  const [employeeName, setEmployeeName] = useState(org.report_employee_name ?? "");
  const [managerName, setManagerName] = useState(org.report_manager_name ?? "");
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    setPlatformOrgId(linkQ.data?.externalIdentityOrgId ?? "");
  }, [linkQ.data?.externalIdentityOrgId]);

  useEffect(() => {
    setCompanyName(org.report_company_name ?? org.name ?? "");
    setEmployeeName(org.report_employee_name ?? "");
    setManagerName(org.report_manager_name ?? "");
  }, [org.id, org.name, org.report_company_name, org.report_employee_name, org.report_manager_name]);

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

  async function saveReportFields() {
    setReportBusy(true);
    try {
      await updateOrganizationReportFields(orgId, {
        report_company_name: companyName.trim() || null,
        report_employee_name: employeeName.trim() || null,
        report_manager_name: managerName.trim() || null,
      });
      toast.success("Rapportfelter lagret");
      // Force org reload on next navigation
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre");
    } finally {
      setReportBusy(false);
    }
  }

  const appBase =
    typeof window !== "undefined" ? window.location.origin : "https://…";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Navn</p>
        <p className="text-lg font-medium">{org.name}</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold">Rapport (e-skjenk)</p>
          <p className="text-xs text-muted-foreground">
            Forhåndsutfylt i CSV/PDF-header. Periode settes ved eksport.
          </p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Firmanavn</label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={`${sheetFieldClass} mt-1`}
            placeholder={org.name}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Ansatt</label>
          <input
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
            className={`${sheetFieldClass} mt-1`}
            placeholder="Navn på rapport"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Leder</label>
          <input
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            className={`${sheetFieldClass} mt-1`}
            placeholder="Leder / godkjenner"
          />
        </div>
        <Button type="button" onClick={saveReportFields} disabled={reportBusy}>
          {reportBusy ? "Lagrer…" : "Lagre rapportfelter"}
        </Button>
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
    </div>
  );
}
