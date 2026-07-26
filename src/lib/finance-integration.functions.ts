import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SaveSchema = z.object({
  organizationId: z.string().uuid(),
  financeBaseUrl: z.string().url(),
  financeApiKey: z.string().min(10),
});

const OrgOnlySchema = z.object({
  organizationId: z.string().uuid(),
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

export const getFinanceIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrgOnlySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("org_integration_secrets")
      .select("finance_base_url, updated_at")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    return {
      configured: !!row,
      financeBaseUrl: row?.finance_base_url ?? "https://financecore.lovable.app",
      updatedAt: row?.updated_at ?? null,
    };
  });

export const saveFinanceIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("@/lib/integration-secrets.server");
    const ciphertext = await encryptSecret(data.financeApiKey);
    const { error } = await (supabaseAdmin as any)
      .from("org_integration_secrets")
      .upsert(
        {
          organization_id: data.organizationId,
          finance_base_url: data.financeBaseUrl,
          finance_api_key_ciphertext: ciphertext,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testFinanceIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrgOnlySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("@/lib/integration-secrets.server");
    const { pingFinance } = await import("@/lib/finance-export-mapper.server");

    const { data: row, error } = await (supabaseAdmin as any)
      .from("org_integration_secrets")
      .select("finance_base_url, finance_api_key_ciphertext")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Finance integration not configured");

    const apiKey = await decryptSecret(row.finance_api_key_ciphertext);
    await pingFinance({ baseUrl: row.finance_base_url, apiKey });
    return { ok: true };
  });
