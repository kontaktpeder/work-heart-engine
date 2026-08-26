import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAuthSupabaseConfig } from "@/integrations/supabase/shared-auth";
import {
  invitedOrganizationIdFromMetadata,
  isPersonalOrganizationName,
  isWorkLocalAccountMetadata,
} from "@/lib/invite-auth";

function emailFromAccessToken(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function isEmailTakenError(message: string | undefined): boolean {
  return /already\s+been\s+registered|email.+already|user\s+already\s+exists/i.test(
    message ?? "",
  );
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "example.com";
}

function pendingEmailFor(nexusUserId: string, realEmail: string): string {
  return `nexus-pending.${nexusUserId.replace(/-/g, "")}.${Date.now()}@${emailDomain(realEmail)}`;
}

/** List-scan only — never generateLink here (it can create users). */
async function findUserIdsByEmail(admin: any, email: string): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  const ids = new Set<string>();

  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users ?? []) {
      if ((u.email ?? "").trim().toLowerCase() === normalized && u.id) {
        ids.add(u.id as string);
      }
    }
    if ((data.users?.length ?? 0) < 200) break;
  }
  return [...ids];
}

/** When list-scan misses, resolve holder via generateLink (email must already be taken). */
async function resolveEmailHolderId(admin: any, email: string): Promise<string | null> {
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: email.trim().toLowerCase(),
  });
  if (error || !linkData?.user?.id) return null;
  return linkData.user.id as string;
}

/**
 * Remap Work rows from legacy UUID → Nexus UUID, then delete legacy auth user.
 * Must run only after Nexus shadow user exists (FK-safe).
 */
async function isProtectedLocalWorkUser(admin: any, userId: string): Promise<boolean> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return isWorkLocalAccountMetadata(
    (data.user?.user_metadata ?? {}) as Record<string, unknown>,
  );
}

async function remapAndDeleteLegacy(
  admin: any,
  nexusUserId: string,
  oldId: string,
): Promise<number> {
  const { data: stillThere } = await admin.auth.admin.getUserById(oldId);
  if (!stillThere.user) return 0;
  if (isWorkLocalAccountMetadata((stillThere.user.user_metadata ?? {}) as Record<string, unknown>)) {
    return 0;
  }

  let remapped = 0;
  const { data: rows, error } = await admin
    .from("organization_members")
    .select("id, organization_id, role")
    .eq("user_id", oldId);
  if (error) throw new Error(error.message);

  for (const row of rows ?? []) {
    const { data: clash } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", row.organization_id)
      .eq("user_id", nexusUserId)
      .maybeSingle();
    if (clash) {
      const { error: delErr } = await admin.from("organization_members").delete().eq("id", row.id);
      if (delErr) throw new Error(delErr.message);
      continue;
    }
    const { error: updErr } = await admin
      .from("organization_members")
      .update({ user_id: nexusUserId })
      .eq("id", row.id);
    if (updErr) throw new Error(updErr.message);
    remapped += 1;
  }

  // Move ownership BEFORE deleteUser — organizations.owner_id is ON DELETE CASCADE.
  const { error: ownerErr } = await admin
    .from("organizations")
    .update({ owner_id: nexusUserId })
    .eq("owner_id", oldId);
  if (ownerErr) throw new Error(ownerErr.message);

  const { data: nexusSession } = await admin
    .from("work_sessions")
    .select("id")
    .eq("user_id", nexusUserId)
    .maybeSingle();
  if (nexusSession) {
    const { error: sessDelErr } = await admin.from("work_sessions").delete().eq("user_id", oldId);
    if (sessDelErr) throw new Error(sessDelErr.message);
  } else {
    const { error: sessUpdErr } = await admin
      .from("work_sessions")
      .update({ user_id: nexusUserId })
      .eq("user_id", oldId);
    if (sessUpdErr) throw new Error(sessUpdErr.message);
  }

  const { error: timeErr } = await admin
    .from("time_entries")
    .update({ user_id: nexusUserId })
    .eq("user_id", oldId);
  if (timeErr) throw new Error(timeErr.message);

  // api_clients.created_by is ON DELETE RESTRICT — must reassign first.
  const { error: apiErr } = await admin
    .from("api_clients")
    .update({ created_by: nexusUserId })
    .eq("created_by", oldId);
  if (apiErr) throw new Error(apiErr.message);

  const { error: delUserErr } = await admin.auth.admin.deleteUser(oldId);
  if (delUserErr) {
    throw new Error(`Kunne ikke slette lokal bruker: ${delUserErr.message}`);
  }
  return remapped;
}

