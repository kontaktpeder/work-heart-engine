import { createFileRoute, redirect, getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchMyOrgMembership, updateMyReportNames, type Organization } from "@/lib/work-core";
import type { OrgMembership } from "@/lib/org-access";
import { sheetFieldClass } from "@/lib/sheetField";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings/report")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/orgs/$orgId/start",
      params: { orgId: params.orgId },
      search: { ...(search as object), sheet: "settings", section: "report" },
    });
  },
  component: () => null,
});

const orgRoute = getRouteApi("/_authenticated/orgs/$orgId");

export function ReportSettingsPane() {
  const {
    org,
    orgId,
    membership: initialMembership,
  } = orgRoute.useRouteContext() as {
    org: Organization;
    orgId: string;
    membership: OrgMembership | null;
  };
  const qc = useQueryClient();
  const membershipQ = useQuery({
    queryKey: ["org-membership", orgId],
    queryFn: () => fetchMyOrgMembership(orgId),
    initialData: initialMembership ?? undefined,
  });

  const [employeeName, setEmployeeName] = useState("");
  const [managerName, setManagerName] = useState("");

  useEffect(() => {
    setEmployeeName(membershipQ.data?.report_employee_name ?? "");
    setManagerName(membershipQ.data?.report_manager_name ?? "");
  }, [membershipQ.data?.report_employee_name, membershipQ.data?.report_manager_name]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateMyReportNames(orgId, {
        employeeName: employeeName.trim() || null,
        managerName: managerName.trim() || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["org-membership", orgId] });
      toast.success("Rapportfelter lagret");
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunne ikke lagre"),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold">Navn på rapporten</p>
          <p className="text-xs text-muted-foreground">
            Ditt navn på CSV/PDF — ikke felles for arbeidsrommet. Feltene kan tømmes og lagres tomme
            før kontoen gis videre. Ansattnavn kreves først ved eksport.
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Firma</p>
          <p className="mt-1 text-sm font-medium">{org.report_company_name?.trim() || org.name}</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="report-employee">
            Ansatt
          </label>
          <input
            id="report-employee"
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
            className={`${sheetFieldClass} mt-1`}
            placeholder="Navn på rapport"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="report-manager">
            Leder
          </label>
          <input
            id="report-manager"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            className={`${sheetFieldClass} mt-1`}
            placeholder="Leder / godkjenner"
          />
        </div>
        <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Lagrer…" : "Lagre"}
        </Button>
      </div>
    </div>
  );
}
