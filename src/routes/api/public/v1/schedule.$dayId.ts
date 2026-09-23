import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { isUuid, withContract } from "@/lib/module-contract.server";
import { deleteProductionDay, ProductionDayPatch, updateProductionDay } from "@/lib/schedule.server";

export const Route = createFileRoute("/api/public/v1/schedule/$dayId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "schedule:write");
        if (scopeErr) return scopeErr;
        if (!isUuid(params.dayId)) {
          return Response.json(
            withContract({ error: { code: "invalid_request", message: "Invalid day id" } }),
            { status: 400 },
          );
        }
        const body = await request.json().catch(() => null);
        const parsed = ProductionDayPatch.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            withContract({ error: { code: "invalid_request", message: "Invalid body" } }),
            { status: 400 },
          );
        }
        return updateProductionDay(auth.client.organization_id, params.dayId, parsed.data);
      },

      DELETE: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "schedule:write");
        if (scopeErr) return scopeErr;
        if (!isUuid(params.dayId)) {
          return Response.json(
            withContract({ error: { code: "invalid_request", message: "Invalid day id" } }),
            { status: 400 },
          );
        }
        return deleteProductionDay(auth.client.organization_id, params.dayId);
      },

      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
