import assert from "node:assert/strict";
import { describe, it } from "node:test";

function inviteRedirectUrl(appUrl) {
  const base = String(appUrl ?? "").replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/auth/invite`;
}

function isTruthyFlag(value) {
  return value === true || value === "true" || value === "t" || value === "1";
}

function isWorkLocalAccountMetadata(meta) {
  if (!meta || typeof meta !== "object") return false;
  return isTruthyFlag(meta.work_local_invite) || isTruthyFlag(meta.work_local_account);
}

function readInviteLanding(href) {
  let url;
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

describe("work-local invite contract", () => {
  it("points invite email at Work, not Nexus", () => {
    assert.equal(
      inviteRedirectUrl("https://work.example.com/"),
      "https://work.example.com/auth/invite",
    );
  });

  it("marks invited users as local Work accounts", () => {
    assert.equal(isWorkLocalAccountMetadata({ work_local_invite: "true" }), true);
    assert.equal(isWorkLocalAccountMetadata({ identity_core: true }), false);
  });

  it("detects invite landing and ignores Nexus SSO code on /auth", () => {
    assert.equal(
      readInviteLanding("https://work.example.com/auth#access_token=tok&type=invite").kind,
      "invite",
    );
    assert.equal(
      readInviteLanding("https://work.example.com/auth?code=sso-code").kind,
      "none",
    );
  });
});
