import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchOrganizations,
  fetchTimeEntries,
  fetchWorkTypes,
  entryMinutes,
  formatDuration,
  startOfWeek,
} from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/timeliste")({
  head: () => ({ meta: [{ title: "Timer · Work Core" }] }),
  component: Timeliste,
});

function Timeliste() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"week" | "month" | "all">("week");
  const [open, setOpen] = useState(false);

  const range = useMemo(() => {
    if (filter === "week") return { from: startOfWeek() };
    if (filter === "month") {
      const d = new Date();
      return { from: new Date(d.getFullYear(), d.getMonth(), 1) };
    }
    return {};
  }, [filter]);

  const entriesQ = useQuery({
    queryKey: ["entries", filter],
    queryFn: () => fetchTimeEntries(range.from),
  });
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });
  const typesQ = useQuery({ queryKey: ["types-all"], queryFn: () => fetchWorkTypes() });

  const typesById = useMemo(() => {
    const m = new Map<string, string>();
    (typesQ.data ?? []).forEach((t) => m.set(t.id, t.name));
    return m;
  }, [typesQ.data]);
  const orgsById = useMemo(() => {
    const m = new Map<string, string>();
    (orgsQ.data ?? []).forEach((o) => m.set(o.id, o.name));
    return m;
  }, [orgsQ.data]);

  const entries = entriesQ.data ?? [];
  const total = entries.reduce((s, e) => s + entryMinutes(e), 0);

  async function remove(id: string) {
    if (!confirm("Slette denne timeføringen?")) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["entries"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Timer</h1>
        <button
          onClick={() => setOpen(true)}
          className="tap-target bg-primary text-primary-foreground h-11 px-4"
        >
          <Plus className="w-5 h-5 mr-1" />
          Legg til
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(["week", "month", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg ${
              filter === f ? "bg-card" : "text-muted-foreground"
            }`}
          >
            {f === "week" ? "Denne uka" : f === "month" ? "Måned" : "Alle"}
          </button>
        ))}
      </div>

      <div className="surface-card flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Totalt</span>
        <span className="text-2xl font-bold tabular-nums">{formatDuration(total)}</span>
      </div>

      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">Ingen timer registrert ennå.</p>
        )}
        {entries.map((e) => {
          const start = new Date(e.started_at);
          const end = new Date(e.ended_at);
          return (
            <div key={e.id} className="surface-card flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{start.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span>·</span>
                  <span>{orgsById.get(e.organization_id) ?? "—"}</span>
                </div>
                <div className="mt-1 font-medium">
                  {start.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  {" – "}
                  {end.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  {e.break_minutes ? <span className="text-muted-foreground text-sm"> · {e.break_minutes} min pause</span> : null}
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  {e.work_type_id && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent">{typesById.get(e.work_type_id) ?? "Type"}</span>
                  )}
                  <span className="text-sm font-semibold tabular-nums">{formatDuration(entryMinutes(e))}</span>
                </div>
                {e.comment && <p className="mt-1 text-sm text-muted-foreground">{e.comment}</p>}
              </div>
              <button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-destructive p-2" aria-label="Slett">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {open && (
        <ManualEntryModal
          onClose={() => setOpen(false)}
          orgs={orgsQ.data ?? []}
          types={typesQ.data ?? []}
        />
      )}
    </div>
  );
}

function ManualEntryModal({
  onClose,
  orgs,
  types,
}: {
  onClose: () => void;
  orgs: { id: string; name: string }[];
  types: { id: string; name: string; organization_id: string }[];
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [breakMin, setBreakMin] = useState(0);
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [typeId, setTypeId] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const filteredTypes = types.filter((t) => t.organization_id === orgId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return toast.error("Velg organisasjon");
    setBusy(true);
    const startISO = new Date(`${date}T${start}`).toISOString();
    const endISO = new Date(`${date}T${end}`).toISOString();
    if (new Date(endISO) <= new Date(startISO)) {
      setBusy(false);
      return toast.error("Sluttid må være etter starttid");
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("time_entries").insert({
      user_id: u.user.id,
      organization_id: orgId,
      work_type_id: typeId || null,
      started_at: startISO,
      ended_at: endISO,
      break_minutes: breakMin,
      comment: comment || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Lagret");
    qc.invalidateQueries({ queryKey: ["entries"] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end sm:items-center justify-center p-0 sm:p-6">
      <form onSubmit={save} className="w-full max-w-md surface-card rounded-b-none sm:rounded-2xl space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Ny timeføring</h2>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-muted-foreground">
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
          <select value={orgId} onChange={(e) => { setOrgId(e.target.value); setTypeId(""); }} className="w-full h-11 px-3 rounded-xl bg-input border border-border">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Arbeidstype</label>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border">
            <option value="">Ingen</option>
            {filteredTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Kommentar</label>
          <input value={comment} onChange={(e) => setComment(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-input border border-border" />
        </div>
        <button type="submit" disabled={busy} className="w-full tap-target bg-primary text-primary-foreground">
          Lagre
        </button>
      </form>
    </div>
  );
}
