import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PlatformLinkSchema = z.object({
  organizationId: z.string().uuid(),
  externalIdentityOrgId: z
    .union([z.string().uuid(), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
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

export const getOrganizationPlatformLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);
    const { data: org, error } = await supabase
      .from("organizations")
      .select("id, name, external_identity_org_id")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) throw new Error("Organization not found");
    return {
      id: org.id as string,
      name: org.name as string,
      externalIdentityOrgId: (org.external_identity_org_id as string | null) ?? null,
    };
  });

export const saveOrganizationPlatformLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlatformLinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);
    const { error } = await supabase
      .from("organizations")
      .update({ external_identity_org_id: data.externalIdentityOrgId })
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true as const, externalIdentityOrgId: data.externalIdentityOrgId };
  });
