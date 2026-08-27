import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TimeEntryMark } from "@/lib/work-core";
import { ContentSheet } from "./content-sheet";
import { SheetStickyFooter } from "./sheet-sticky-footer";
import { sheetFieldClass, sheetTextareaClass } from "@/lib/sheetField";
import { localDateTimeToIso, markFormDefaults } from "@/lib/marks";

type Props = {
  open: boolean;
  onClose: () => void;
  orgId: string;
  sessionId?: string | null;
  entryId?: string | null;
  mark?: TimeEntryMark | null;
  /** Prefer pause UI when creating a new mark */
  initialKind?: "note" | "pause";
};

export function MarkSheet({
  open,
  onClose,
  orgId,
  sessionId,
  entryId,
  mark,
  initialKind = "note",
}: Props) {
  const qc = useQueryClient();
  const initial = markFormDefaults(mark, new Date(), initialKind);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [note, setNote] = useState(initial.note);
  const [kind, setKind] = useState<"note" | "pause">(initial.kind);
  const [pauseMinutes, setPauseMinutes] = useState(initial.pauseMinutes);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = markFormDefaults(mark, new Date(), initialKind);
    setDate(d.date);
    setTime(d.time);
    setNote(d.note);
    setKind(d.kind);
    setPauseMinutes(d.pauseMinutes);
  }, [open, mark?.id, initialKind]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId && !entryId && !mark) {
      return toast.error("Mangler økt eller timeføring");
    }
    if (kind === "pause") {
      if (!pauseMinutes || pauseMinutes < 1) return toast.error("Oppgi pause i minutter");
    } else if (!note.trim()) {
      return toast.error("Skriv et kort notat");
    }

    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      return;
    }
    const marked_at = localDateTimeToIso(date, time);
    if (Number.isNaN(new Date(marked_at).getTime())) {
      setBusy(false);
      return toast.error("Ugyldig tidspunkt");
    }

    const payload = {
      marked_at,
      kind,
      note: kind === "pause" ? `Pause ${pauseMinutes} min` : note.trim(),
      pause_minutes: kind === "pause" ? pauseMinutes : null,
    };

    if (mark) {
      const { error } = await supabase.from("time_entry_marks").update(payload).eq("id", mark.id);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Merke oppdatert");
    } else {
      const { error } = await supabase.from("time_entry_marks").insert({
        user_id: u.user.id,
        organization_id: orgId,
        work_session_id: sessionId ?? null,
        time_entry_id: entryId ?? null,
        ...payload,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success(kind === "pause" ? "Pause lagret" : "Merke lagret");
    }
    void qc.invalidateQueries({ queryKey: ["marks"] });
    if (entryId || mark?.time_entry_id) {
      void qc.invalidateQueries({ queryKey: ["entries"] });
    }
    onClose();
  }

  async function remove() {
    if (!mark) return;
    if (!confirm("Slette dette merket?")) return;
    const { error } = await supabase.from("time_entry_marks").delete().eq("id", mark.id);
    if (error) return toast.error(error.message);
    toast.success("Slettet");
    void qc.invalidateQueries({ queryKey: ["marks"] });
    onClose();
  }

  if (!open) return null;

  return (
    <ContentSheet
      onClose={onClose}
      title={
        mark
          ? kind === "pause"
            ? "Rediger pause"
            : "Rediger merke"
          : kind === "pause"
            ? "Pause"
            : "Nytt merke"
      }
      zClassName="z-[95]"
      detents={["full"]}
      initialDetent="full"
    >
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div
          data-sheet-scroll
          className="scroll-touch min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5"
        >
          {!mark ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind("note")}
                className={`rounded-md border px-3 py-2.5 text-sm font-medium ${
                  kind === "note" ? "border-primary bg-primary/10" : "border-border bg-card"
                }`}
              >
                Merke
              </button>
              <button
                type="button"
                onClick={() => setKind("pause")}
                className={`rounded-md border px-3 py-2.5 text-sm font-medium ${
                  kind === "pause" ? "border-primary bg-primary/10" : "border-border bg-card"
                }`}
              >
                Pause
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="text-xs text-muted-foreground">Dato</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${sheetFieldClass} mt-1`}
              />
            </div>
            <div className="min-w-0">
              <label className="text-xs text-muted-foreground">Tid</label>
              <input
                type="time"
                step={60}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={`${sheetFieldClass} mt-1`}
              />
            </div>
          </div>

          {kind === "pause" ? (
            <div>
              <label className="text-xs text-muted-foreground">Pause (min)</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={pauseMinutes}
                onChange={(e) => setPauseMinutes(Math.max(1, parseInt(e.target.value) || 0))}
                className={`${sheetFieldClass} mt-1`}
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground">Hva skjedde?</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onFocus={(e) => {
                  const el = e.currentTarget;
                  window.setTimeout(() => {
                    el.scrollIntoView({ block: "center", behavior: "smooth" });
                  }, 80);
                }}
                placeholder="F.eks. Ankomst Hellbillies"
                rows={3}
                enterKeyHint="done"
                className={`${sheetTextareaClass} mt-1`}
              />
            </div>
          )}
        </div>
        <SheetStickyFooter>
          <div className="flex gap-2">
            {mark ? (
              <button
                type="button"
                onClick={remove}
                className="tap-target h-12 px-4 text-destructive"
                aria-label="Slett"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="tap-target cta-brand h-12 flex-1 bg-primary text-primary-foreground disabled:opacity-60"
            >
              {busy
                ? "Lagrer…"
                : kind === "pause"
                  ? "Lagre pause"
                  : mark
                    ? "Lagre"
                    : "Legg til merke"}
            </button>
          </div>
        </SheetStickyFooter>
      </form>
    </ContentSheet>
  );
}
