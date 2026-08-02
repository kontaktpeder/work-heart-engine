import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireAnyScope } from "@/lib/api-auth.server";
import { withContract } from "@/lib/module-contract.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/v1/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        // Platform verify keys often only have platform:read — accept that for domain reads.
        const scopeErr = requireAnyScope(auth.client, ["time:read", "platform:read"]);
        if (scopeErr) return scopeErr;

        const url = new URL(request.url);
        const includeInactive = url.searchParams.get("include_inactive") === "true";

        let q = supabaseAdmin
          .from("projects")
          .select("id, organization_id, name, code, description, hourly_rate, is_active")
          .eq("organization_id", auth.client.organization_id)
          .order("name");
        if (!includeInactive) q = q.eq("is_active", true);

        const { data, error } = await q;
        if (error) {
          return Response.json(
            withContract({ error: { code: "db_error", message: error.message } }),
            { status: 500 },
          );
        }
        return Response.json(withContract({ data: data ?? [] }));
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
