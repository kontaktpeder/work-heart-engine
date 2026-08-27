import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Play, Square, Sparkles, List, BarChart3, BookmarkPlus, Coffee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  attachMarksToEntry,
  fetchActiveSession,
  fetchMarksForSession,
  fetchProjects,
  fetchRates,
  fetchTimeEntries,
  formatDuration,
  entryMinutes,
  sumPauseMinutes,
  type Project,
  type Rate,
  type TimeEntry,
  type TimeEntryMark,
} from "@/lib/work-core";
import { startOfDay } from "@/lib/time-utils";
import { formatMarkLabel, formatMarkTime } from "@/lib/marks";
import { ProjectPicker } from "@/components/project-picker";
import { RatePicker } from "@/components/rate-picker";
import { MarkSheet } from "@/components/mark-sheet";
import { TimeEntrySheet } from "@/components/time-entry-sheet";
import { Button } from "@/components/ui/button";
import { seedWorkDemoData } from "@/lib/demo-seed.functions";
import { tryOpenSheet } from "@/lib/sheetGate";
import { sheetFieldClass } from "@/lib/sheetField";
import { revealFocusedField } from "@/lib/focusSheetField";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/start")({
  head: () => ({ meta: [{ title: "Start · Work Core" }] }),
  component: () => null,
});

const orgRoute = getRouteApi("/_authenticated/orgs/$orgId");
const authRoute = getRouteApi("/_authenticated");

const ENTRY_SELECT =
  "id, user_id, organization_id, project_id, rate_id, hourly_rate_snapshot, date, start_time, end_time, break_minutes, total_minutes, hourly_rate, amount, comment, customer, task, source, started_at, ended_at";

type StartPaneProps = {
  onOpenTimer?: () => void;
  onOpenReports?: () => void;
};

