/** Work-local invite helpers (no Nexus). */

export const WORK_LOCAL_INVITE_META = "work_local_invite";
export const WORK_LOCAL_ACCOUNT_META = "work_local_account";

export type InviteLandingKind = "invite" | "recovery" | "none";

export type InviteLanding = {
  kind: InviteLandingKind;
  tokenHash: string | null;
  code: string | null;
  error: string | null;
};

/** Full reload so the next route sees the session (client navigate can bounce back to /auth). */
export function enterAppAfterAuth() {
  window.location.replace("/");
}

export function inviteRedirectUrl(appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/auth/invite`;
}

export function isWorkLocalAccountMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta || typeof meta !== "object") return false;
  return isTruthyFlag(meta[WORK_LOCAL_INVITE_META]) || isTruthyFlag(meta[WORK_LOCAL_ACCOUNT_META]);
}

export function isIdentityCoreMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta || typeof meta !== "object") return false;
  return isTruthyFlag(meta.identity_core);
}

export function workLocalInviteMetadata(organizationId: string): Record<string, string> {
  return {
    [WORK_LOCAL_INVITE_META]: "true",
    [WORK_LOCAL_ACCOUNT_META]: "true",
    invited_organization_id: organizationId,
  };
}

export function invitedOrganizationIdFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  const raw = meta?.invited_organization_id;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Invite/recovery landings (hash tokens, token_hash, or PKCE code with type).
 * Bare `?code=` without type is Nexus SSO — ignore it here.
 */
export function readInviteLanding(href: string): InviteLanding {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "none", tokenHash: null, code: null, error: null };
  }

  const search = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const error =
    search.get("error_description") ||
    search.get("error") ||
    hash.get("error_description") ||
    hash.get("error");
  const type = (hash.get("type") || search.get("type") || "").toLowerCase();
  const tokenHash = search.get("token_hash");
  const code = search.get("code");
  const hasAccessToken = Boolean(hash.get("access_token"));
  const isRecovery = type === "recovery";
  const isInviteType = type === "invite" || type === "signup" || type === "magiclink";
  const pathLooksInvite = /\/auth\/invite\/?$/.test(url.pathname);

  if (isRecovery || isInviteType || tokenHash || hasAccessToken || (pathLooksInvite && (code || error))) {
    return {
      kind: isRecovery ? "recovery" : "invite",
      tokenHash,
      code: isInviteType || tokenHash || hasAccessToken || pathLooksInvite ? code : null,
      error,
    };
  }

  return { kind: "none", tokenHash: null, code: null, error: null };
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "t" || value === "1";
}
