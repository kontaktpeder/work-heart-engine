import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { repairWorkIdentityWorkspace } from "@/lib/identity.functions";
import { fetchDefaultOrgId, fetchOrganizations, setDefaultOrgId } from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/orgs/")({
  head: () => ({ meta: [{ title: "Velg organisasjon · Work Core" }] }),
  component: OrgsPicker,
});

function OrgsPicker() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const repairIdentity = useServerFn(repairWorkIdentityWorkspace);
  const repairedRef = useRef(false);
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });
  const defaultOrgQ = useQuery({ queryKey: ["default-org"], queryFn: fetchDefaultOrgId });

  useEffect(() => {
    if (repairedRef.current) return;
    repairedRef.current = true;
    void (async () => {
      try {
        await repairIdentity();
        await qc.invalidateQueries({ queryKey: ["orgs"] });
      } catch {
        // Non-blocking: picker still works with current data.
      }
    })();
  }, [repairIdentity, qc]);

  async function choose(orgId: string) {
    await setDefaultOrgId(orgId);
    qc.invalidateQueries({ queryKey: ["default-org"] });
    navigate({ to: "/orgs/$orgId/start", params: { orgId } });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Velg organisasjon</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alt du gjør etter dette skjer inne i det valgte arbeidsrommet.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/orgs/new">
            <Plus className="h-4 w-4 mr-1" /> Ny organisasjon
          </Link>
        </Button>
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
          <div className="text-center space-y-3 py-8">
            <p className="text-sm text-muted-foreground">Ingen organisasjoner ennå.</p>
            <Button asChild>
              <Link to="/orgs/new">Opprett første organisasjon</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
