import type { Organization } from "@/lib/work-core";

/** Use list order from fetchOrganizations (created_at asc). Wraps at ends. */
export function adjacentOrgId(
  orgs: Organization[],
  currentId: string,
  direction: 1 | -1,
): string | null {
  if (orgs.length < 2) return null;
  const idx = orgs.findIndex((o) => o.id === currentId);
  if (idx < 0) return null;
  const next = (idx + direction + orgs.length) % orgs.length;
  return orgs[next]?.id ?? null;
}

export function orgStackIndex(orgs: Organization[], currentId: string): number {
  const idx = orgs.findIndex((o) => o.id === currentId);
  return idx < 0 ? 0 : idx;
}
