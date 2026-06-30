import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrganizations, fetchProjects, type Project } from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/prosjekter")({
  head: () => ({ meta: [{ title: "Prosjekter · Work Core" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });
  const [orgId, setOrgId] = useState("");
  useEffect(() => {
    if (!orgId && orgsQ.data?.length) setOrgId(orgsQ.data[0].id);
  }, [orgsQ.data, orgId]);

  const projectsQ = useQuery({
    queryKey: ["projects", orgId, "all"],
    queryFn: () => fetchProjects(orgId, true),
    enabled: !!orgId,
  });

  const [editing, setEditing] = useState<Project | null>(null);
  const [open, setOpen] = useState(false);

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(p: Project) { setEditing(p); setOpen(true); }

  async function toggleActive(p: Project) {
    const { error } = await supabase.from("projects").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["projects"] });
  }

  async function remove(p: Project) {
    if (!confirm(`Slette prosjektet "${p.name}"? Eksisterende timer beholder navnet i historikk.`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["projects"] });
    toast.success("Slettet");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Prosjekter</h1>
        <button onClick={openNew} className="tap-target bg-primary text-primary-foreground h-11 px-4">
          <Plus className="w-5 h-5 mr-1" />
          Nytt
        </button>
      </div>

      <div className="surface-card">
        <label className="text-xs text-muted-foreground">Organisasjon</label>
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border mt-1">
          {(orgsQ.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {(projectsQ.data ?? []).map((p) => (
          <div key={p.id} className={`surface-card flex items-center justify-between p-4 ${!p.is_active ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{p.name}</span>
                {!p.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inaktiv</span>}
              </div>
              <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                {p.code && <span>{p.code}</span>}
                {p.hourly_rate != null && <span>{p.hourly_rate} kr/t</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggleActive(p)} className="text-xs text-muted-foreground px-2 py-1">
                {p.is_active ? "Arkiver" : "Aktiver"}
              </button>
              <button onClick={() => openEdit(p)} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Rediger">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => remove(p)} className="p-2 text-muted-foreground hover:text-destructive" aria-label="Slett">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {projectsQ.data?.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Ingen prosjekter ennå.</p>
        )}
      </div>

      {open && (
        <ProjectSheet
          orgId={orgId}
          project={editing}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ProjectSheet({ orgId, project, onClose }: { orgId: string; project: Project | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(project?.name ?? "");
  const [code, setCode] = useState(project?.code ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [rate, setRate] = useState(project?.hourly_rate?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const payload = {
      organization_id: orgId,
      name: name.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      hourly_rate: rate ? Number(rate) : null,
    };
    const res = project
      ? await supabase.from("projects").update(payload).eq("id", project.id)
      : await supabase.from("projects").insert({ ...payload, is_active: true });
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(project ? "Oppdatert" : "Opprettet");
    qc.invalidateQueries({ queryKey: ["projects"] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end sm:items-center justify-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{project ? "Rediger prosjekt" : "Nytt prosjekt"}</h2>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-muted-foreground" aria-label="Lukk"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Navn</label>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Kode (valgfri)</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Standard timesats (valgfri)</label>
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="f.eks. 210" className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Beskrivelse (valgfri)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-xl bg-input border border-border" />
        </div>
        <button type="submit" disabled={busy || !name.trim()} className="w-full tap-target bg-primary text-primary-foreground h-12 disabled:opacity-60">
          {project ? "Lagre" : "Opprett"}
        </button>
      </form>
    </div>
  );
}