async function absorbHoldersOfEmail(
  admin: any,
  nexusUserId: string,
  email: string,
): Promise<number> {
  const holders = new Set(
    (await findUserIdsByEmail(admin, email)).filter((id) => id !== nexusUserId),
  );

  let remapped = 0;
  for (const oldId of holders) {
    if (await isProtectedLocalWorkUser(admin, oldId)) continue;
    remapped += await remapAndDeleteLegacy(admin, nexusUserId, oldId);
  }
  return remapped;
}

async function claimRealEmail(admin: any, nexusUserId: string, email: string): Promise<number> {
  const normalized = email.trim().toLowerCase();
  const { data: me } = await admin.auth.admin.getUserById(nexusUserId);
  if ((me.user?.email ?? "").trim().toLowerCase() === normalized) return 0;

  const { error } = await admin.auth.admin.updateUserById(nexusUserId, {
    email: normalized,
    email_confirm: true,
  });
  if (!error) return 0;
  if (!isEmailTakenError(error.message)) throw new Error(error.message);

  // Email still held — find holder (list, then generateLink) and absorb.
  let holders = (await findUserIdsByEmail(admin, normalized)).filter((id) => id !== nexusUserId);
  if (!holders.length) {
    const holderId = await resolveEmailHolderId(admin, normalized);
    if (holderId && holderId !== nexusUserId) holders = [holderId];
  }
  if (!holders.length) {
    throw new Error(error.message);
  }

  let remapped = 0;
  for (const oldId of holders) {
    if (await isProtectedLocalWorkUser(admin, oldId)) {
      throw new Error(
        "Denne e-posten tilhører en lokal Work-konto. Logg inn med e-post og passord i Work — ikke via Nexus.",
      );
    }
    remapped += await remapAndDeleteLegacy(admin, nexusUserId, oldId);
  }

  const { error: retry } = await admin.auth.admin.updateUserById(nexusUserId, {
    email: normalized,
    email_confirm: true,
  });
  if (retry) throw new Error(retry.message);
  return remapped;
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "Min organisasjon";
  return local.replace(/^nexus-pending\.[^.]+(?:\.\d+)?$/i, "Min organisasjon") || "Min organisasjon";
}

function shadowUserMetadata(email: string, fullName?: string | null) {
  const name = (fullName ?? "").trim() || displayNameFromEmail(email);
  return {
    identity_core: true,
    pending_email: email,
    full_name: name,
    name,
  };
}

async function ensureNexusShadowExists(
  admin: any,
  nexusUserId: string,
  email: string,
  fullName?: string | null,
) {
  const { data: existing } = await admin.auth.admin.getUserById(nexusUserId);
  if (existing.user) return { created: false };

  const meta = shadowUserMetadata(email, fullName);
  const pending = pendingEmailFor(nexusUserId, email);
  const { error: createErr } = await admin.auth.admin.createUser({
    id: nexusUserId,
    email: pending,
    email_confirm: true,
    user_metadata: meta,
  });
  if (!createErr) return { created: true };

  // Rare: pending email collision — retry once with new timestamp.
  if (isEmailTakenError(createErr.message)) {
    const pending2 = pendingEmailFor(nexusUserId, email);
    const { error: retryErr } = await admin.auth.admin.createUser({
      id: nexusUserId,
      email: pending2,
      email_confirm: true,
      user_metadata: meta,
    });
    if (retryErr) throw new Error(retryErr.message);
    return { created: true };
  }

  // Id already exists race
  const { data: again } = await admin.auth.admin.getUserById(nexusUserId);
  if (again.user) return { created: false };
  throw new Error(createErr.message);
}