export function StartPane({ onOpenTimer, onOpenReports }: StartPaneProps) {
  const { org, orgId } = orgRoute.useRouteContext();
  const { user } = authRoute.useRouteContext() as {
    user: { id: string; email?: string; user_metadata?: { full_name?: string } };
  };
  const qc = useQueryClient();
  const seedFn = useServerFn(seedWorkDemoData);

  const sessionQ = useQuery({
    queryKey: ["session"],
    queryFn: fetchActiveSession,
    staleTime: 15_000,
  });
  const today = startOfDay();
  const entriesQ = useQuery({
    queryKey: ["entries", orgId, "today"],
    queryFn: () => fetchTimeEntries({ from: today, orgId }),
    staleTime: 30_000,
  });
  const projectsQ = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => fetchProjects(orgId),
    staleTime: 60_000,
  });
  const ratesQ = useQuery({
    queryKey: ["rates", orgId],
    queryFn: () => fetchRates(orgId),
    staleTime: 60_000,
  });
  const recentEntriesQ = useQuery({
    queryKey: ["entries", orgId, "recent"],
    queryFn: () => fetchTimeEntries({ orgId }),
    staleTime: 30_000,
  });

  const seedMut = useMutation({
    mutationFn: () => seedFn({ data: { organizationId: orgId } }),
    onSuccess: (res) => {
      if (res.seeded) {
        toast.success(`La til ${res.count} demotimer`);
        void qc.invalidateQueries({ queryKey: ["entries", orgId] });
        void qc.invalidateQueries({ queryKey: ["projects", orgId] });
      } else {
        toast.message("Demodata er allerede lagt inn");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeSession = sessionQ.data;
  const activeInThisOrg = activeSession && activeSession.organization_id === orgId;

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!activeInThisOrg) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeInThisOrg]);

  const elapsedMin = activeInThisOrg
    ? Math.floor((Date.now() - new Date(activeSession!.started_at).getTime()) / 60000)
    : 0;

  const todayMin = useMemo(
    () => (entriesQ.data ?? []).reduce((sum, e) => sum + entryMinutes(e), 0),
    [entriesQ.data],
  );

  const [projectId, setProjectId] = useState<string | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [customer, setCustomer] = useState("");
  const [task, setTask] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [ratePickerOpen, setRatePickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [markSheetOpen, setMarkSheetOpen] = useState(false);
  const [markKind, setMarkKind] = useState<"note" | "pause">("note");
  const [editingMark, setEditingMark] = useState<TimeEntryMark | null>(null);
  const [reviewEntry, setReviewEntry] = useState<TimeEntry | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const hydratedSessionId = useRef<string | null>(null);

  const marksQ = useQuery({
    queryKey: ["marks", "session", activeSession?.id],
    queryFn: () => fetchMarksForSession(activeSession!.id),
    enabled: !!activeInThisOrg && !!activeSession?.id,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!activeInThisOrg || !activeSession) {
      hydratedSessionId.current = null;
      return;
    }
    if (hydratedSessionId.current === activeSession.id) return;
    hydratedSessionId.current = activeSession.id;
    if (activeSession.project_id) setProjectId(activeSession.project_id);
    if (activeSession.rate_id) setRateId(activeSession.rate_id);
    setCustomer(activeSession.customer ?? "");
    setTask(activeSession.task ?? "");
  }, [
    activeInThisOrg,
    activeSession?.id,
    activeSession?.project_id,
    activeSession?.rate_id,
    activeSession?.customer,
    activeSession?.task,
  ]);

  useEffect(() => {
    const pid = projectId ?? (activeInThisOrg ? activeSession!.project_id : null);
    if (!pid) return setProject(null);
    const p = (projectsQ.data ?? []).find((x) => x.id === pid);
    if (p) setProject(p);
  }, [projectId, activeSession, activeInThisOrg, projectsQ.data]);

  useEffect(() => {
    if (!rateId) return setRate(null);
    const r = (ratesQ.data ?? []).find((x) => x.id === rateId);
    if (r) setRate(r);
  }, [rateId, ratesQ.data]);

  async function startWork() {
    if (!projectId) return toast.error("Velg prosjekt");
    if (!task.trim()) return toast.error("Skriv inn oppgave");
    setBusy(true);
    const { error } = await supabase.from("work_sessions").insert({
      user_id: user.id,
      organization_id: orgId,
      project_id: projectId,
      rate_id: rateId,
      comment: null,
      customer: customer.trim() || null,
      task: task.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["session"] });
  }

  async function stopWork() {
    if (!activeInThisOrg) return;
    setBusy(true);
    const start = new Date(activeSession!.started_at);
    const end = new Date();
    const pid = projectId ?? activeSession!.project_id;
    const rid = rateId ?? activeSession!.rate_id;
    const sessionCustomer = customer.trim() || activeSession!.customer || null;
    const sessionTask = task.trim() || activeSession!.task || null;
    const pauseMin = sumPauseMinutes(marksQ.data ?? []);

    const { data: inserted, error: insErr } = await supabase
      .from("time_entries")
      .insert({
        user_id: activeSession!.user_id,
        organization_id: orgId,
        project_id: pid,
        rate_id: rid,
        date: start.toISOString().slice(0, 10),
        start_time: start.toTimeString().slice(0, 8),
        end_time: end.toTimeString().slice(0, 8),
        break_minutes: pauseMin,
        comment: null,
        customer: sessionCustomer,
        task: sessionTask,
        source: "timer",
      })
      .select(ENTRY_SELECT)
      .single();
    if (insErr || !inserted) {
      setBusy(false);
      return toast.error(insErr?.message ?? "Kunne ikke lagre");
    }
    try {
      await attachMarksToEntry(activeSession!.id, inserted.id);
    } catch (e) {
      setBusy(false);
      return toast.error(e instanceof Error ? e.message : "Kunne ikke knytte merker");
    }
    const { error: delErr } = await supabase
      .from("work_sessions")
      .delete()
      .eq("id", activeSession!.id);
    setBusy(false);
    if (delErr) return toast.error(delErr.message);
    setProjectId(null);
    setRateId(null);
    setCustomer("");
    setTask("");
    void qc.invalidateQueries({ queryKey: ["session"] });
    void qc.invalidateQueries({ queryKey: ["entries"] });
    void qc.invalidateQueries({ queryKey: ["marks"] });
    setReviewEntry(inserted as TimeEntry);
    tryOpenSheet(() => setReviewOpen(true));
  }

  function openMark(kind: "note" | "pause", mark: TimeEntryMark | null = null) {
    setEditingMark(mark);
    setMarkKind(mark?.kind ?? kind);
    tryOpenSheet(() => setMarkSheetOpen(true));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onOpenTimer?.()}
          className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 font-display text-xs font-bold uppercase tracking-[0.12em]"
        >
          <List className="h-3.5 w-3.5 text-primary" /> Timer
        </button>
        <button
          type="button"
          onClick={() => onOpenReports?.()}
          className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 font-display text-xs font-bold uppercase tracking-[0.12em]"
        >
          <BarChart3 className="h-3.5 w-3.5 text-primary" /> Rapport
        </button>
      </div>

      {(recentEntriesQ.data?.length ?? 0) === 0 && org.owner_id === user.id ? (
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2">
          <p className="min-w-0 truncate text-xs text-muted-foreground">Ingen timer ennå.</p>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 gap-1 px-2 text-xs"
            disabled={seedMut.isPending}
            onClick={() => seedMut.mutate()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {seedMut.isPending ? "Legger inn…" : "Demodata"}
          </Button>
        </div>
      ) : null}

      {activeSession && !activeInThisOrg ? (
        <div className="surface-card shrink-0 border-destructive/40 text-sm">
          Du har en aktiv økt i en annen organisasjon. Bytt org for å stoppe den.
        </div>
      ) : null}

      {activeInThisOrg ? (
        <div className="work-card-soft-land surface-card surface-live flex min-h-0 flex-1 flex-col gap-2 overflow-hidden !p-3">
          <div className="shrink-0 text-center">
            <p className="stamp inline-flex items-center gap-2 text-muted-foreground">
              <span className="live-dot" />
              Du jobber
            </p>
            <p className="clock-face mt-1.5 text-4xl text-primary">{formatDuration(elapsedMin)}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {project?.name ?? "—"}
              {task ? ` · ${task}` : ""}
              {rate ? ` · ${rate.name}` : ""} · start{" "}
              {new Date(activeSession!.started_at).toLocaleTimeString("nb-NO", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => tryOpenSheet(() => setProjectPickerOpen(true))}
              className="h-9 truncate rounded-md border border-border bg-input px-2.5 text-left text-sm"
            >
              <span className={project ? "" : "text-muted-foreground"}>
                {project?.name ?? "Prosjekt…"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => tryOpenSheet(() => setRatePickerOpen(true))}
              className="h-9 truncate rounded-md border border-border bg-input px-2.5 text-left text-sm"
            >
              <span className={rate ? "" : "text-muted-foreground"}>{rate?.name ?? "Sats…"}</span>
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Logg</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => openMark("pause")}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium"
                >
                  <Coffee className="h-3.5 w-3.5 text-primary" />
                  Pause
                </button>
                <button
                  type="button"
                  onClick={() => openMark("note")}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium"
                >
                  <BookmarkPlus className="h-3.5 w-3.5 text-primary" />
                  Merke
                </button>
              </div>
            </div>
            {(marksQ.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                Pause eller merke underveis — følger med i rapporten.
              </p>
            ) : (
              <ul
                data-org-stack-scroll
                className="scroll-touch min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain"
              >
                {(marksQ.data ?? []).map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => openMark(m.kind, m)}
                      className="flex w-full gap-2 rounded-lg px-1 py-1 text-left text-sm"
                    >
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatMarkTime(m.marked_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {formatMarkLabel(m)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={stopWork}
            disabled={busy}
            className="cta-brand inline-flex h-10 w-full shrink-0 items-center justify-center bg-destructive text-sm text-destructive-foreground disabled:opacity-60"
          >
            <Square className="mr-2 h-4 w-4" fill="currentColor" />
            {busy ? "Stopper…" : "Stopp arbeid"}
          </button>
        </div>
      ) : (
        <div className="surface-card shrink-0 space-y-1.5 !p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => tryOpenSheet(() => setProjectPickerOpen(true))}
              aria-label="Prosjekt"
              className="flex h-9 min-w-0 items-center rounded-md border border-border bg-input px-2.5 text-left text-sm"
            >
              <span className={`truncate ${project ? "" : "text-muted-foreground"}`}>
                {project?.name ?? "Prosjekt"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => tryOpenSheet(() => setRatePickerOpen(true))}
              aria-label="Sats"
              className="flex h-9 min-w-0 items-center justify-between gap-1 rounded-md border border-border bg-input px-2.5 text-left text-sm"
            >
              <span className={`truncate ${rate ? "" : "text-muted-foreground"}`}>
                {rate?.name ?? "Sats"}
              </span>
              {rate ? (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {rate.amount}
                </span>
              ) : null}
            </button>
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              onFocus={(e) => revealFocusedField(e.currentTarget)}
              placeholder="Kunde"
              aria-label="Kunde"
              className={`${sheetFieldClass} !h-9 !px-2.5 !py-0`}
            />
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onFocus={(e) => revealFocusedField(e.currentTarget)}
              placeholder="Oppgave"
              aria-label="Oppgave"
              className={`${sheetFieldClass} !h-9 !px-2.5 !py-0`}
            />
          </div>

          <button
            onClick={startWork}
            disabled={busy || !projectId || !task.trim() || !!activeSession}
            className="cta-brand inline-flex h-9 w-full items-center justify-center bg-primary text-sm text-primary-foreground disabled:opacity-60"
          >
            <Play className="mr-2 h-4 w-4" fill="currentColor" />
            Start arbeid
          </button>
        </div>
      )}

      <div className="surface-card mt-auto shrink-0 !px-3 !py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="stamp truncate text-muted-foreground">I dag · {org.name}</span>
          <span className="clock-face text-lg">{formatDuration(todayMin)}</span>
        </div>
      </div>

      <ProjectPicker
        open={projectPickerOpen}
        onClose={() => setProjectPickerOpen(false)}
        orgId={orgId}
        value={projectId ?? (activeInThisOrg ? activeSession!.project_id : null)}
        onChange={(id, p) => {
          setProjectId(id);
          setProject(p);
        }}
      />
      <RatePicker
        open={ratePickerOpen}
        onClose={() => setRatePickerOpen(false)}
        orgId={orgId}
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
          if (activeInThisOrg && activeSession) {
            void supabase
              .from("work_sessions")
              .update({ rate_id: id })
              .eq("id", activeSession.id)
              .then(({ error }) => {
                if (error) toast.error(error.message);
                else void qc.invalidateQueries({ queryKey: ["session"] });
              });
          }
        }}
      />
      <MarkSheet
        open={markSheetOpen}
        onClose={() => {
          setMarkSheetOpen(false);
          setEditingMark(null);
        }}
        orgId={orgId}
        sessionId={activeInThisOrg ? activeSession!.id : null}
        mark={editingMark}
        initialKind={markKind}
      />
      <TimeEntrySheet
        key={reviewEntry?.id ?? "review"}
        open={reviewOpen}
        onClose={() => {
          setReviewOpen(false);
          setReviewEntry(null);
        }}
        onSaved={() => {
          setReviewOpen(false);
          setReviewEntry(null);
          onOpenTimer?.();
        }}
        entry={reviewEntry}
        orgId={orgId}
      />
    </div>
  );
}
