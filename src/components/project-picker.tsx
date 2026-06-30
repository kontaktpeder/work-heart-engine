import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, X, Star } from "lucide-react";
import { createProject, fetchFrequentProjects, fetchProjects, type Project } from "@/lib/work-core";

type Props = {
  open: boolean;
  onClose: () => void;
  orgId: string;
  value: string | null;
  onChange: (projectId: string, project: Project) => void;
};

export function ProjectPicker({ open, onClose, orgId, value, onChange }: Props) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const projectsQ = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => fetchProjects(orgId),
    enabled: !!orgId && open,
  });
  const frequentQ = useQuery({
    queryKey: ["projects-frequent", orgId],
    queryFn: () => fetchFrequentProjects(orgId),
    enabled: !!orgId && open,
  });

  const all = projectsQ.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.name.toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q));
  }, [all, query]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const p = await createProject({
        organization_id: orgId,
        name: newName.trim(),
        hourly_rate: newRate ? Number(newRate) : null,
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Prosjekt opprettet");
      onChange(p.id, p);
      onClose();
      setNewName("");
      setNewRate("");
      setCreating(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Velg prosjekt</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-muted-foreground" aria-label="Lukk">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!creating && (
          <>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søk i prosjekter…"
                className="w-full h-11 pl-9 pr-3 rounded-xl bg-input border border-border"
              />
            </div>

            {!query && (frequentQ.data?.length ?? 0) > 0 && (
              <div className="mb-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                  <Star className="w-3 h-3" /> Ofte brukt
                </p>
                <div className="space-y-1">
                  {frequentQ.data!.map((p) => (
                    <ProjectRow key={p.id} project={p} active={p.id === value} onPick={() => { onChange(p.id, p); onClose(); }} />
                  ))}
                </div>
              </div>
            )}

            <div className="mb-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Alle prosjekter</p>
              <div className="space-y-1">
                {filtered.map((p) => (
                  <ProjectRow key={p.id} project={p} active={p.id === value} onPick={() => { onChange(p.id, p); onClose(); }} />
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">Ingen treff.</p>
                )}
              </div>
            </div>

            <button
              onClick={() => setCreating(true)}
              className="w-full tap-target border border-dashed border-border text-foreground h-12"
            >
              <Plus className="w-4 h-4 mr-2" />
              Opprett nytt prosjekt
            </button>
          </>
        )}

        {creating && (
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Navn</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Prosjektnavn"
                className="w-full h-11 px-3 rounded-xl bg-input border border-border"
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Timesats (valgfri)</label>
              <input
                type="number"
                step="0.01"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="f.eks. 210"
                className="w-full h-11 px-3 rounded-xl bg-input border border-border"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCreating(false)} className="flex-1 tap-target bg-muted text-foreground">Avbryt</button>
              <button type="submit" disabled={busy || !newName.trim()} className="flex-1 tap-target bg-primary text-primary-foreground disabled:opacity-60">Opprett</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project, active, onPick }: { project: Project; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between ${
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent"
      }`}
    >
      <div className="min-w-0">
        <div className="font-medium truncate">{project.name}</div>
        {project.code && <div className="text-xs text-muted-foreground">{project.code}</div>}
      </div>
      {project.hourly_rate != null && (
        <span className="text-xs text-muted-foreground tabular-nums">{project.hourly_rate} kr/t</span>
      )}
    </button>
  );
}