/** Rename trigger-created orgs that used the temporary nexus-pending email as name. */
async function repairPendingOrgNames(admin: any, userId: string, email: string) {
  const nice = `${displayNameFromEmail(email)} (personlig)`;
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name")
    .eq("owner_id", userId);
  if (error) throw new Error(error.message);
  for (const org of orgs ?? []) {
    const name = String(org.name ?? "");
    if (/^nexus-pending\./i.test(name) || /^migrated\./i.test(name)) {
      const { error: updErr } = await admin
        .from("organizations")
        .update({ name: nice })
        .eq("id", org.id);
      if (updErr) throw new Error(updErr.message);
    }
  }
}

/** Absorb leftover parked auth users from earlier SSO migration attempts. */
async function absorbParkedMigrationUsers(
  admin: any,
  nexusUserId: string,
  email: string,
): Promise<number> {
  const domain = emailDomain(email);
  const ids: string[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users ?? []) {
      if (!u.id || u.id === nexusUserId) continue;
      const e = (u.email ?? "").trim().toLowerCase();
      if (!e.endsWith(`@${domain}`)) continue;
      if (e.startsWith("migrated.") || e.startsWith("nexus-pending.")) ids.push(u.id as string);
    }
    if ((data.users?.length ?? 0) < 200) break;
  }
  let remapped = 0;
  for (const oldId of ids) {
    remapped += await remapAndDeleteLegacy(admin, nexusUserId, oldId);
  }
  return remapped;
}

/**
 * If earlier CASCADE deletes left orgs with a dead owner_id, reclaim them for this user
 * when the user only has pending/empty workspace memberships (solo-dev recovery).
 */
async function reclaimOrphanOrgsIfNeeded(admin: any, nexusUserId: string): Promise<number> {
  const { data: memberships, error: memErr } = await admin
    .from("organization_members")
    .select("organization_id, organizations(id, name)")
    .eq("user_id", nexusUserId);
  if (memErr) throw new Error(memErr.message);

  const myNames = (memberships ?? []).map((m: any) =>
    String(m.organizations?.name ?? ""),
  );
  const onlyJunk =
    myNames.length === 0 ||
    myNames.every((n) => /^nexus-pending\./i.test(n) || /^migrated\./i.test(n) || !n);

  if (!onlyJunk) return 0;

  const { data: allOrgs, error: orgErr } = await admin
    .from("organizations")
    .select("id, name, owner_id");
  if (orgErr) throw new Error(orgErr.message);

  let reclaimed = 0;
  for (const org of allOrgs ?? []) {
    if (org.owner_id === nexusUserId) continue;
    const { data: owner } = await admin.auth.admin.getUserById(org.owner_id);
    if (owner.user) continue;

    const { error: ownErr } = await admin
      .from("organizations")
      .update({ owner_id: nexusUserId })
      .eq("id", org.id);
    if (ownErr) throw new Error(ownErr.message);

    const { data: clash } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", org.id)
      .eq("user_id", nexusUserId)
      .maybeSingle();
    if (!clash) {
      const { error: insErr } = await admin.from("organization_members").insert({
        organization_id: org.id,
        user_id: nexusUserId,
        role: "owner",
      });
      if (insErr) throw new Error(insErr.message);
    }
    reclaimed += 1;
  }
  return reclaimed;
}

/**
 * Ensure auth.users contains Nexus user id with the real email.
 * Strategy (Work-safe): create shadow with temp email → remap/delete legacy → claim real email.
 * Avoids "A user with this email address has already been registered" on createUser.
 */
