import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { isUuid, withContract } from "@/lib/module-contract.server";
import { AssignmentPatch, deleteAssignment, updateAssignment } from "@/lib/schedule.server";

export const Route = createFileRoute("/api/public/v1/schedule/assignments/$assignmentId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "schedule:write");
        if (scopeErr) return scopeErr;
        if (!isUuid(params.assignmentId)) {
          return Response.json(
            withContract({ error: { code: "invalid_request", message: "Invalid assignment id" } }),
            { status: 400 },
          );
        }
        const body = await request.json().catch(() => null);
        const parsed = AssignmentPatch.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            withContract({ error: { code: "invalid_request", message: "Invalid body" } }),
            { status: 400 },
          );
        }
        return updateAssignment(auth.client.organization_id, params.assignmentId, parsed.data);
      },

      DELETE: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "schedule:write");
        if (scopeErr) return scopeErr;
        if (!isUuid(params.assignmentId)) {
          return Response.json(
            withContract({ error: { code: "invalid_request", message: "Invalid assignment id" } }),
            { status: 400 },
          );
        }
        return deleteAssignment(auth.client.organization_id, params.assignmentId);
      },

      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
