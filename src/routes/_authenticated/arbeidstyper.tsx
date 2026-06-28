import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrganizations, fetchWorkTypes } from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/arbeidstyper")({
  head: () => ({ meta: [{ title: "Arbeidstyper · Work Core" }] }),
  component: WorkTypes,
});

function WorkTypes() {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });
  const [orgId, setOrgId] = useState("");
  useEffect(() => {
    if (!orgId && orgsQ.data?.length) setOrgId(orgsQ.data[0].id);
  }, [orgsQ.data, orgId]);

  const typesQ = useQuery({
    queryKey: ["types", orgId],
    queryFn: () => fetchWorkTypes(orgId),
    enabled: !!orgId,
  });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("work_types").insert({
      organization_id: orgId,
      name: name.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setName("");
    qc.invalidateQueries({ queryKey: ["types"] });
  }

  async function remove(id: string) {
    if (!confirm("Slette denne arbeidstypen?")) return;
    const { error } = await supabase.from("work_types").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["types"] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Arbeidstyper</h1>

      <div className="surface-card space-y-3">
        <label className="text-xs text-muted-foreground">Organisasjon</label>
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border">
          {(orgsQ.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>

        <form onSubmit={add} className="flex gap-2 pt-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="F.eks. Rigging"
            className="flex-1 h-11 px-3 rounded-xl bg-input border border-border"
          />
          <button type="submit" disabled={busy || !name.trim()} className="tap-target bg-primary text-primary-foreground h-11 px-4 disabled:opacity-60">
            <Plus className="w-5 h-5" />
          </button>
        </form>
      </div>

      <div className="space-y-2">
        {(typesQ.data ?? []).map((t) => (
          <div key={t.id} className="surface-card flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color ?? "var(--muted-foreground)" }} />
              <span className="font-medium">{t.name}</span>
            </div>
            <button onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive p-2">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {typesQ.data?.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Ingen arbeidstyper ennå.</p>
        )}
      </div>
    </div>
  );
}