async function ensureShadowAndRemap(
  admin: any,
  userId: string,
  email: string | null,
  fullName?: string | null,
): Promise<{ remapped: number; shadowCreated: boolean; email: string | null }> {
  if (!email) {
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    if (existing.user) {
      return {
        remapped: 0,
        shadowCreated: false,
        email: existing.user.email?.trim().toLowerCase() ?? null,
      };
    }
    throw new Error("Kan ikke opprette shadow-bruker uten e-post.");
  }

  const normalized = email.trim().toLowerCase();
  const holders = (await findUserIdsByEmail(admin, normalized)).filter((id) => id !== userId);
  for (const holderId of holders) {
    if (await isProtectedLocalWorkUser(admin, holderId)) {
      throw new Error(
        "Denne e-posten tilhører en lokal Work-konto. Logg inn med e-post og passord i Work — ikke via Nexus.",
      );
    }
  }
  const ensured = await ensureNexusShadowExists(admin, userId, normalized, fullName);
  let remapped = await absorbHoldersOfEmail(admin, userId, normalized);
  remapped += await claimRealEmail(admin, userId, normalized);
  remapped += await absorbParkedMigrationUsers(admin, userId, normalized);
  remapped += await reclaimOrphanOrgsIfNeeded(admin, userId);
  await repairPendingOrgNames(admin, userId, normalized);

  return {
    remapped,
    shadowCreated: ensured.created,
    email: normalized,
  };
}

