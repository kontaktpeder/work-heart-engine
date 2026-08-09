import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus } from "lucide-react";
import { createProject, fetchProjects, type Project } from "@/lib/work-core";
import { ContentSheet } from "./content-sheet";

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
  const [busy, setBusy] = useState(false);

  const projectsQ = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => fetchProjects(orgId),
    enabled: !!orgId && open,
  });

  const all = projectsQ.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q),
    );
  }, [all, query]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const p = await createProject({
        organization_id: orgId,
        name: newName.trim(),
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Prosjekt opprettet");
      onChange(p.id, p);
      onClose();
      setNewName("");
      setCreating(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <ContentSheet
      onClose={onClose}
      title="Velg prosjekt"
      zClassName="z-[90]"
      detents={["half", "full"]}
    >
      <div
        data-sheet-scroll
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        {!creating && (
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søk i prosjekter…"
                className="w-full h-11 pl-9 pr-3 rounded-xl bg-input border border-border text-base"
              />
            </div>

            <div className="space-y-1">
              {filtered.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  active={p.id === value}
                  onPick={() => {
                    onChange(p.id, p);
                    onClose();
                  }}
                />
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">Ingen treff.</p>
              )}
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
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Prosjektnavn"
                className="w-full h-11 px-3 rounded-xl bg-input border border-border text-base"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="flex-1 tap-target bg-muted text-foreground"
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="flex-1 tap-target bg-primary text-primary-foreground disabled:opacity-60"
              >
                Opprett
              </button>
            </div>
          </form>
        )}
      </div>
    </ContentSheet>
  );
}

function ProjectRow({
  project,
  active,
  onPick,
}: {
  project: Project;
  active: boolean;
  onPick: () => void;
}) {
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
    </button>
  );
}
