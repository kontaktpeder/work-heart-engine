import { supabase } from "@/integrations/supabase/client";

export type Organization = {
  id: string;
  name: string;
  owner_id: string;
};

export type WorkType = {
  id: string;
  organization_id: string;
  name: string;
  color: string | null;
};

export type WorkSession = {
  id: string;
  user_id: string;
  organization_id: string;
  work_type_id: string | null;
  started_at: string;
  comment: string | null;
};

export type TimeEntry = {
  id: string;
  user_id: string;
  organization_id: string;
  work_type_id: string | null;
  started_at: string;
  ended_at: string;
  break_minutes: number;
  comment: string | null;
};

export async function fetchOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, owner_id")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchWorkTypes(orgId?: string): Promise<WorkType[]> {
  let q = supabase.from("work_types").select("id, organization_id, name, color").order("name");
  if (orgId) q = q.eq("organization_id", orgId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchActiveSession(): Promise<WorkSession | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("work_sessions")
    .select("*")
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchTimeEntries(from?: Date, to?: Date): Promise<TimeEntry[]> {
  let q = supabase.from("time_entries").select("*").order("started_at", { ascending: false });
  if (from) q = q.gte("started_at", from.toISOString());
  if (to) q = q.lt("started_at", to.toISOString());
  const { data, error } = await q.limit(500);
  if (error) throw error;
  return data ?? [];
}

export function startOfWeek(d = new Date()): Date {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // monday=0
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

export function startOfDay(d = new Date()): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function entryMinutes(e: TimeEntry): number {
  const ms = new Date(e.ended_at).getTime() - new Date(e.started_at).getTime();
  return Math.max(0, Math.round(ms / 60000) - (e.break_minutes ?? 0));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}t ${m.toString().padStart(2, "0")}min`;
}

export function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
