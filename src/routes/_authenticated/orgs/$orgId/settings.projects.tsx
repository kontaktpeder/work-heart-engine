import { createFileRoute, redirect, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjects, type Project } from "@/lib/work-core";
import { canEditCatalog, isOrgAdmin, type OrgMembership } from "@/lib/org-access";
import { ContentSheet } from "@/components/content-sheet";
import { tryOpenSheet } from "@/lib/sheetGate";
import { sheetFieldClass, sheetTextareaClass } from "@/lib/sheetField";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings/projects")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/orgs/$orgId/start",
      params: { orgId: params.orgId },
      search: { ...(search as object), sheet: "settings", section: "projects" },
    });
  },
  component: () => null,
});

const orgRoute = getRouteApi("/_authenticated/orgs/$orgId");

export function ProjectsPane() {
  const { org, orgId, membership } = orgRoute.useRouteContext() as {
    org: { name: string };
    orgId: string;
    membership: OrgMembership | null;
  };
  const canEdit = canEditCatalog(membership?.role);
  const canDelete = isOrgAdmin(membership?.role);
  const qc = useQueryClient();
  const projectsQ = useQuery({
    queryKey: ["projects", orgId, "all"],
    queryFn: () => fetchProjects(orgId, true),
  });

  const [editing, setEditing] = useState<Project | null>(null);
  const [open, setOpen] = useState(false);

  async function toggleActive(p: Project) {
    const { error } = await supabase
      .from("projects")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["projects"] });
  }
  async function remove(p: Project) {
    if (!confirm(`Slette prosjektet "${p.name}"? Eksisterende timer beholder navnet i historikk.`))
      return;
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["projects"] });
    toast.success("Slettet");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">i {org.name}</p>
        {canEdit ? (
          <button
            onClick={() =>
              tryOpenSheet(() => {
                setEditing(null);
                setOpen(true);
              })
            }
            className="tap-target bg-primary text-primary-foreground h-11 px-4"
          >
            <Plus className="w-5 h-5 mr-1" />
            Nytt
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {(projectsQ.data ?? []).map((p) => (
          <div
            key={p.id}
            className={`surface-card flex items-center justify-between p-4 ${!p.is_active ? "opacity-60" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{p.name}</span>
                {!p.is_active && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    Inaktiv
                  </span>
                )}
              </div>
              {(p.code || p.description) && (
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {p.code}
                  {p.code && p.description ? " · " : ""}
                  {p.description}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {canEdit ? (
                <button
                  onClick={() => toggleActive(p)}
                  className="text-xs text-muted-foreground px-2 py-1"
                >
                  {p.is_active ? "Arkiver" : "Aktiver"}
                </button>
              ) : null}
              {canEdit ? (
                <button
                  onClick={() =>
                    tryOpenSheet(() => {
                      setEditing(p);
                      setOpen(true);
                    })
                  }
                  className="p-2 text-muted-foreground hover:text-foreground"
                  aria-label="Rediger"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              ) : null}
              {canDelete ? (
                <button
                  onClick={() => remove(p)}
                  className="p-2 text-muted-foreground hover:text-destructive"
                  aria-label="Slett"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {projectsQ.data?.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Ingen prosjekter ennå.</p>
        )}
      </div>

      {open && (
        <ProjectSheet
          key={editing?.id ?? "new"}
          orgId={orgId}
          project={editing}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ProjectSheet({
  orgId,
  project,
  onClose,
}: {
  orgId: string;
  project: Project | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(project?.name ?? "");
  const [code, setCode] = useState(project?.code ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
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
    <ContentSheet onClose={onClose} title={project ? "Rediger prosjekt" : "Nytt prosjekt"}>
      <form
        onSubmit={save}
        data-sheet-scroll
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div>
          <label className="text-xs text-muted-foreground">Navn</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={sheetFieldClass}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Kode (valgfri)</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={sheetFieldClass}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Beskrivelse (valgfri)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={sheetTextareaClass}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-full tap-target bg-primary text-primary-foreground h-12 disabled:opacity-60"
        >
          {project ? "Lagre" : "Opprett"}
        </button>
      </form>
    </ContentSheet>
  );
}
