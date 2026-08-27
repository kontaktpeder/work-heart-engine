export type OrgRole = "owner" | "admin" | "editor" | "viewer";

export type OrgMembership = {
  role: OrgRole;
  report_employee_name: string | null;
  report_manager_name: string | null;
};

export type SettingsSection =
  "report" | "members" | "organization" | "projects" | "rates" | "finance" | "api-keys";

export type SettingsAccess = "member" | "editor" | "admin";

export type SettingsItem = {
  section: SettingsSection;
  label: string;
  hint: string;
  access: SettingsAccess;
};

export const SETTINGS_ITEMS: SettingsItem[] = [
  { section: "report", label: "Rapport", hint: "Ansatt og leder på eksport", access: "member" },
  { section: "members", label: "Medlemmer", hint: "Inviter kollega – egne timer", access: "admin" },
  { section: "organization", label: "Organisasjon", hint: "Firmanavn og Nexus", access: "admin" },
  { section: "projects", label: "Prosjekter", hint: "Felles prosjektliste", access: "editor" },
  { section: "rates", label: "Satser", hint: "Felles timepriser", access: "editor" },
  { section: "finance", label: "Finance", hint: "Eksport og kobling", access: "admin" },
  { section: "api-keys", label: "API-nøkler", hint: "Nøkler for integrasjoner", access: "admin" },
];

export function isOrgAdmin(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canEditCatalog(role: OrgRole | null | undefined): boolean {
  return isOrgAdmin(role) || role === "editor";
}

function allowsAccess(access: SettingsAccess, role: OrgRole | null | undefined): boolean {
  if (access === "admin") return isOrgAdmin(role);
  if (access === "editor") return canEditCatalog(role);
  return true;
}

export function visibleSettingsItems(role: OrgRole | null | undefined): SettingsItem[] {
  return SETTINGS_ITEMS.filter((item) => allowsAccess(item.access, role));
}

export function canOpenSettingsSection(
  section: SettingsSection,
  role: OrgRole | null | undefined,
): boolean {
  const item = SETTINGS_ITEMS.find((i) => i.section === section);
  if (!item) return false;
  return allowsAccess(item.access, role);
}

export function hasRequiredEmployeeName(name: string | null | undefined): boolean {
  return Boolean(name?.trim());
}
