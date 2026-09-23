import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjects, type Project } from "@/lib/work-core";
import { listOrganizationMembers } from "@/lib/members.functions";
import { isOrgAdmin, type OrgMembership } from "@/lib/org-access";
import { clockInputValue } from "@/lib/schedule-times.mjs";
import { ContentSheet } from "@/components/content-sheet";
import { tryOpenSheet } from "@/lib/sheetGate";
import { sheetFieldClass, sheetTextareaClass } from "@/lib/sheetField";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/schedule")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/orgs/$orgId/start",
      params: { orgId: params.orgId },
      search: { ...(search as object), sheet: "schedule" },
    });
  },
  component: () => null,
});

const orgRoute = getRouteApi("/_authenticated/orgs/$orgId");
const authRoute = getRouteApi("/_authenticated");

type ShiftRow = {
  id: string;
  assignee_user_id: string;
  assignee_name: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  comment: string | null;
};

type DayRow = {
  id: string;
  name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  project_id: string | null;
  break_minutes: number;
  comment: string | null;
  shift_assignments: ShiftRow[];
};

type MyShift = {
  id: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  comment: string | null;
  production_days: {
    id: string;
    name: string;
    event_date: string;
    location: string | null;
    start_time: string;
    end_time: string;
  } | null;
};

type MemberOption = {
  userId: string;
  role: string;
  email: string | null;
  reportEmployeeName: string | null;
};

type DraftAssignee = {
  userId: string;
  name: string;
  start: string;
  end: string;
  breakMinutes: string;
};

function memberLabel(member: MemberOption): string {
  return member.reportEmployeeName?.trim() || member.email || "Medlem";
}

