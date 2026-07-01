import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2 } from "lucide-react";
import { fetchDefaultOrgId, fetchOrganizations, setDefaultOrgId } from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/orgs/")({
  head: () => ({ meta: [{ title: "Velg organisasjon · Work Core" }] }),
  component: OrgsPicker,
});

function OrgsPicker() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });
  const defaultOrgQ = useQuery({ queryKey: ["default-org"], queryFn: fetchDefaultOrgId });

  async function choose(orgId: string) {
    await setDefaultOrgId(orgId);
    qc.invalidateQueries({ queryKey: ["default-org"] });
    navigate({ to: "/orgs/$orgId/start", params: { orgId } });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Velg organisasjon</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alt du gjør etter dette skjer inne i det valgte arbeidsrommet.
        </p>
      </div>

      <div className="space-y-2">
        {(orgsQ.data ?? []).map((o) => {
          const isDefault = defaultOrgQ.data === o.id;
          return (
            <button
              key={o.id}
              onClick={() => choose(o.id)}
              className={`w-full surface-card flex items-center justify-between p-4 text-left transition hover:border-primary/50 ${
                isDefault ? "border-primary/50" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-accent inline-flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{o.name}</div>
                  {isDefault && (
                    <div className="text-xs text-primary">Standard</div>
                  )}
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
            </button>
          );
        })}
        {orgsQ.data?.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Ingen organisasjoner ennå.
          </p>
        )}
      </div>
    </div>
  );
}
