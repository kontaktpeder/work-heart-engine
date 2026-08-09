import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { z } from "zod";
import { Settings, ArrowLeftRight, LogOut } from "lucide-react";
import { fetchOrganizations, type Organization } from "@/lib/work-core";
import { MissionReturnLink } from "@/components/mission-return-link";
import { ContentSheet } from "@/components/content-sheet";
import { WorkPager } from "@/components/work-pager";
import { authSupabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { tryOpenSheet } from "@/lib/sheetGate";
import { useAppFrame } from "@/hooks/useAppFrame";
import { cn } from "@/lib/utils";
import { StartPane } from "./start";
import { TimerPane } from "./timer";
import { ReportsPane } from "./reports";

const OrgSearch = z.object({
  return: z.string().optional(),
});

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

const segments = [
  { to: "/orgs/$orgId/start" as const, label: "Hjem", match: "/start" },
  { to: "/orgs/$orgId/timer" as const, label: "Timer", match: "/timer" },
  { to: "/orgs/$orgId/reports" as const, label: "Rapport", match: "/reports" },
];

function paneIndexFromPath(pathname: string): number {
  if (pathname.includes("/timer")) return 1;
  if (pathname.includes("/reports")) return 2;
  return 0;
}

function OrgLayout() {
  useAppFrame();
  const { org, orgId } = Route.useRouteContext() as { org: Organization; orgId: string };
  const { return: returnUrl } = Route.useSearch();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isSettings = pathname.includes("/settings");
  const paneIndex = paneIndexFromPath(pathname);

  const goPane = useCallback(
    (index: number) => {
      const seg = segments[Math.max(0, Math.min(segments.length - 1, index))];
      if (!seg) return;
      void navigate({ to: seg.to, params: { orgId }, replace: true });
    },
    [navigate, orgId],
  );

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await authSupabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div
      className="mx-auto flex max-w-2xl flex-col overflow-hidden px-5 pt-[max(0.75rem,env(safe-area-inset-top))]"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => tryOpenSheet(() => setMenuOpen(true))}
          className="min-w-0 text-left"
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Arbeidsrom</p>
          <h2 className="truncate text-lg font-semibold">{org.name}</h2>
        </button>
        <button
          type="button"
          onClick={() => tryOpenSheet(() => setMenuOpen(true))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm"
          aria-label="Åpne meny"
        >
          {org.name.charAt(0).toUpperCase()}
        </button>
      </header>

      {returnUrl ? (
        <div className="mb-3 shrink-0">
          <MissionReturnLink returnUrl={returnUrl} />
        </div>
      ) : null}

      {!isSettings ? (
        <>
          <nav
            className="mb-3 grid shrink-0 grid-cols-3 gap-1 rounded-2xl border border-border bg-muted/40 p-1"
            aria-label="Sider"
          >
            {segments.map((s, i) => {
              const active = paneIndex === i;
              return (
                <button
                  key={s.to}
                  type="button"
                  onClick={() => goPane(i)}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold transition",
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </nav>

          <WorkPager index={paneIndex} onIndexChange={goPane}>
            {[
              <StartPane key="start" />,
              <TimerPane key="timer" />,
              <ReportsPane key="reports" />,
            ]}
          </WorkPager>
        </>
      ) : (
        <div className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Outlet />
        </div>
      )}

      {menuOpen ? (
        <ContentSheet onClose={() => setMenuOpen(false)} title={org.name} detents={["half", "full"]}>
          <div
            data-sheet-scroll
            className="scroll-touch min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <Link
              to="/orgs/$orgId/settings"
              params={{ orgId }}
              onClick={() => setMenuOpen(false)}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 font-medium transition hover:bg-accent"
            >
              <Settings className="h-5 w-5 text-primary" />
              Innstillinger
            </Link>
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
