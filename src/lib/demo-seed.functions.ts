import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  organizationId: z.string().uuid(),
});

async function assertEditor(
  supabase: any,
  userId: string,
  organizationId: string,
): Promise<void> {
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (
    error ||
    !membership ||
    !["owner", "admin", "editor"].includes(membership.role)
  ) {
    throw new Error("Du har ikke tilgang til å legge inn demodata.");
  }
}

function dayAgo(days: number): { date: string; started: string; ended: string } {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(12, 30, 0, 0);
  return {
    date: start.toISOString().slice(0, 10),
    started: start.toISOString(),
    ended: end.toISOString(),
  };
}

/** Seed sample project + billable hours. Idempotent via demo comment marker. */
export const seedWorkDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertEditor(supabase, userId, data.organizationId);

    const { count, error: countErr } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", data.organizationId)
      .eq("comment", "demo-seed");
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) {
      return { seeded: false as const, reason: "already_seeded" as const };
    }

    let { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("name", "Demo-kunde Alpha")
      .maybeSingle();

    if (!project) {
      const { data: created, error: pErr } = await supabase
        .from("projects")
        .insert({
          organization_id: data.organizationId,
          name: "Demo-kunde Alpha",
          code: "DEMO",
          is_active: true,
        })
        .select("id")
        .single();
      if (pErr || !created) throw new Error(pErr?.message ?? "Kunne ikke opprette prosjekt");
      project = created;
    }

    const { data: rate } = await supabase
      .from("rates")
      .select("id, amount")
      .eq("organization_id", data.organizationId)
      .eq("is_active", true)
      .order("name")
      .limit(1)
      .maybeSingle();

    const hourly = rate ? Number(rate.amount) : 210;
    const sessions = [5, 3, 1].map((daysAgo) => {
      const t = dayAgo(daysAgo);
      const minutes = 210; // 3.5h
      const amount = Math.round((minutes / 60) * hourly * 100) / 100;
      return {
        user_id: userId,
        organization_id: data.organizationId,
        project_id: project!.id,
        rate_id: rate?.id ?? null,
        hourly_rate: hourly,
        hourly_rate_snapshot: hourly,
        date: t.date,
        started_at: t.started,
        ended_at: t.ended,
        total_minutes: minutes,
        amount,
        break_minutes: 0,
        source: "manual" as const,
        comment: "demo-seed",
      };
    });

    const { error: insErr } = await supabase.from("time_entries").insert(sessions);
    if (insErr) throw new Error(insErr.message);

    return { seeded: true as const, count: sessions.length, projectId: project.id };
  });
