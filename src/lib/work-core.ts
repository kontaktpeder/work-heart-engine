import { supabase } from "@/integrations/supabase/client";

export type Organization = {
  id: string;
  name: string;
  owner_id: string;
};

export type Project = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  description: string | null;
  hourly_rate: number | null;
  is_active: boolean;
};

export type Rate = {
  id: string;
  organization_id: string;
  name: string;
  amount: number;
  currency: string;
  description: string | null;
  is_active: boolean;
};

export type WorkSession = {
  id: string;
  user_id: string;
  organization_id: string;
  project_id: string | null;
  started_at: string;
  comment: string | null;
};

export type TimeEntry = {
  id: string;
  user_id: string;
  organization_id: string;
  project_id: string | null;
  rate_id: string | null;
  hourly_rate_snapshot: number | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  total_minutes: number | null;
  hourly_rate: number | null;
  amount: number | null;
  comment: string | null;
  source: "manual" | "timer";
  started_at: string | null;
  ended_at: string | null;
};

const ENTRY_COLUMNS =
  "id, user_id, organization_id, project_id, rate_id, hourly_rate_snapshot, date, start_time, end_time, break_minutes, total_minutes, hourly_rate, amount, comment, source, started_at, ended_at";

export async function fetchOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, owner_id")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchProjects(orgId?: string, includeInactive = false): Promise<Project[]> {
  let q = supabase
    .from("projects")
    .select("id, organization_id, name, code, description, hourly_rate, is_active")
    .order("name");
  if (orgId) q = q.eq("organization_id", orgId);
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function fetchRates(orgId?: string, includeInactive = false): Promise<Rate[]> {
  let q = supabase
    .from("rates")
    .select("id, organization_id, name, amount, currency, description, is_active")
    .order("name");
  if (orgId) q = q.eq("organization_id", orgId);
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as Rate[];
}

export async function fetchFrequentProjects(orgId: string, limit = 5): Promise<Project[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await supabase
    .from("time_entries")
    .select("project_id")
    .eq("user_id", u.user.id)
    .eq("organization_id", orgId)
    .gte("started_at", since.toISOString())
    .not("project_id", "is", null)
    .limit(500);
  if (error) return [];
  const counts = new Map<string, number>();
  (data ?? []).forEach((r: { project_id: string | null }) => {
    if (r.project_id) counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);
  });
  const ids = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  if (!ids.length) return [];
  const { data: projs } = await supabase
    .from("projects")
    .select("id, organization_id, name, code, description, hourly_rate, is_active")
    .in("id", ids);
  const map = new Map((projs ?? []).map((p) => [p.id, p as Project]));
  return ids.map((id) => map.get(id)).filter((x): x is Project => !!x);
}

export async function fetchFrequentRates(orgId: string, limit = 5): Promise<Rate[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await supabase
    .from("time_entries")
    .select("rate_id")
    .eq("user_id", u.user.id)
    .eq("organization_id", orgId)
    .gte("started_at", since.toISOString())
    .not("rate_id", "is", null)
    .limit(500);
  if (error) return [];
  const counts = new Map<string, number>();
  (data ?? []).forEach((r: { rate_id: string | null }) => {
    if (r.rate_id) counts.set(r.rate_id, (counts.get(r.rate_id) ?? 0) + 1);
  });
  const ids = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  if (!ids.length) return [];
  const { data: rates } = await supabase
    .from("rates")
    .select("id, organization_id, name, amount, currency, description, is_active")
    .in("id", ids);
  const map = new Map(
    (rates ?? []).map((r) => [r.id, { ...r, amount: Number(r.amount) } as Rate]),
  );
  return ids.map((id) => map.get(id)).filter((x): x is Rate => !!x);
}

export async function createProject(input: {
  organization_id: string;
  name: string;
  code?: string | null;
  description?: string | null;
}): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      code: input.code ?? null,
      description: input.description ?? null,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

export async function createRate(input: {
  organization_id: string;
  name: string;
  amount: number;
  currency?: string;
  description?: string | null;
}): Promise<Rate> {
  const { data, error } = await supabase
    .from("rates")
    .insert({
      organization_id: input.organization_id,
      name: input.name,
      amount: input.amount,
      currency: input.currency ?? "NOK",
      description: input.description ?? null,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return { ...data, amount: Number(data.amount) } as Rate;
}

export async function fetchActiveSession(): Promise<WorkSession | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("work_sessions")
    .select("id, user_id, organization_id, project_id, started_at, comment")
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as WorkSession | null;
}

export async function fetchTimeEntries(
  opts: {
    from?: Date;
    to?: Date;
    orgId?: string;
    projectId?: string;
  } = {},
): Promise<TimeEntry[]> {
  let q = supabase
    .from("time_entries")
    .select(ENTRY_COLUMNS)
    .order("started_at", { ascending: false });
  if (opts.from) q = q.gte("started_at", opts.from.toISOString());
  if (opts.to) q = q.lt("started_at", opts.to.toISOString());
  if (opts.orgId) q = q.eq("organization_id", opts.orgId);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { data, error } = await q.limit(1000);
  if (error) throw error;
  return (data ?? []) as TimeEntry[];
}

export function entryMinutes(e: TimeEntry): number {
  if (typeof e.total_minutes === "number") return Math.max(0, e.total_minutes);
  if (!e.started_at || !e.ended_at) return 0;
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

export function formatNok(amount: number): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount);
}