function formatWhen(date: string, start: string, end: string): string {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${day} · ${clockInputValue(start)}–${clockInputValue(end)}`;
}

async function fetchPlan(orgId: string): Promise<DayRow[]> {
  const { data, error } = await supabase
    .from("production_days")
    .select(
      "id, name, event_date, start_time, end_time, location, project_id, break_minutes, comment, shift_assignments(id, assignee_user_id, assignee_name, start_time, end_time, break_minutes, comment)",
    )
    .eq("organization_id", orgId)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DayRow[];
}

async function fetchMyShifts(orgId: string, userId: string): Promise<MyShift[]> {
  const { data, error } = await supabase
    .from("shift_assignments")
    .select(
      "id, start_time, end_time, break_minutes, comment, production_days(id, name, event_date, location, start_time, end_time)",
    )
    .eq("organization_id", orgId)
    .eq("assignee_user_id", userId);
  if (error) throw error;
  const rows = (data ?? []) as MyShift[];
  return rows.sort((a, b) =>
    (a.production_days?.event_date ?? "").localeCompare(b.production_days?.event_date ?? ""),
  );
}

export function SchedulePane() {
  const { orgId, membership } = orgRoute.useRouteContext() as {
    orgId: string;
    membership: OrgMembership | null;
  };
  const { user } = authRoute.useRouteContext() as { user: { id: string } };
  const leader = isOrgAdmin(membership?.role);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DayRow | null>(null);
  const [open, setOpen] = useState(false);

  const planQ = useQuery({
    queryKey: ["schedule", orgId, "plan"],
    queryFn: () => fetchPlan(orgId),
    enabled: leader,
  });
  const mineQ = useQuery({
    queryKey: ["schedule", orgId, "mine", user.id],
    queryFn: () => fetchMyShifts(orgId, user.id),
    enabled: !leader,
  });

  async function removeDay(day: DayRow) {
    if (!confirm(`Slette produksjonsdagen «${day.name}» og vaktene på den?`)) return;
    const { error } = await supabase.from("production_days").delete().eq("id", day.id);
    if (error) return toast.error(error.message);
    toast.success("Slettet");
    void qc.invalidateQueries({ queryKey: ["schedule", orgId] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {leader ? "Hele bemanningen. Endringer gjøres her." : "Dine planlagte vakter."}
        </p>
        {leader ? (
          <button
            type="button"
            onClick={() =>
              tryOpenSheet(() => {
                setEditing(null);
                setOpen(true);
              })
            }
            className="cta-brand tap-target inline-flex h-11 items-center bg-primary px-4 text-primary-foreground"
          >
            <Plus className="mr-1 h-5 w-5" />
            Ny
          </button>
        ) : null}
      </div>

      {(leader ? planQ.isLoading : mineQ.isLoading) ? (
        <p className="text-sm text-muted-foreground">Laster vakter…</p>
      ) : null}
      {(leader ? planQ.isError : mineQ.isError) ? (
        <p className="text-sm text-destructive">
          {(leader ? planQ.error : mineQ.error) instanceof Error
            ? (leader ? planQ.error : mineQ.error)?.message
            : "Kunne ikke hente vakter"}
        </p>
      ) : null}

      {leader ? (
        <div className="space-y-2">
          {(planQ.data ?? []).map((day) => (
            <article key={day.id} className="surface-card space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{day.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(day.event_date, day.start_time, day.end_time)}
                    {day.location ? ` · ${day.location}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <button
                    type="button"
                    aria-label="Rediger"
                    className="p-2 text-muted-foreground"
                    onClick={() =>
                      tryOpenSheet(() => {
                        setEditing(day);
                        setOpen(true);
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Slett"
                    className="p-2 text-muted-foreground hover:text-destructive"
                    onClick={() => void removeDay(day)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {day.shift_assignments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ingen er satt opp.</p>
              ) : (
                <ul className="space-y-1">
                  {day.shift_assignments.map((shift) => (
                    <li key={shift.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{shift.assignee_name || "Uten navn"}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {clockInputValue(shift.start_time)}–{clockInputValue(shift.end_time)}
                        {shift.break_minutes ? ` · ${shift.break_minutes} min pause` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {planQ.data?.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Ingen produksjonsdager ennå.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {(mineQ.data ?? []).map((shift) => (
            <article key={shift.id} className="surface-card p-4">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="font-medium">{shift.production_days?.name ?? "Vakt"}</p>
                  <p className="text-sm text-muted-foreground">
                    {shift.production_days
                      ? formatWhen(
                          shift.production_days.event_date,
                          shift.start_time,
                          shift.end_time,
                        )
                      : `${clockInputValue(shift.start_time)}–${clockInputValue(shift.end_time)}`}
                  </p>
                  {shift.production_days?.location ? (
                    <p className="mt-1 text-xs text-muted-foreground">{shift.production_days.location}</p>
                  ) : null}
                  {shift.break_minutes ? (
                    <p className="mt-1 text-xs text-muted-foreground">{shift.break_minutes} min pause</p>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          {mineQ.data?.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Du har ingen vakter.</p>
          ) : null}
        </div>
      )}

      {open && leader ? (
        <ProductionDaySheet
          key={editing?.id ?? "new"}
          orgId={orgId}
          userId={user.id}
          day={editing}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ProductionDaySheet({
  orgId,
  userId,
  day,
  onClose,
}: {
  orgId: string;
  userId: string;
  day: DayRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrganizationMembers);
  const projectsQ = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => fetchProjects(orgId),
  });
  const membersQ = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

  const [name, setName] = useState(day?.name ?? "");
  const [date, setDate] = useState(day?.event_date ?? "");
  const [start, setStart] = useState(clockInputValue(day?.start_time) || "08:00");
  const [end, setEnd] = useState(clockInputValue(day?.end_time) || "16:00");
  const [location, setLocation] = useState(day?.location ?? "");
  const [projectId, setProjectId] = useState(day?.project_id ?? "");
  const [breakMinutes, setBreakMinutes] = useState(String(day?.break_minutes ?? 0));
  const [comment, setComment] = useState(day?.comment ?? "");
  const [assignees, setAssignees] = useState<DraftAssignee[]>(() =>
    (day?.shift_assignments ?? []).map((shift) => ({
      userId: shift.assignee_user_id,
      name: shift.assignee_name ?? "",
      start: clockInputValue(shift.start_time) || "08:00",
      end: clockInputValue(shift.end_time) || "16:00",
      breakMinutes: String(shift.break_minutes ?? 0),
    })),
  );
  const [busy, setBusy] = useState(false);

  const members = useMemo(() => membersQ.data?.members ?? [], [membersQ.data]);
  const selected = new Set(assignees.map((row) => row.userId));

  function toggleMember(member: MemberOption) {
    setAssignees((current) => {
      if (current.some((row) => row.userId === member.userId)) {
        return current.filter((row) => row.userId !== member.userId);
      }
      return [
        ...current,
        {
          userId: member.userId,
          name: memberLabel(member),
          start,
          end,
          breakMinutes: breakMinutes || "0",
        },
      ];
    });
  }

  function patchAssignee(userIdToPatch: string, patch: Partial<DraftAssignee>) {
    setAssignees((current) =>
      current.map((row) => (row.userId === userIdToPatch ? { ...row, ...patch } : row)),
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !date || !start || !end) return;
    setBusy(true);
    const payload = {
      organization_id: orgId,
      name: name.trim(),
      event_date: date,
      start_time: `${start}:00`,
      end_time: `${end}:00`,
      location: location.trim() || null,
      project_id: projectId || null,
      break_minutes: Number(breakMinutes) || 0,
      comment: comment.trim() || null,
    };

    let dayId = day?.id ?? null;
    if (dayId) {
      const { error } = await supabase.from("production_days").update(payload).eq("id", dayId);
      if (error) {
        setBusy(false);
        return toast.error(error.message);
      }
    } else {
      const { data, error } = await supabase
        .from("production_days")
        .insert({ ...payload, created_by: userId })
        .select("id")
        .single();
      if (error || !data) {
        setBusy(false);
        return toast.error(error?.message ?? "Kunne ikke opprette");
      }
      dayId = data.id;
    }

    const { data: existing, error: existingError } = await supabase
      .from("shift_assignments")
      .select("id, assignee_user_id")
      .eq("production_day_id", dayId);
    if (existingError) {
      setBusy(false);
      return toast.error(existingError.message);
    }
    const keep = new Set(assignees.map((row) => row.userId));
    const removeIds = (existing ?? [])
      .filter((row) => !keep.has(row.assignee_user_id))
      .map((row) => row.id);
    if (removeIds.length > 0) {
      const { error } = await supabase.from("shift_assignments").delete().in("id", removeIds);
      if (error) {
        setBusy(false);
        return toast.error(error.message);
      }
    }
    if (assignees.length > 0) {
      const { error } = await supabase.from("shift_assignments").upsert(
        assignees.map((row) => ({
          production_day_id: dayId,
          organization_id: orgId,
          assignee_user_id: row.userId,
          assignee_name: row.name.trim() || null,
          start_time: `${row.start}:00`,
          end_time: `${row.end}:00`,
          break_minutes: Number(row.breakMinutes) || 0,
        })),
        { onConflict: "production_day_id,assignee_user_id" },
      );
      if (error) {
        setBusy(false);
        const message = error.message.includes("not an active member")
          ? "Personen må være medlem i organisasjonen."
          : error.message;
        return toast.error(message);
      }
    }

    setBusy(false);
    toast.success(day ? "Oppdatert" : "Opprettet");
    void qc.invalidateQueries({ queryKey: ["schedule", orgId] });
    onClose();
  }

  return (
    <ContentSheet
      onClose={onClose}
      title={day ? "Rediger produksjonsdag" : "Ny produksjonsdag"}
      zClassName="z-[70]"
    >
      <form
        onSubmit={(event) => void save(event)}
        data-sheet-scroll
        className="scroll-touch min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <Field label="Produksjonsnavn">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={sheetFieldClass} />
        </Field>
        <Field label="Dato">
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={sheetFieldClass} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fra">
            <input required type="time" value={start} onChange={(e) => setStart(e.target.value)} className={sheetFieldClass} />
          </Field>
          <Field label="Til">
            <input required type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={sheetFieldClass} />
          </Field>
        </div>
        <Field label="Sted">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={sheetFieldClass} />
        </Field>
        <Field label="Prosjekt">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={sheetFieldClass}
          >
            <option value="">Ingen</option>
            {(projectsQ.data ?? []).map((project: Project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pause (minutter)">
          <input
            inputMode="numeric"
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(e.target.value.replace(/[^\d]/g, ""))}
            className={sheetFieldClass}
          />
        </Field>
        <Field label="Kommentar">
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className={sheetTextareaClass} />
        </Field>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Hvem som skal jobbe</p>
          {membersQ.isLoading ? <p className="text-sm text-muted-foreground">Laster medlemmer…</p> : null}
          {members.map((member) => {
            const draft = assignees.find((row) => row.userId === member.userId);
            const option: MemberOption = {
              userId: member.userId,
              role: member.role,
              email: member.email,
              reportEmployeeName: member.reportEmployeeName,
            };
            return (
              <div key={member.userId} className="rounded-md border border-border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(member.userId)}
                    onChange={() => toggleMember(option)}
                  />
                  <span className="min-w-0 truncate">{memberLabel(option)}</span>
                </label>
                {draft ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input
                      type="time"
                      aria-label="Start for ansatt"
                      value={draft.start}
                      onChange={(e) => patchAssignee(member.userId, { start: e.target.value })}
                      className={sheetFieldClass}
                    />
                    <input
                      type="time"
                      aria-label="Slutt for ansatt"
                      value={draft.end}
                      onChange={(e) => patchAssignee(member.userId, { end: e.target.value })}
                      className={sheetFieldClass}
                    />
                    <input
                      inputMode="numeric"
                      aria-label="Pause for ansatt"
                      value={draft.breakMinutes}
                      onChange={(e) =>
                        patchAssignee(member.userId, {
                          breakMinutes: e.target.value.replace(/[^\d]/g, ""),
                        })
                      }
                      className={sheetFieldClass}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            Tidene over arves fra produksjonsdagen og kan justeres per person. Personen må være medlem når vakten lagres.
          </p>
        </div>

        <button
          type="submit"
          disabled={busy || !name.trim() || !date}
          className="cta-brand tap-target h-12 w-full bg-primary text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Lagrer…" : day ? "Lagre" : "Opprett"}
        </button>
      </form>
    </ContentSheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
