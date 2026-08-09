import {
  createFileRoute,
  redirect,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import {
  Settings,
  ArrowLeftRight,
  LogOut,
  List,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { fetchOrganizations, type Organization } from "@/lib/work-core";
import { MissionReturnLink } from "@/components/mission-return-link";
import { ContentSheet } from "@/components/content-sheet";
import { authSupabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { tryOpenSheet } from "@/lib/sheetGate";
import { useAppFrame } from "@/hooks/useAppFrame";
import { StartPane } from "./start";
import { TimerPane } from "./timer";
import { ReportsPane } from "./reports";
import { ProjectsPane } from "./settings.projects";
import { RatesPane } from "./settings.rates";
import { OrganizationSettingsPane } from "./settings.organization";
import { FinanceIntegrationPane } from "./settings.finance-integration";
import { ApiKeysPane } from "./settings.api-keys";

const OrgSearch = z.object({
  return: z.string().optional(),
  sheet: z.enum(["timer", "reports", "settings"]).optional(),
  section: z
    .enum(["organization", "projects", "rates", "finance", "api-keys"])
    .optional(),
});

export type OrgSearch = z.infer<typeof OrgSearch>;

export const Route = createFileRoute("/_authenticated/orgs/$orgId")({
  validateSearch: (s) => OrgSearch.parse(s),
  beforeLoad: async ({ params }) => {
    const orgs = await fetchOrganizations();
    const org = orgs.find((o) => o.id === params.orgId);
    if (!org) throw redirect({ to: "/orgs" });
    return { org, orgId: params.orgId };
  },
  component: OrgLayout,
});

const settingsItems = [
  { section: "organization" as const, label: "Organization", hint: "Navn og detaljer" },
  { section: "projects" as const, label: "Projects", hint: "Prosjektliste" },
  { section: "rates" as const, label: "Rates", hint: "Timepriser" },
  { section: "finance" as const, label: "Finance", hint: "Eksport og kobling" },
  { section: "api-keys" as const, label: "API keys", hint: "Nøkler for integrasjoner" },
];

function OrgLayout() {
  useAppFrame();
  const { org, orgId } = Route.useRouteContext() as { org: Organization; orgId: string };
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const sheet = search.sheet;
  const section = search.section;

  function setSheet(next: OrgSearch["sheet"], nextSection?: OrgSearch["section"]) {
    void navigate({
      to: "/orgs/$orgId/start",
      params: { orgId },
      search: {
        return: search.return,
        sheet: next,
        section: next ? nextSection : undefined,
      },
      replace: true,
    });
  }

  function openSheet(next: NonNullable<OrgSearch["sheet"]>, nextSection?: OrgSearch["section"]) {
    tryOpenSheet(() => setSheet(next, nextSection));
  }

  function closeSheet() {
    setSheet(undefined, undefined);
  }

  function closeSection() {
    setSheet("settings", undefined);
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await authSupabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div
      className="mx-auto flex max-w-2xl flex-col overflow-hidden px-5 pt-[max(0.5rem,env(safe-area-inset-top))]"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      <header className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => tryOpenSheet(() => setMenuOpen(true))}
          className="min-w-0 text-left"
        >
          <p className="truncate text-sm font-semibold tracking-tight">{org.name}</p>
        </button>
        <button
          type="button"
          onClick={() => tryOpenSheet(() => setMenuOpen(true))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm"
          aria-label="Meny"
        >
          {org.name.charAt(0).toUpperCase()}
        </button>
      </header>

      {search.return ? (
        <div className="mb-3 shrink-0">
          <MissionReturnLink returnUrl={search.return} />
        </div>
      ) : null}

      <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <StartPane
          onOpenTimer={() => openSheet("timer")}
          onOpenReports={() => openSheet("reports")}
        />
      </div>

      {sheet === "timer" ? (
        <ContentSheet onClose={closeSheet} title="Timer" detents={["half", "full"]}>
          <div
            data-sheet-scroll
            className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <TimerPane />
          </div>
        </ContentSheet>
      ) : null}

      {sheet === "reports" ? (
        <ContentSheet onClose={closeSheet} title="Rapport" detents={["half", "full"]}>
          <div
            data-sheet-scroll
            className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <ReportsPane />
          </div>
        </ContentSheet>
      ) : null}

      {sheet === "settings" ? (
        <ContentSheet onClose={closeSheet} title="Innstillinger" detents={["half", "full"]}>
          <div
            data-sheet-scroll
            className="scroll-touch min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            {settingsItems.map((item) => (
              <button
                key={item.section}
                type="button"
                onClick={() => openSheet("settings", item.section)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 text-left transition hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </ContentSheet>
      ) : null}

      {sheet === "settings" && section ? (
        <ContentSheet
          onClose={closeSection}
          title={settingsItems.find((i) => i.section === section)?.label ?? "Innstillinger"}
          zClassName="z-[60]"
        >
          <div
            data-sheet-scroll
            className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            {section === "organization" ? <OrganizationSettingsPane /> : null}
            {section === "projects" ? <ProjectsPane /> : null}
            {section === "rates" ? <RatesPane /> : null}
            {section === "finance" ? <FinanceIntegrationPane /> : null}
            {section === "api-keys" ? <ApiKeysPane /> : null}
          </div>
        </ContentSheet>
      ) : null}

      {menuOpen ? (
        <ContentSheet onClose={() => setMenuOpen(false)} title={org.name} detents={["half", "full"]}>
          <div
            data-sheet-scroll
            className="scroll-touch min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openSheet("timer");
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 font-medium"
            >
              <List className="h-5 w-5 text-primary" /> Timer
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openSheet("reports");
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 font-medium"
            >
              <BarChart3 className="h-5 w-5 text-primary" /> Rapport
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openSheet("settings");
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 font-medium"
            >
              <Settings className="h-5 w-5 text-primary" /> Innstillinger
            </button>
            <Link
              to="/orgs"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-border px-4 font-medium"
            >
              <ArrowLeftRight className="h-5 w-5" /> Bytt arbeidsrom
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left font-medium text-destructive"
            >
              <LogOut className="h-5 w-5" /> Logg ut
            </button>
          </div>
        </ContentSheet>
      ) : null}
    </div>
  );
}
