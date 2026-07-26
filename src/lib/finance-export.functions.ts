import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ExportSchema = z.object({
  organizationId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  dryRun: z.boolean().optional().default(false),
});

const CountSchema = z.object({
  organizationId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
});

async function assertAdmin(
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
  if (error || !membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("You do not have permission for this organization.");
  }
}

export const countExportableEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);
    const { count, error } = await (supabase as any)
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", data.organizationId)
      .is("finance_entry_id", null)
      .not("amount", "is", null)
      .gt("amount", 0)
      .gte("date", data.from)
      .lte("date", data.to);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const exportTimeEntriesToFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("@/lib/integration-secrets.server");
    const { createFinanceEntry, mapTimeEntryToFinanceEntry } = await import(
      "@/lib/finance-export-mapper.server"
    );

    // 1. Load org — must have external_identity_org_id linked
    const { data: org, error: orgErr } = await (supabaseAdmin as any)
      .from("organizations")
      .select("id, name, external_identity_org_id")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    if (!org) throw new Error("Organization not found");
    if (!org.external_identity_org_id) {
      throw new Error(
        "Organization is not linked to Platform (external_identity_org_id missing).",
      );
    }

    // 2. Load integration secrets
    const { data: secretRow, error: secretErr } = await (supabaseAdmin as any)
      .from("org_integration_secrets")
      .select("finance_base_url, finance_api_key_ciphertext")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (secretErr) throw new Error(secretErr.message);
    if (!secretRow) {
      throw new Error("Finance integration not configured for this organization.");
    }
    const financeBaseUrl = secretRow.finance_base_url as string;
    const financeApiKey = await decryptSecret(secretRow.finance_api_key_ciphertext);
    const workBaseUrl = process.env.PUBLIC_APP_URL ?? "";

    // 3. Load exportable entries
    const { data: entries, error: entriesErr } = await (supabaseAdmin as any)
      .from("time_entries")
      .select(
        "id, project_id, rate_id, date, total_minutes, amount, comment, started_at",
      )
      .eq("organization_id", data.organizationId)
      .is("finance_entry_id", null)
      .not("amount", "is", null)
      .gt("amount", 0)
      .gte("date", data.from)
      .lte("date", data.to)
      .order("date", { ascending: true });
    if (entriesErr) throw new Error(entriesErr.message);

    const rows = (entries ?? []) as Array<{
      id: string;
      project_id: string | null;
      rate_id: string | null;
      date: string | null;
      total_minutes: number | null;
      amount: number | null;
      comment: string | null;
      started_at: string | null;
    }>;

    // 4. Preload project + rate names
    const projectIds = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
    const rateIds = [...new Set(rows.map((r) => r.rate_id).filter(Boolean))] as string[];

    const projectNames = new Map<string, string>();
    if (projectIds.length) {
      const { data: ps } = await (supabaseAdmin as any)
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
      for (const p of ps ?? []) projectNames.set(p.id, p.name);
    }
    const rateNames = new Map<string, string>();
    if (rateIds.length) {
      const { data: rs } = await (supabaseAdmin as any)
        .from("rates")
        .select("id, name")
        .in("id", rateIds);
      for (const r of rs ?? []) rateNames.set(r.id, r.name);
    }

    let exported = 0;
    let skipped = 0;
    const errors: Array<{ timeEntryId: string; message: string }> = [];

    for (const e of rows) {
      const entryDate =
        e.date ?? (e.started_at ? e.started_at.slice(0, 10) : null);
      if (!entryDate || e.amount == null || e.amount <= 0) {
        skipped++;
        continue;
      }

      const body = mapTimeEntryToFinanceEntry({
        timeEntryId: e.id,
        entryDate,
        projectName: e.project_id ? (projectNames.get(e.project_id) ?? null) : null,
        rateName: e.rate_id ? (rateNames.get(e.rate_id) ?? null) : null,
        hours: (e.total_minutes ?? 0) / 60,
        amount: e.amount,
        comment: e.comment,
        workOrgId: data.organizationId,
        workBaseUrl,
      });

      if (data.dryRun) {
        exported++;
        continue;
      }

      try {
        const { id: financeId } = await createFinanceEntry({
          baseUrl: financeBaseUrl,
          apiKey: financeApiKey,
          body,
        });

        const { error: uErr } = await (supabaseAdmin as any)
          .from("time_entries")
          .update({ finance_entry_id: financeId })
          .eq("id", e.id);
        if (uErr) throw new Error(uErr.message);

        await (supabaseAdmin as any).from("finance_export_log").upsert(
          {
            organization_id: data.organizationId,
            time_entry_id: e.id,
            finance_entry_id: financeId,
            status: "success",
            error_message: null,
          },
          { onConflict: "organization_id,time_entry_id" },
        );

        exported++;
      } catch (err: any) {
        const message = err?.message ?? String(err);
        errors.push({ timeEntryId: e.id, message });
        await (supabaseAdmin as any).from("finance_export_log").upsert(
          {
            organization_id: data.organizationId,
            time_entry_id: e.id,
            status: "error",
            error_message: message.slice(0, 500),
          },
          { onConflict: "organization_id,time_entry_id" },
        );
      }
    }

    return { exported, skipped, errors, dryRun: data.dryRun };
  });
