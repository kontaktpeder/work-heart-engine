import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { isUuid, withContract } from "@/lib/module-contract.server";
import { inheritShiftWindow, normalizeClock } from "@/lib/schedule-times.mjs";

type DayUpdate = Database["public"]["Tables"]["production_days"]["Update"];
type AssignmentUpdate = Database["public"]["Tables"]["shift_assignments"]["Update"];

const Clock = z.string().refine((value) => normalizeClock(value) != null, "Invalid time");

const AssignmentInput = z.object({
  assignee_user_id: z.string().uuid(),
  assignee_name: z.string().max(200).nullable().optional(),
  start_time: Clock.optional(),
  end_time: Clock.optional(),
  break_minutes: z.number().int().min(0).max(1440).optional(),
  comment: z.string().max(2000).nullable().optional(),
});

export const ProductionDayInput = z.object({
  name: z.string().trim().min(1).max(200),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: Clock,
  end_time: Clock,
  location: z.string().max(300).nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  break_minutes: z.number().int().min(0).max(1440).optional(),
  comment: z.string().max(2000).nullable().optional(),
  assignments: z.array(AssignmentInput).max(200).optional(),
});

export const ProductionDayPatch = ProductionDayInput.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Empty patch",
);

export const AssignmentPatch = z
  .object({
    assignee_name: z.string().max(200).nullable().optional(),
    start_time: Clock.optional(),
    end_time: Clock.optional(),
    break_minutes: z.number().int().min(0).max(1440).optional(),
    comment: z.string().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Empty patch");

const DAY_COLUMNS =
  "id, organization_id, name, event_date, start_time, end_time, location, project_id, break_minutes, comment, created_by, created_at, updated_at";

const ASSIGNMENT_COLUMNS =
  "id, production_day_id, organization_id, assignee_user_id, assignee_name, start_time, end_time, break_minutes, comment, created_at, updated_at";

export type ProductionDayRow = {
  id: string;
  organization_id: string;
  name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  project_id: string | null;
  break_minutes: number;
  comment: string | null;
  created_by: string | null;
};

export type AssignmentRow = {
  id: string;
  production_day_id: string;
  organization_id: string;
  assignee_user_id: string;
  assignee_name: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  comment: string | null;
};

function dbError(error: { message: string; code?: string }) {
  const message = error.message ?? "Database error";
  if (message.includes("not an active member")) {
    return Response.json(
      withContract({ error: { code: "not_a_member", message } }),
      { status: 400 },
    );
  }
  if (error.code === "23505") {
    return Response.json(
      withContract({ error: { code: "duplicate_assignment", message } }),
      { status: 409 },
    );
  }
  return Response.json(withContract({ error: { code: "db_error", message } }), { status: 400 });
}

async function assertProject(orgId: string, projectId: string | null | undefined) {
  if (!projectId) return null;
  if (!isUuid(projectId)) {
    return Response.json(
      withContract({ error: { code: "invalid_request", message: "Invalid project_id" } }),
      { status: 400 },
    );
  }
  const { data } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) {
    return Response.json(
      withContract({ error: { code: "not_found", message: "Project not found" } }),
      { status: 404 },
    );
  }
  return null;
}

export async function listSchedule(orgId: string, from: string | null, to: string | null) {
  let daysQuery = supabaseAdmin
    .from("production_days")
    .select(DAY_COLUMNS)
    .eq("organization_id", orgId)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(400);
  if (from) daysQuery = daysQuery.gte("event_date", from);
  if (to) daysQuery = daysQuery.lte("event_date", to);

  const { data: days, error } = await daysQuery;
  if (error) return { error: dbError(error) };
  const dayRows = (days ?? []) as ProductionDayRow[];
  if (dayRows.length === 0) {
    return { body: { organization_id: orgId, production_days: [] } };
  }

  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from("shift_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("organization_id", orgId)
    .in(
      "production_day_id",
      dayRows.map((day) => day.id),
    );
  if (assignmentError) return { error: dbError(assignmentError) };

  const byDay = new Map<string, AssignmentRow[]>();
  for (const row of (assignments ?? []) as AssignmentRow[]) {
    const list = byDay.get(row.production_day_id) ?? [];
    list.push(row);
    byDay.set(row.production_day_id, list);
  }

  return {
    body: {
      organization_id: orgId,
      production_days: dayRows.map((day) => ({
        ...day,
        assignments: byDay.get(day.id) ?? [],
      })),
    },
  };
}

async function writeAssignments(
  day: ProductionDayRow,
  assignments: z.infer<typeof AssignmentInput>[],
) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("shift_assignments")
    .select("id, assignee_user_id")
    .eq("production_day_id", day.id);
  if (existingError) return dbError(existingError);

  const uniqueAssignments = [
    ...new Map(assignments.map((row) => [row.assignee_user_id, row])).values(),
  ];
  const keep = new Set(uniqueAssignments.map((row) => row.assignee_user_id));
  const removeIds = (existing ?? [])
    .filter((row) => !keep.has(row.assignee_user_id as string))
    .map((row) => row.id as string);
  if (removeIds.length > 0) {
    const { error } = await supabaseAdmin.from("shift_assignments").delete().in("id", removeIds);
    if (error) return dbError(error);
  }

  if (uniqueAssignments.length === 0) return null;

  const rows = uniqueAssignments.map((assignment) => {
    const window = inheritShiftWindow(day, assignment);
    return {
      production_day_id: day.id,
      organization_id: day.organization_id,
      assignee_user_id: assignment.assignee_user_id,
      assignee_name: assignment.assignee_name?.trim() || null,
      start_time: window.start_time ?? day.start_time,
      end_time: window.end_time ?? day.end_time,
      break_minutes: window.break_minutes,
      comment: assignment.comment?.trim() || null,
    };
  });

  const { error } = await supabaseAdmin.from("shift_assignments").upsert(rows, {
    onConflict: "production_day_id,assignee_user_id",
  });
  if (error) return dbError(error);
  return null;
}

export async function createProductionDay(
  orgId: string,
  input: z.infer<typeof ProductionDayInput>,
  createdBy: string | null,
) {
  const projectError = await assertProject(orgId, input.project_id);
  if (projectError) return projectError;

  const { data, error } = await supabaseAdmin
    .from("production_days")
    .insert({
      organization_id: orgId,
      name: input.name,
      event_date: input.event_date,
      start_time: normalizeClock(input.start_time) ?? "00:00:00",
      end_time: normalizeClock(input.end_time) ?? "00:00:00",
      location: input.location?.trim() || null,
      project_id: input.project_id ?? null,
      break_minutes: input.break_minutes ?? 0,
      comment: input.comment?.trim() || null,
      created_by: createdBy,
    })
    .select(DAY_COLUMNS)
    .single();
  if (error || !data) return dbError(error ?? { message: "Could not create production day" });

  const day = data as ProductionDayRow;
  const assignmentError = await writeAssignments(day, input.assignments ?? []);
  if (assignmentError) {
    await supabaseAdmin.from("production_days").delete().eq("id", day.id);
    return assignmentError;
  }

  const listed = await listSchedule(orgId, day.event_date, day.event_date);
  if (listed.error) return listed.error;
  const created = listed.body?.production_days.find((row) => row.id === day.id) ?? day;
  return Response.json(withContract({ data: created }), { status: 201 });
}

export async function updateProductionDay(
  orgId: string,
  dayId: string,
  input: z.infer<typeof ProductionDayPatch>,
) {
  const { data: current, error: currentError } = await supabaseAdmin
    .from("production_days")
    .select(DAY_COLUMNS)
    .eq("id", dayId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (currentError) return dbError(currentError);
  if (!current) {
    return Response.json(
      withContract({ error: { code: "not_found", message: "Production day not found" } }),
      { status: 404 },
    );
  }

  if (input.project_id) {
    const projectError = await assertProject(orgId, input.project_id);
    if (projectError) return projectError;
  }

  const patch: DayUpdate = {};
  if (input.name != null) patch.name = input.name;
  if (input.event_date != null) patch.event_date = input.event_date;
  if (input.start_time != null) patch.start_time = normalizeClock(input.start_time) ?? undefined;
  if (input.end_time != null) patch.end_time = normalizeClock(input.end_time) ?? undefined;
  if (input.location !== undefined) patch.location = input.location?.trim() || null;
  if (input.project_id !== undefined) patch.project_id = input.project_id;
  if (input.break_minutes != null) patch.break_minutes = input.break_minutes;
  if (input.comment !== undefined) patch.comment = input.comment?.trim() || null;

  let day = current as ProductionDayRow;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await supabaseAdmin
      .from("production_days")
      .update(patch)
      .eq("id", dayId)
      .select(DAY_COLUMNS)
      .single();
    if (error || !data) return dbError(error ?? { message: "Could not update production day" });
    day = data as ProductionDayRow;
  }

  if (input.assignments) {
    const assignmentError = await writeAssignments(day, input.assignments);
    if (assignmentError) return assignmentError;
  }

  const listed = await listSchedule(orgId, day.event_date, day.event_date);
  if (listed.error) return listed.error;
  const updated = listed.body?.production_days.find((row) => row.id === day.id) ?? day;
  return Response.json(withContract({ data: updated }));
}

export async function deleteProductionDay(orgId: string, dayId: string) {
  const { data, error } = await supabaseAdmin
    .from("production_days")
    .delete()
    .eq("id", dayId)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) {
    return Response.json(
      withContract({ error: { code: "not_found", message: "Production day not found" } }),
      { status: 404 },
    );
  }
  return Response.json(withContract({ data: { id: dayId, deleted: true } }));
}

