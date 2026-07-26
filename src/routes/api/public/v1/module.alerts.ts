import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { jsonError, withContract } from "@/lib/module-contract.server";
import { computeWorkAlerts } from "@/lib/module-alerts.server";

export const Route = createFileRoute("/api/public/v1/module/alerts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "platform:read");
        if (scopeErr) return scopeErr;

        try {
          const alerts = await computeWorkAlerts(
            auth.client.organization_id,
            request,
          );
          return Response.json(withContract({ alerts }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to compute alerts";
          return jsonError(500, "alerts_error", msg);
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