async function mintModuleSession(email: string): Promise<{
  access_token: string;
  refresh_token: string;
}> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) throw new Error("SUPABASE_URL / PUBLISHABLE_KEY mangler");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: email.trim().toLowerCase(),
  });
  if (linkErr) throw new Error(linkErr.message);
  const tokenHash = (linkData as { properties?: { hashed_token?: string } })?.properties
    ?.hashed_token;
  if (!tokenHash) throw new Error("Kunne ikke lage modul-sesjon (mangler hashed_token)");

  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await userClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (error || !data.session?.access_token || !data.session.refresh_token) {
    throw new Error(error?.message ?? "Kunne ikke verifisere modul-sesjon");
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

/**
 * Lovable Cloud–safe SSO (no shared JWT secret):
 * Nexus handoff → verify → shadow user (same UUID) → Work-local session.
 */
export const completeNexusSsoLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const code =
      typeof (input as { code?: unknown })?.code === "string"
        ? (input as { code: string }).code.trim()
        : "";
    if (!code) throw new Error("Mangler SSO-kode");
    return { code };
  })
  .handler(async ({ data }) => {
    const nexusApp = (
      process.env.NEXUS_APP_URL ||
      process.env.VITE_NEXUS_APP_URL ||
      "https://foundation-verse-core.lovable.app"
    ).replace(/\/$/, "");
    if (!nexusApp) throw new Error("NEXUS_APP_URL er ikke satt på server.");

    const res = await fetch(`${nexusApp}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: data.code }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      access_token?: string;
      user_id?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new Error(body.error || `SSO-utveksling feilet (HTTP ${res.status})`);
    }

    const authCfg = getAuthSupabaseConfig();
    if (!authCfg) {
      throw new Error("AUTH_SUPABASE_URL / KEY mangler på server (trengs for Nexus-token).");
    }
    const nexusAuth = createClient(authCfg.url, authCfg.key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data: claimsData, error: claimsErr } = await nexusAuth.auth.getClaims(
      body.access_token,
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      throw new Error(claimsErr?.message || "Ugyldig Nexus-token");
    }

    const userId = claimsData.claims.sub as string;
    const email =
      (typeof claimsData.claims.email === "string" && claimsData.claims.email) ||
      emailFromAccessToken(body.access_token);
    const fullName =
      (typeof claimsData.claims.user_metadata === "object" &&
        claimsData.claims.user_metadata &&
        typeof (claimsData.claims.user_metadata as { full_name?: unknown }).full_name ===
          "string" &&
        (claimsData.claims.user_metadata as { full_name: string }).full_name) ||
      (typeof claimsData.claims.name === "string" && claimsData.claims.name) ||
      null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ensured = await ensureShadowAndRemap(supabaseAdmin, userId, email, fullName);
    if (!ensured.email) {
      throw new Error("Mangler e-post for å lage lokal sesjon");
    }

    const session = await mintModuleSession(ensured.email);
    const sessionSub = JSON.parse(
      Buffer.from(session.access_token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { sub?: string };
    if (sessionSub.sub && sessionSub.sub !== userId) {
      throw new Error(
        `Sesjon fikk feil bruker-id (${sessionSub.sub} ≠ ${userId}). Prøv igjen etter migrering.`,
      );
    }

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user_id: userId,
      email: ensured.email,
      remapped: ensured.remapped,
      shadowCreated: ensured.shadowCreated,
    };
  });

export const exchangeNexusSsoCode = completeNexusSsoLogin;

const EnsureSchema = z.object({
  email: z.string().email().optional(),
});

export const ensureModuleIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EnsureSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const email =
      data.email ||
      (typeof context.claims?.email === "string" && context.claims.email) ||
      null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ensured = await ensureShadowAndRemap(supabaseAdmin, userId, email);
    return { ok: true as const, ...ensured, userId };
  });

async function pruneEmptyPersonalOrgs(
  admin: any,
  userId: string,
  meta: Record<string, unknown>,
): Promise<{ pruned: number; defaultOrgId: string | null }> {
  const { data: memberships, error } = await admin
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, owner_id)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const rows = (memberships ?? []) as Array<{
    organization_id: string;
    role: string;
    organizations: { id: string; name: string; owner_id: string } | null;
  }>;

  const personal = rows.filter(
    (m) =>
      m.organizations?.owner_id === userId &&
      isPersonalOrganizationName(m.organizations?.name),
  );
  const shared = rows.filter(
    (m) => !personal.some((p) => p.organization_id === m.organization_id),
  );

  if (shared.length === 0) {
    return { pruned: 0, defaultOrgId: rows[0]?.organization_id ?? null };
  }

  let pruned = 0;
  for (const p of personal) {
    const orgId = p.organization_id;
    const { data: entries, error: eErr } = await admin
      .from("time_entries")
      .select("id, comment")
      .eq("organization_id", orgId)
      .limit(50);
    if (eErr) throw new Error(eErr.message);
    const hasRealWork = (entries ?? []).some(
      (e: { comment: string | null }) => e.comment !== "demo-seed",
    );
    if (hasRealWork) continue;
    const { error: delErr } = await admin.from("organizations").delete().eq("id", orgId);
    if (delErr) throw new Error(delErr.message);
    pruned += 1;
  }

  const invited = invitedOrganizationIdFromMetadata(meta);
  const defaultOrgId =
    (invited && shared.some((s) => s.organization_id === invited) ? invited : null) ??
    shared[0]?.organization_id ??
    null;

  if (defaultOrgId) {
    const { error: prefErr } = await admin.from("user_preferences").upsert(
      { user_id: userId, default_organization_id: defaultOrgId },
      { onConflict: "user_id" },
    );
    if (prefErr) throw new Error(prefErr.message);
  }

  return { pruned, defaultOrgId };
}

/** Repair pending org names / reclaim orphans after Identity Core SSO (safe to call on /orgs). */
export const repairWorkIdentityWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    const email =
      (typeof context.claims?.email === "string" && context.claims.email) || null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: self } = await supabaseAdmin.auth.admin.getUserById(userId);
    const meta = (self.user?.user_metadata ?? {}) as Record<string, unknown>;
    const pruned = await pruneEmptyPersonalOrgs(supabaseAdmin, userId, meta);
    if (isWorkLocalAccountMetadata(meta)) {
      return { ok: true as const, remapped: 0, pruned: pruned.pruned };
    }
    if (!email) {
      const resolved = self.user?.email?.trim().toLowerCase() ?? null;
      if (!resolved) return { ok: true as const, remapped: 0, pruned: pruned.pruned };
      const ensured = await ensureShadowAndRemap(supabaseAdmin, userId, resolved);
      return { ok: true as const, remapped: ensured.remapped, pruned: pruned.pruned };
    }
    const ensured = await ensureShadowAndRemap(supabaseAdmin, userId, email);
    return { ok: true as const, remapped: ensured.remapped, pruned: pruned.pruned };
  });
