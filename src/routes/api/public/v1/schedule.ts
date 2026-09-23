import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { withContract } from "@/lib/module-contract.server";
import { createProductionDay, listSchedule, ProductionDayInput } from "@/lib/schedule.server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/api/public/v1/schedule")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "schedule:read");
        if (scopeErr) return scopeErr;

        const url = new URL(request.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        if ((from && !DATE.test(from)) || (to && !DATE.test(to))) {
          return Response.json(
            withContract({ error: { code: "invalid_request", message: "from and to must be YYYY-MM-DD" } }),
            { status: 400 },
          );
        }

        const listed = await listSchedule(auth.client.organization_id, from, to);
        if (listed.error) return listed.error;
        return Response.json(withContract({ data: listed.body }));
      },

      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "schedule:write");
        if (scopeErr) return scopeErr;

        const body = await request.json().catch(() => null);
        const parsed = ProductionDayInput.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            withContract({ error: { code: "invalid_request", message: "Invalid body" } }),
            { status: 400 },
          );
        }
        return createProductionDay(auth.client.organization_id, parsed.data, null);
      },

      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