export async function updateAssignment(orgId: string, assignmentId: string, input: z.infer<typeof AssignmentPatch>) {
  const patch: AssignmentUpdate = {};
  if (input.assignee_name !== undefined) patch.assignee_name = input.assignee_name?.trim() || null;
  if (input.start_time != null) patch.start_time = normalizeClock(input.start_time) ?? undefined;
  if (input.end_time != null) patch.end_time = normalizeClock(input.end_time) ?? undefined;
  if (input.break_minutes != null) patch.break_minutes = input.break_minutes;
  if (input.comment !== undefined) patch.comment = input.comment?.trim() || null;

  const { data, error } = await supabaseAdmin
    .from("shift_assignments")
    .update(patch)
    .eq("id", assignmentId)
    .eq("organization_id", orgId)
    .select(ASSIGNMENT_COLUMNS)
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) {
    return Response.json(
      withContract({ error: { code: "not_found", message: "Shift not found" } }),
      { status: 404 },
    );
  }
  return Response.json(withContract({ data }));
}

export async function deleteAssignment(orgId: string, assignmentId: string) {
  const { data, error } = await supabaseAdmin
    .from("shift_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) {
    return Response.json(
      withContract({ error: { code: "not_found", message: "Shift not found" } }),
      { status: 404 },
    );
  }
  return Response.json(withContract({ data: { id: assignmentId, deleted: true } }));
}
