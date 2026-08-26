import {
  createFileRoute,
  redirect,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { z } from "zod";
import {
  Settings,
  ArrowLeftRight,
  LogOut,
  ChevronRight,
} from "lucide-react";
import {
  fetchOrganizations,
  fetchProjects,
  fetchRates,
  fetchTimeEntries,
  setDefaultOrgId,
  type Organization,
} from "@/lib/work-core";
import { adjacentOrgId, orgStackIndex } from "@/lib/org-stack";
import { useOrgStackSwipe } from "@/hooks/useOrgStackSwipe";
import { MissionReturnLink } from "@/components/mission-return-link";
import { ContentSheet } from "@/components/content-sheet";
import { authSupabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tryOpenSheet } from "@/lib/sheetGate";
import { getNestDepth, subscribeNest } from "@/lib/sheetNest";
import { useAppFrame } from "@/hooks/useAppFrame";
import { startOfDay } from "@/lib/time-utils";
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
  beforeLoad: async ({ params, context }) => {
    const qc = context.queryClient;
    const orgs = await qc.ensureQueryData({
      queryKey: ["orgs"],
      queryFn: fetchOrganizations,
      staleTime: 5 * 60_000,
    });
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
  const switchingRef = useRef(false);
  const [stackDir, setStackDir] = useState(0);

  const orgsQ = useQuery({
    queryKey: ["orgs"],
    queryFn: fetchOrganizations,
    staleTime: 5 * 60_000,
  });
  const orgs = orgsQ.data ?? [org];
  const canSwipeOrgs = orgs.length > 1;
  const stackIndex = useMemo(() => orgStackIndex(orgs, orgId), [orgs, orgId]);

  const sheet = search.sheet;
  const section = search.section;
  const nestDepth = useSyncExternalStore(subscribeNest, getNestDepth, () => 0);
  const sheetOpen = !!sheet || menuOpen || nestDepth > 0;

  // Prefetch neighbor orgs so swipe lands warm.
  useEffect(() => {
    if (orgs.length < 2) return;
    const today = startOfDay();
    for (const dir of [1, -1] as const) {
      const id = adjacentOrgId(orgs, orgId, dir);
      if (!id || id === orgId) continue;
      void queryClient.prefetchQuery({
        queryKey: ["projects", id],
        queryFn: () => fetchProjects(id),
        staleTime: 60_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["rates", id],
        queryFn: () => fetchRates(id),
        staleTime: 60_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["entries", id, "today"],
        queryFn: () => fetchTimeEntries({ from: today, orgId: id }),
        staleTime: 30_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["entries", id, "recent"],
        queryFn: () => fetchTimeEntries({ orgId: id }),
        staleTime: 30_000,
      });
    }
  }, [orgs, orgId, queryClient]);

  const switchOrg = useCallback(
    (nextId: string, direction: 1 | -1) => {
      if (switchingRef.current || nextId === orgId) return;
      if (getNestDepth() > 0) return;
      switchingRef.current = true;
      setStackDir(direction);
      // Persist preference in background — don't block UI.
      void setDefaultOrgId(nextId);
      void navigate({
        to: "/orgs/$orgId/start",
        params: { orgId: nextId },
        search: {
          return: search.return,
        },
        replace: true,
      }).finally(() => {
        // Short debounce only — avoids double-fire from one gesture.
        window.setTimeout(() => {
          switchingRef.current = false;
        }, 120);
      });
    },
    [navigate, orgId, search.return],
  );

  const onStackSwipe = useCallback(
    (direction: 1 | -1) => {
      if (sheetOpen) return;
      const nextId = adjacentOrgId(orgs, orgId, direction);
      if (nextId) switchOrg(nextId, direction);
    },
    [sheetOpen, orgs, orgId, switchOrg],
  );

  const swipeRef = useOrgStackSwipe({
    enabled: canSwipeOrgs && !sheetOpen,
    onSwipe: onStackSwipe,
  });

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

  const stackStyle = canSwipeOrgs
    ? ({
        ["--org-stack-from" as string]: stackDir >= 0 ? "28px" : "-28px",
      } as CSSProperties)
    : undefined;

  return (
    <div
      ref={swipeRef}
      className={`mx-auto flex max-w-2xl flex-col overflow-hidden px-5 pt-[max(0.5rem,env(safe-area-inset-top))] ${
        canSwipeOrgs ? "touch-pan-y" : ""
      }`}
      style={{ height: "var(--app-height, 100dvh)" }}
      aria-label={canSwipeOrgs ? "Sveip opp eller ned for å bytte organisasjon" : undefined}
    >
      <header className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => tryOpenSheet(() => setMenuOpen(true))}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {canSwipeOrgs ? (
            <span className="flex shrink-0 flex-col gap-1" aria-hidden>
              {orgs.map((o, i) => (
                <span
                  key={o.id}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === stackIndex ? "bg-foreground/70" : "bg-border"
                  }`}
                />
              ))}
            </span>
          ) : null}
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

      <div className="min-h-0 flex-1 overflow-hidden pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div
          key={orgId}
          className={`h-full min-h-0 ${canSwipeOrgs ? "org-stack-enter" : ""}`}
          style={stackStyle}
        >
          <StartPane
            onOpenTimer={() => openSheet("timer")}
            onOpenReports={() => openSheet("reports")}
          />
        </div>
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
