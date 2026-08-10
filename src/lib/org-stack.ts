import type { Organization } from "@/lib/work-core";

/** Use list order from fetchOrganizations (created_at asc). */
export function adjacentOrgId(
  orgs: Organization[],
  currentId: string,
  direction: 1 | -1,
): string | null {
  const idx = orgs.findIndex((o) => o.id === currentId);
  if (idx < 0) return null;
  return orgs[idx + direction]?.id ?? null;
}

export function orgStackIndex(orgs: Organization[], currentId: string): number {
  const idx = orgs.findIndex((o) => o.id === currentId);
  return idx < 0 ? 0 : idx;
}
