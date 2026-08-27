import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookmarkPlus, Coffee, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMarksForEntries,
  fetchProjects,
  fetchRates,
  sumPauseMinutes,
  syncEntryBreakFromMarks,
  type Project,
  type Rate,
  type TimeEntry,
  type TimeEntryMark,
} from "@/lib/work-core";
import { ProjectPicker } from "./project-picker";
import { RatePicker } from "./rate-picker";
import { MarkSheet } from "./mark-sheet";
import { ContentSheet } from "./content-sheet";
import { SheetStickyFooter } from "./sheet-sticky-footer";
import { entryFormDefaults, stripNexusCommentTag } from "@/lib/time-utils";
import { formatMarkLabel, formatMarkTime } from "@/lib/marks";
import { tryOpenSheet } from "@/lib/sheetGate";
import { sheetFieldClass, sheetTextareaClass } from "@/lib/sheetField";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after successful save (before/instead of just closing). */
  onSaved?: () => void;
  entry?: TimeEntry | null;
  orgId: string;
};

export function TimeEntrySheet({ open, onClose, onSaved, entry, orgId }: Props) {
  const qc = useQueryClient();
  const initial = entryFormDefaults(entry, orgId);
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [projectId, setProjectId] = useState<string | null>(initial.projectId);
  const [rateId, setRateId] = useState<string | null>(initial.rateId);
  const [customer, setCustomer] = useState(initial.customer);
  const [task, setTask] = useState(initial.task);
  const [comment, setComment] = useState(initial.comment);
  const [project, setProject] = useState<Project | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [ratePickerOpen, setRatePickerOpen] = useState(false);
  const [markSheetOpen, setMarkSheetOpen] = useState(false);
  const [markKind, setMarkKind] = useState<"note" | "pause">("note");
  const [editingMark, setEditingMark] = useState<TimeEntryMark | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = entryFormDefaults(entry, orgId);
    setDate(d.date);
    setStart(d.start);
    setEnd(d.end);
    setProjectId(d.projectId);
    setRateId(d.rateId);
    setCustomer(d.customer);
    setTask(d.task);
    setComment(d.comment);
    setProject(null);
    setRate(null);
    setConfirmDelete(false);
  }, [open, entry?.id, orgId]);

  const activeOrgId = entry?.organization_id ?? orgId;

  const projectsQ = useQuery({
    queryKey: ["projects", activeOrgId, "include-inactive"],
    queryFn: () => fetchProjects(activeOrgId, true),
    enabled: !!activeOrgId && open,
  });
  const ratesQ = useQuery({
    queryKey: ["rates", activeOrgId, "include-inactive"],
    queryFn: () => fetchRates(activeOrgId, true),
    enabled: !!activeOrgId && open,
  });
  const marksQ = useQuery({
    queryKey: ["marks", "entry", entry?.id],
    queryFn: () => fetchMarksForEntries([entry!.id]),
    enabled: !!entry?.id && open,
  });

  useEffect(() => {
    if (!projectId) return setProject(null);
    const p = (projectsQ.data ?? []).find((x) => x.id === projectId);
    if (p) setProject(p);
  }, [projectId, projectsQ.data]);

  useEffect(() => {
    if (!rateId) return setRate(null);
    const r = (ratesQ.data ?? []).find((x) => x.id === rateId);
    if (r) setRate(r);
  }, [rateId, ratesQ.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return toast.error("Velg prosjekt");
    if (!task.trim()) return toast.error("Skriv inn oppgave");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      return;
    }
    const pauseMin = entry ? sumPauseMinutes(marksQ.data ?? []) : 0;
    const payload = {
      user_id: u.user.id,
      organization_id: activeOrgId,
      project_id: projectId,
      rate_id: rateId,
      date,
      start_time: start + ":00",
      end_time: end + ":00",
      break_minutes: pauseMin,
      customer: customer.trim() || null,
      task: task.trim(),
      comment: stripNexusCommentTag(comment) || null,
      source: entry?.source ?? ("manual" as const),
    };
    const res = entry
      ? await supabase.from("time_entries").update(payload).eq("id", entry.id)
      : await supabase.from("time_entries").insert(payload);
    if (res.error) {
      setBusy(false);
      return toast.error(res.error.message);
    }
    if (entry) {
      try {
        await syncEntryBreakFromMarks(entry.id);
      } catch {
        /* ignore — break already set from marks snapshot */
      }
    }
    setBusy(false);
    toast.success(entry ? "Oppdatert" : "Lagret");
    qc.invalidateQueries({ queryKey: ["entries"] });
    qc.invalidateQueries({ queryKey: ["marks"] });
    if (onSaved) onSaved();
    else onClose();
  }

  async function remove() {
    if (!entry) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("time_entries")
      .delete()
      .eq("id", entry.id)
      .select("id");
    setBusy(false);
    if (error) {
      setConfirmDelete(false);
      return toast.error(error.message);
    }
    if (!data?.length) {
      setConfirmDelete(false);
      return toast.error("Kunne ikke slette. Dette er kanskje ikke dine timer.");
    }
    toast.success("Slettet");
    qc.invalidateQueries({ queryKey: ["entries"] });
    onClose();
  }

  function openMark(kind: "note" | "pause", mark: TimeEntryMark | null = null) {
    setEditingMark(mark);
    setMarkKind(mark?.kind ?? kind);
    tryOpenSheet(() => setMarkSheetOpen(true));
  }

  if (!open) return null;

  return (
    <>
      <ContentSheet
        onClose={onClose}
        title={entry ? "Gå gjennom timeføring" : "Ny timeføring"}
        zClassName="z-[70]"
      >
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div
            data-sheet-scroll
            className="scroll-touch min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5"
          >
            <div className="min-w-0">
              <label className="text-xs text-muted-foreground">Dato</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${sheetFieldClass} mt-1`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className="text-xs text-muted-foreground">Start</label>
                <input
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={`${sheetFieldClass} mt-1`}
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs text-muted-foreground">Slutt</label>
                <input
                  type="time"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={`${sheetFieldClass} mt-1`}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Prosjekt</label>
              <button
                type="button"
                onClick={() => tryOpenSheet(() => setProjectPickerOpen(true))}
                className={`${sheetFieldClass} mt-1 text-left flex items-center justify-between`}
              >
                <span className={project || projectId ? "" : "text-muted-foreground"}>
                  {project?.name ??
                    (projectId
                      ? projectsQ.isLoading
                        ? "Laster prosjekt…"
                        : "Ukjent prosjekt — velg på nytt"
                      : "Velg prosjekt…")}
                </span>
              </button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Kunde (valgfri)</label>
              <input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Fritekst"
                className={`${sheetFieldClass} mt-1`}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Oppgave</label>
              <input
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Hva ble gjort?"
                required
                className={`${sheetFieldClass} mt-1`}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Sats (intern)</label>
              <button
                type="button"
                onClick={() => tryOpenSheet(() => setRatePickerOpen(true))}
                className={`${sheetFieldClass} mt-1 text-left flex items-center justify-between`}
              >
                <span className={rate || rateId ? "" : "text-muted-foreground"}>
                  {rate?.name ??
                    (rateId
                      ? ratesQ.isLoading
                        ? "Laster sats…"
                        : "Ukjent sats — velg på nytt"
                      : "Velg sats (valgfri)…")}
                </span>
                {rate && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {entry?.hourly_rate_snapshot ?? rate.amount} kr/t
                  </span>
                )}
              </button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Notater (valgfri)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ekstra notater til rapport"
                rows={3}
                className={`${sheetTextareaClass} mt-1`}
              />
            </div>

            {entry ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs text-muted-foreground">Logg</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => openMark("pause")}
                      className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium"
                    >
                      <Coffee className="h-4 w-4 text-primary" />
                      Pause
                    </button>
                    <button
                      type="button"
                      onClick={() => openMark("note")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium"
                    >
                      <BookmarkPlus className="h-4 w-4 text-primary" />
                      Merke
                    </button>
                  </div>
                </div>
                {(marksQ.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">Ingen merker ennå.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(marksQ.data ?? []).map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => openMark(m.kind, m)}
                          className="flex w-full gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-left text-sm"
                        >
                          <span className="shrink-0 font-semibold tabular-nums">
                            {formatMarkTime(m.marked_at)}
                          </span>
                          <span className="min-w-0 flex-1 text-muted-foreground">
                            {formatMarkLabel(m)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <SheetStickyFooter>
            {entry && confirmDelete ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Slette denne timeføringen?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="tap-target h-12 flex-1 border border-border bg-card"
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={busy}
                    className="tap-target h-12 flex-1 bg-destructive text-destructive-foreground disabled:opacity-60"
                  >
                    {busy ? "Sletter…" : "Slett"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                {entry ? (
                  <button
                    type="button"
                    onClick={() => void remove()}
                    className="tap-target bg-destructive/10 text-destructive border border-destructive/30 h-12 px-4"
                    aria-label="Slett"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 tap-target cta-brand bg-primary text-primary-foreground h-12 disabled:opacity-60"
                >
                  Lagre
                </button>
              </div>
            )}
          </SheetStickyFooter>
        </form>
      </ContentSheet>

      <ProjectPicker
        open={projectPickerOpen}
        onClose={() => setProjectPickerOpen(false)}
        orgId={activeOrgId}
        value={projectId}
        onChange={(id, p) => {
          setProjectId(id);
          setProject(p);
        }}
      />
      <RatePicker
        open={ratePickerOpen}
        onClose={() => setRatePickerOpen(false)}
        orgId={activeOrgId}
        value={rateId}
        allowClear
        onChange={(id, r) => {
          if (!id) {
            setRateId(null);
            setRate(null);
          } else {
            setRateId(id);
            setRate(r);
          }
        }}
      />
      {entry ? (
        <MarkSheet
          open={markSheetOpen}
          onClose={() => {
            setMarkSheetOpen(false);
            setEditingMark(null);
          }}
          orgId={activeOrgId}
          entryId={entry.id}
          mark={editingMark}
          initialKind={markKind}
        />
      ) : null}
    </>
  );
}
