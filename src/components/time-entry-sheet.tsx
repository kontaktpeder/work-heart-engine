import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrganizations, fetchProjects, type Project, type TimeEntry } from "@/lib/work-core";
import { ProjectPicker } from "./project-picker";
import { toDateInput } from "@/lib/time-utils";

type Props = {
  open: boolean;
  onClose: () => void;
  entry?: TimeEntry | null;
  defaultOrgId?: string;
};

export function TimeEntrySheet({ open, onClose, entry, defaultOrgId }: Props) {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });

  const [orgId, setOrgId] = useState(entry?.organization_id ?? defaultOrgId ?? "");
  const [date, setDate] = useState(entry?.date ?? toDateInput(new Date()));
  const [start, setStart] = useState((entry?.start_time ?? "09:00").slice(0, 5));
  const [end, setEnd] = useState((entry?.end_time ?? "17:00").slice(0, 5));
  const [breakMin, setBreakMin] = useState(entry?.break_minutes ?? 0);
  const [projectId, setProjectId] = useState<string | null>(entry?.project_id ?? null);
  const [project, setProject] = useState<Project | null>(null);
  const [comment, setComment] = useState(entry?.comment ?? "");
  const [rate, setRate] = useState<string>(entry?.hourly_rate?.toString() ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orgId && orgsQ.data?.length) setOrgId(defaultOrgId ?? orgsQ.data[0].id);
  }, [orgsQ.data, orgId, defaultOrgId]);

  const projectsQ = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => fetchProjects(orgId),
    enabled: !!orgId,
  });

  // resolve current project label
  useEffect(() => {
    if (!projectId) { setProject(null); return; }
    const p = (projectsQ.data ?? []).find((x) => x.id === projectId);
    if (p) setProject(p);
  }, [projectId, projectsQ.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return toast.error("Velg organisasjon");
    if (!projectId) return toast.error("Velg prosjekt");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); return; }
    const payload = {
      user_id: u.user.id,
      organization_id: orgId,
      project_id: projectId,
      date,
      start_time: start + ":00",
      end_time: end + ":00",
      break_minutes: breakMin,
      hourly_rate: rate ? Number(rate) : null,
      comment: comment || null,
      source: "manual" as const,
    };
    const res = entry
      ? await supabase.from("time_entries").update(payload).eq("id", entry.id)
      : await supabase.from("time_entries").insert(payload);
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(entry ? "Oppdatert" : "Lagret");
    qc.invalidateQueries({ queryKey: ["entries"] });
    onClose();
  }

  async function remove() {
    if (!entry) return;
    if (!confirm("Slette denne timeføringen?")) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", entry.id);
    if (error) return toast.error(error.message);
    toast.success("Slettet");
    qc.invalidateQueries({ queryKey: ["entries"] });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur flex items-end sm:items-center justify-center" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{entry ? "Rediger timeføring" : "Ny timeføring"}</h2>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-muted-foreground" aria-label="Lukk">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Dato</label>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Start</label>
            <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Slutt</label>
            <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Pause (min)</label>
          <input type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(Math.max(0, parseInt(e.target.value) || 0))} className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Organisasjon</label>
          <select value={orgId} onChange={(e) => { setOrgId(e.target.value); setProjectId(null); }} className="w-full h-11 px-3 rounded-xl bg-input border border-border">
            {(orgsQ.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Prosjekt</label>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full h-11 px-3 rounded-xl bg-input border border-border text-left flex items-center justify-between"
          >
            <span className={project ? "" : "text-muted-foreground"}>
              {project?.name ?? "Velg prosjekt…"}
            </span>
            {project?.hourly_rate != null && <span className="text-xs text-muted-foreground">{project.hourly_rate} kr/t</span>}
          </button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Timesats (overstyrer prosjektets sats)</label>
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={project?.hourly_rate != null ? `Standard ${project.hourly_rate}` : "(valgfri)"} className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Kommentar</label>
          <input value={comment} onChange={(e) => setComment(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
        </div>

        <div className="flex gap-2 pt-2">
          {entry && (
            <button type="button" onClick={remove} className="tap-target bg-destructive/10 text-destructive border border-destructive/30 h-12 px-4" aria-label="Slett">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button type="submit" disabled={busy} className="flex-1 tap-target bg-primary text-primary-foreground h-12 disabled:opacity-60">
            {entry ? "Lagre endringer" : "Lagre"}
          </button>
        </div>

        <ProjectPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          orgId={orgId}
          value={projectId}
          onChange={(id, p) => { setProjectId(id); setProject(p); }}
        />
      </form>
    </div>
  );
}
