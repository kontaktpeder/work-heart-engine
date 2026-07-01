import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchActiveSession,
  fetchDefaultOrgId,
  fetchOrganizations,
  fetchProjects,
  fetchRates,
  fetchTimeEntries,
  formatDuration,
  entryMinutes,
  setDefaultOrgId,
  type Project,
  type Rate,
} from "@/lib/work-core";
import { startOfDay } from "@/lib/time-utils";
import { ProjectPicker } from "@/components/project-picker";
import { RatePicker } from "@/components/rate-picker";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Start · Work Core" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });
  const sessionQ = useQuery({ queryKey: ["session"], queryFn: fetchActiveSession });
  const today = startOfDay();
  const entriesQ = useQuery({
    queryKey: ["entries", "today"],
    queryFn: () => fetchTimeEntries({ from: today }),
  });

  const orgs = orgsQ.data ?? [];
  const [orgId, setOrgId] = useState<string>("");
  useEffect(() => {
    if (!orgId && orgs.length) setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  const projectsQ = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => fetchProjects(orgId),
    enabled: !!orgId,
  });
  const ratesQ = useQuery({
    queryKey: ["rates", orgId],
    queryFn: () => fetchRates(orgId),
    enabled: !!orgId,
  });

  const activeSession = sessionQ.data;

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  const elapsedMin = activeSession
    ? Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 60000)
    : 0;

  const todayMin = useMemo(
    () => (entriesQ.data ?? []).reduce((sum, e) => sum + entryMinutes(e), 0),
    [entriesQ.data],
  );

  const [comment, setComment] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [ratePickerOpen, setRatePickerOpen] = useState(false);
  const [breakMin, setBreakMin] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const pid = projectId ?? activeSession?.project_id ?? null;
    if (!pid) {
      setProject(null);
      return;
    }
    const p = (projectsQ.data ?? []).find((x) => x.id === pid);
    if (p) setProject(p);
  }, [projectId, activeSession, projectsQ.data]);

  useEffect(() => {
    if (!rateId) {
      setRate(null);
      return;
    }
    const r = (ratesQ.data ?? []).find((x) => x.id === rateId);
    if (r) setRate(r);
  }, [rateId, ratesQ.data]);

  const greeting =
    user.user_metadata?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "der";

  async function startWork() {
    if (!orgId) return toast.error("Velg organisasjon");
    if (!projectId) return toast.error("Velg prosjekt");
    setBusy(true);
    const { error } = await supabase.from("work_sessions").insert({
      user_id: user.id,
      organization_id: orgId,
      project_id: projectId,
      comment: comment || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setComment("");
    qc.invalidateQueries({ queryKey: ["session"] });
  }

  async function stopWork() {
    if (!activeSession) return;
    setBusy(true);
    const start = new Date(activeSession.started_at);
    const end = new Date();
    const pid = projectId ?? activeSession.project_id;
    const { error: insErr } = await supabase.from("time_entries").insert({
      user_id: activeSession.user_id,
      organization_id: activeSession.organization_id,
      project_id: pid,
      rate_id: rateId,
      date: start.toISOString().slice(0, 10),
      start_time: start.toTimeString().slice(0, 8),
      end_time: end.toTimeString().slice(0, 8),
      break_minutes: breakMin,
      comment: comment || activeSession.comment,
      source: "timer",
    });
    if (insErr) {
      setBusy(false);
      return toast.error(insErr.message);
    }
    const { error: delErr } = await supabase
      .from("work_sessions")
      .delete()
      .eq("id", activeSession.id);
    setBusy(false);
    if (delErr) return toast.error(delErr.message);
    setComment("");
    setBreakMin(0);
    setProjectId(null);
    setRateId(null);
    toast.success("Timeføring lagret");
    qc.invalidateQueries({ queryKey: ["session"] });
    qc.invalidateQueries({ queryKey: ["entries"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Hei,</p>
        <h1 className="text-3xl font-bold capitalize">{greeting}.</h1>
      </div>

      {activeSession ? (
        <div className="surface-card text-center space-y-5 border-primary/40">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Du jobber</p>
            <p className="mt-2 text-5xl font-bold tabular-nums">{formatDuration(elapsedMin)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {project?.name ?? "—"} · startet kl.{" "}
              {new Date(activeSession.started_at).toLocaleTimeString("nb-NO", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <div className="space-y-2 text-left">
            <label className="text-xs text-muted-foreground">Prosjekt</label>
            <button
              type="button"
              onClick={() => setProjectPickerOpen(true)}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border text-left"
            >
              {project?.name ?? "Velg prosjekt…"}
            </button>

            <label className="text-xs text-muted-foreground mt-2 block">Sats</label>
            <button
              type="button"
              onClick={() => setRatePickerOpen(true)}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border text-left flex items-center justify-between"
            >
              <span className={rate ? "" : "text-muted-foreground"}>
                {rate?.name ?? "Velg sats (valgfri)…"}
              </span>
              {rate && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {rate.amount} kr/t
                </span>
              )}
            </button>

            <label className="text-xs text-muted-foreground mt-2 block">Pause (min)</label>
            <input
              type="number"
              min={0}
              value={breakMin}
              onChange={(e) => setBreakMin(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border"
            />

            <label className="text-xs text-muted-foreground mt-2 block">Kommentar</label>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Hva gjorde du?"
              className="w-full h-11 px-3 rounded-xl bg-input border border-border"
            />
          </div>

          <button
            onClick={stopWork}
            disabled={busy}
            className="w-full tap-target bg-destructive text-destructive-foreground text-lg h-16 disabled:opacity-60"
          >
            <Square className="w-5 h-5 mr-2" fill="currentColor" />
            Stopp arbeid
          </button>
        </div>
      ) : (
        <div className="surface-card space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Organisasjon</label>
            <select
              value={orgId}
              onChange={(e) => {
                setOrgId(e.target.value);
                setProjectId(null);
                setProject(null);
                setRateId(null);
                setRate(null);
              }}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            <label className="text-xs text-muted-foreground mt-2 block">Prosjekt</label>
            <button
              type="button"
              onClick={() => setProjectPickerOpen(true)}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border text-left flex items-center justify-between"
            >
              <span className={project ? "" : "text-muted-foreground"}>
                {project?.name ?? "Velg prosjekt…"}
              </span>
            </button>

            <label className="text-xs text-muted-foreground mt-2 block">Sats (valgfri)</label>
            <button
              type="button"
              onClick={() => setRatePickerOpen(true)}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border text-left flex items-center justify-between"
            >
              <span className={rate ? "" : "text-muted-foreground"}>
                {rate?.name ?? "Velg sats…"}
              </span>
              {rate && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {rate.amount} kr/t
                </span>
              )}
            </button>

            <label className="text-xs text-muted-foreground mt-2 block">Kommentar (valgfri)</label>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border"
            />
          </div>

          <button
            onClick={startWork}
            disabled={busy || !orgId || !projectId}
            className="w-full tap-target bg-primary text-primary-foreground text-lg h-16 disabled:opacity-60"
          >
            <Play className="w-6 h-6 mr-2" fill="currentColor" />
            Start arbeid
          </button>
        </div>
      )}

      <div className="surface-card">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">I dag</span>
          <span className="text-2xl font-bold tabular-nums">{formatDuration(todayMin)}</span>
        </div>
      </div>

      <ProjectPicker
        open={projectPickerOpen}
        onClose={() => setProjectPickerOpen(false)}
        orgId={orgId}
        value={projectId ?? activeSession?.project_id ?? null}
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
        }}
      />
    </div>
  );
}
