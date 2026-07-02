import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WidgetResult = {
  id: string;
  value: number | string | null;
  display: string;
  deep_link: string;
};

// Compute today's YYYY-MM-DD in Europe/Oslo
function todayOslo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

export async function computeTodayHours(orgId: string): Promise<WidgetResult> {
  const today = todayOslo();
  const { data, error } = await supabaseAdmin
    .from("time_entries")
    .select("total_minutes")
    .eq("organization_id", orgId)
    .eq("date", today);
  if (error) throw error;
  const totalMinutes = (data ?? []).reduce(
    (sum, r: { total_minutes: number | null }) => sum + (r.total_minutes ?? 0),
    0,
  );
  const hours = totalMinutes / 60;
  return {
    id: "today_hours",
    value: Math.round(hours * 100) / 100,
    display: `${hours.toFixed(1)}h`,
    deep_link: "org_home",
  };
}

export async function computeActiveProjects(orgId: string): Promise<WidgetResult> {
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const { data, error } = await supabaseAdmin
    .from("time_entries")
    .select("project_id")
    .eq("organization_id", orgId)
    .gte("started_at", since.toISOString())
    .not("project_id", "is", null);
  if (error) throw error;
  const unique = new Set<string>();
  (data ?? []).forEach((r: { project_id: string | null }) => {
    if (r.project_id) unique.add(r.project_id);
  });
  return {
    id: "active_projects",
    value: unique.size,
    display: String(unique.size),
    deep_link: "org_home",
  };
}

export const WIDGET_COMPUTERS: Record<
  string,
  (orgId: string) => Promise<WidgetResult>
> = {
  today_hours: computeTodayHours,
  active_projects: computeActiveProjects,
};
