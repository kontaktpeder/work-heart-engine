import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  inviteRedirectUrl,
  isIdentityCoreMetadata,
  isWorkLocalAccountMetadata,
  workLocalInviteMetadata,
} from "@/lib/invite-auth";

const OrgIdSchema = z.object({ organizationId: z.string().uuid() });

const InviteSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email().max(320),
  role: z.enum(["admin", "editor", "viewer"]).default("editor"),
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
    throw new Error("Du har ikke tilgang til å administrere medlemmer.");
  }
}

async function resolveWorkAppUrl(): Promise<string> {
  const env = (
    process.env.PUBLIC_APP_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    ""
  ).replace(/\/+$/, "");
  if (env) return env;
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  } catch {
    /* no request context */
  }
  return "";
}

async function findUserIdByEmail(admin: any, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const hit = data.users.find(
      (u: { email?: string | null }) => (u.email ?? "").toLowerCase() === normalized,
    );
    if (hit?.id) return hit.id as string;
    if ((data.users?.length ?? 0) < 200) break;
  }
  return null;
}

async function addMembership(
  admin: any,
  organizationId: string,
  userId: string,
  role: string,
): Promise<"added" | "already"> {
  const { data: existing } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return "already";
  const { error } = await admin.from("organization_members").insert({
    organization_id: organizationId,
    user_id: userId,
    role,
  });
  if (error) throw new Error(error.message);
  return "added";
}

export const listOrganizationMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrgIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me, error: meErr } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (meErr || !me) throw new Error("Ingen tilgang til denne organisasjonen.");

    const { data: rows, error } = await supabase
      .from("organization_members")
      .select("id, user_id, role, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at");
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const members = await Promise.all(
      (rows ?? []).map(async (m) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        const meta = (userData.user?.user_metadata ?? {}) as Record<string, unknown>;
        return {
          id: m.id as string,
          userId: m.user_id as string,
          role: m.role as string,
          createdAt: m.created_at as string,
          email: userData.user?.email ?? null,
          localAccount: isWorkLocalAccountMetadata(meta),
        };
      }),
    );
    return { members, canInvite: ["owner", "admin"].includes(me.role) };
  });

export const inviteOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);

    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo = inviteRedirectUrl(await resolveWorkAppUrl()) || undefined;
    const meta = workLocalInviteMetadata(data.organizationId);

    let targetUserId: string | null = null;
    let invited = false;

    const { data: inviteData, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: meta,
      });

    if (!inviteErr && inviteData.user?.id) {
      targetUserId = inviteData.user.id;
      invited = true;
    } else {
      targetUserId = await findUserIdByEmail(supabaseAdmin, email);
      if (!targetUserId) {
        throw new Error(
          inviteErr?.message ??
            "Kunne ikke invitere. Sjekk e-post og at Auth har e-post aktivert.",
        );
      }

      const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      const existingMeta = (existingUser.user?.user_metadata ?? {}) as Record<string, unknown>;
      if (!isIdentityCoreMetadata(existingMeta)) {
        await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          user_metadata: { ...existingMeta, ...meta },
        });
        const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (!resetErr) invited = true;
      }
    }

    const membership = await addMembership(
      supabaseAdmin,
      data.organizationId,
      targetUserId,
      data.role,
    );
    if (membership === "already") {
      return { ok: true as const, invited: false, alreadyMember: true as const };
    }

    return { ok: true as const, invited, alreadyMember: false as const };
  });
