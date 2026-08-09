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
  /** Active session (mark while working) */
  sessionId?: string | null;
  /** Completed entry (mark after the fact) */
  entryId?: string | null;
  mark?: TimeEntryMark | null;
};

export function MarkSheet({
  open,
  onClose,
  orgId,
  sessionId,
  entryId,
  mark,
}: Props) {
  const qc = useQueryClient();
  const initial = markFormDefaults(mark);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [note, setNote] = useState(initial.note);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = markFormDefaults(mark);
    setDate(d.date);
    setTime(d.time);
    setNote(d.note);
  }, [open, mark?.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const text = note.trim();
    if (!text) return toast.error("Skriv et kort notat");
    if (!sessionId && !entryId && !mark) {
      return toast.error("Mangler økt eller timeføring");
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

    if (mark) {
      const { error } = await supabase
        .from("time_entry_marks")
        .update({ marked_at, note: text })
        .eq("id", mark.id);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Merke oppdatert");
    } else {
      const { error } = await supabase.from("time_entry_marks").insert({
        user_id: u.user.id,
        organization_id: orgId,
        work_session_id: sessionId ?? null,
        time_entry_id: entryId ?? null,
        marked_at,
        note: text,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Merke lagret");
    }
    void qc.invalidateQueries({ queryKey: ["marks"] });
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
      title={mark ? "Rediger merke" : "Nytt merke"}
      zClassName="z-[80]"
      detents={["half", "full"]}
    >
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div
          data-sheet-scroll
          className="scroll-touch min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5"
        >
          <p className="text-sm text-muted-foreground">
            Sett tidspunktet til et helt tall (f.eks. 17:30) — samme som når du redigerer timer.
          </p>
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
          <div>
            <label className="text-xs text-muted-foreground">Hva skjedde?</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="F.eks. Ankomst Hellbillies"
              rows={3}
              className={`${sheetTextareaClass} mt-1`}
            />
          </div>
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
              className="tap-target h-12 flex-1 bg-primary text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Lagrer…" : mark ? "Lagre" : "Legg til merke"}
            </button>
          </div>
        </SheetStickyFooter>
      </form>
    </ContentSheet>
  );
}
