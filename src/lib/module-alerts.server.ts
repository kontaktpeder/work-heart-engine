import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { moduleAppBaseUrl } from "@/lib/module-contract.server";

export type ModuleAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description?: string;
  action_url?: string;
  priority: number;
  source_module: "work";
};

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

function isWeekdayOslo(): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    weekday: "short",
  }).format(new Date());
  return weekday !== "Sat" && weekday !== "Sun";
}

function absUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Actionable Work alerts for Platform Mission (Module Contract v1.1). */
export async function computeWorkAlerts(
  orgId: string,
  request: Request,
): Promise<ModuleAlert[]> {
  const base = moduleAppBaseUrl(request);
  const alerts: ModuleAlert[] = [];
  const today = todayOslo();

  // 1. Open timer session in this org
  const { data: sessions, error: sessionErr } = await supabaseAdmin
    .from("work_sessions")
    .select("id, started_at")
    .eq("organization_id", orgId)
    .limit(1);
  if (sessionErr) throw sessionErr;
  if (sessions && sessions.length > 0) {
    const started = sessions[0].started_at
      ? new Date(sessions[0].started_at)
      : null;
    const hoursOpen = started
      ? Math.floor((Date.now() - started.getTime()) / 3_600_000)
      : 0;
    alerts.push({
      id: "work.open_session",
      severity: hoursOpen >= 8 ? "warning" : "info",
      title: "Timer kjører fortsatt",
      description:
        hoursOpen >= 1
          ? `Åpen økt i ca. ${hoursOpen} t — husk å stoppe når du er ferdig.`
          : "Det er en aktiv timer-økt i Work Core.",
      action_url: absUrl(base, `/orgs/${orgId}/start`),
      priority: hoursOpen >= 8 ? 2 : 15,
      source_module: "work",
    });
  }

  // 2. No hours logged today (weekdays only)
  if (isWeekdayOslo()) {
    const { data: todayRows, error: todayErr } = await supabaseAdmin
      .from("time_entries")
      .select("total_minutes")
      .eq("organization_id", orgId)
      .eq("date", today);
    if (todayErr) throw todayErr;
    const minutes = (todayRows ?? []).reduce(
      (sum, r: { total_minutes: number | null }) => sum + (r.total_minutes ?? 0),
      0,
    );
    if (minutes === 0 && (!sessions || sessions.length === 0)) {
      alerts.push({
        id: "work.no_hours_today",
        severity: "info",
        title: "Ingen timer registrert i dag",
        description: "Start en økt eller legg inn tid manuelt.",
        action_url: absUrl(base, `/orgs/${orgId}/start`),
        priority: 20,
        source_module: "work",
      });
    }
  }

  // 3. Billable entries not yet exported to Finance (older than 3 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const { count, error: exportErr } = await supabaseAdmin
    .from("time_entries")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("finance_entry_id", null)
    .not("amount", "is", null)
    .gt("amount", 0)
    .lte("date", cutoffDate);
  if (exportErr) throw exportErr;
  if ((count ?? 0) > 0) {
    alerts.push({
      id: "work.unexported_entries",
      severity: "warning",
      title: `${count} poster ikke eksportert til Finance`,
      description:
        "Billbare timer eldre enn 3 dager mangler Finance-eksport.",
      action_url: absUrl(base, `/orgs/${orgId}/reports`),
      priority: 5,
      source_module: "work",
    });
  }

  // 4. Platform link missing (blocks export path)
  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("external_identity_org_id")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org?.external_identity_org_id) {
    alerts.push({
      id: "work.missing_platform_link",
      severity: "info",
      title: "Ikke koblet til Platform",
      description:
        "Sett Platform org-ID under Innstillinger → Organisasjon for eksport og Nexus-kobling.",
      action_url: absUrl(base, `/orgs/${orgId}/settings/organization`),
      priority: 25,
      source_module: "work",
    });
  }

  return alerts;
}
