import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, requireAnyScope } from "@/lib/api-auth.server";
import { isUuid, withContract } from "@/lib/module-contract.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TimeEntryInput = z.object({
  project_id: z.string().uuid(),
  rate_id: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  break_minutes: z.number().int().min(0).max(24 * 60).optional(),
  comment: z.string().max(2000).nullable().optional(),
  source: z.enum(["manual", "timer"]).optional(),
  source_app: z.string().max(64).optional(),
  source_ref: z.string().max(200).optional(),
});

function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t.slice(0, 8);
}

export const Route = createFileRoute("/api/public/v1/time-entries")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireAnyScope(auth.client, ["time:read", "platform:read"]);
        if (scopeErr) return scopeErr;

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const { data, error } = await supabaseAdmin
          .from("time_entries")
          .select(
            "id, organization_id, project_id, rate_id, date, start_time, end_time, break_minutes, total_minutes, hourly_rate, amount, comment, source, started_at, ended_at",
          )
          .eq("organization_id", auth.client.organization_id)
          .order("date", { ascending: false })
          .limit(limit);
        if (error) {
          return Response.json(
            withContract({ error: { code: "db_error", message: error.message } }),
            { status: 500 },
          );
        }
        return Response.json(withContract({ data: data ?? [] }));
      },

      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireAnyScope(auth.client, ["time:write", "platform:read"]);
        if (scopeErr) return scopeErr;

        const body = await request.json().catch(() => null);
        const parsed = TimeEntryInput.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            withContract({ error: { code: "invalid_request", message: "Invalid body" } }),
            { status: 400 },
          );
        }
        const v = parsed.data;
        const orgId = auth.client.organization_id;

        // Attribute entry to API client owner (Nexus/Work user who created the key).
        let userId = auth.client.created_by;
        if (!userId) {
          const { data: org } = await supabaseAdmin
            .from("organizations")
            .select("owner_id")
            .eq("id", orgId)
            .maybeSingle();
          userId = (org?.owner_id as string | null) ?? null;
        }
        if (!userId) {
          return Response.json(
            withContract({
              error: { code: "no_user", message: "Could not resolve user for time entry" },
            }),
            { status: 400 },
          );
        }

        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("id", v.project_id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (!project) {
          return Response.json(
            withContract({ error: { code: "not_found", message: "Project not found" } }),
            { status: 404 },
          );
        }

        if (v.rate_id) {
          if (!isUuid(v.rate_id)) {
            return Response.json(
              withContract({ error: { code: "invalid_request", message: "Invalid rate_id" } }),
              { status: 400 },
            );
          }
          const { data: rate } = await supabaseAdmin
            .from("rates")
            .select("id")
            .eq("id", v.rate_id)
            .eq("organization_id", orgId)
            .maybeSingle();
          if (!rate) {
            return Response.json(
              withContract({ error: { code: "not_found", message: "Rate not found" } }),
              { status: 404 },
            );
          }
        }

        // Soft idempotency via comment/source metadata — Work has no source_ref column.
        // Deduplicate by matching recent timer entry with same project+times if source_ref given.
        if (v.source_app === "nexus" && v.source_ref) {
          const { data: recent } = await supabaseAdmin
            .from("time_entries")
            .select("id, organization_id, project_id, rate_id, date, start_time, end_time, break_minutes, total_minutes, hourly_rate, amount, comment, source, started_at, ended_at")
            .eq("organization_id", orgId)
            .eq("project_id", v.project_id)
            .eq("date", v.date)
            .eq("start_time", normalizeTime(v.start_time))
            .eq("end_time", normalizeTime(v.end_time))
            .ilike("comment", `%[nexus:${v.source_ref}]%`)
            .limit(1)
            .maybeSingle();
          if (recent) {
            return Response.json(withContract({ data: recent, duplicate: true }), { status: 200 });
          }
        }

        const commentParts = [v.comment?.trim() || null];
        if (v.source_app === "nexus" && v.source_ref) {
          commentParts.push(`[nexus:${v.source_ref}]`);
        }
        const comment = commentParts.filter(Boolean).join(" ") || null;

        const { data, error } = await supabaseAdmin
          .from("time_entries")
          .insert({
            user_id: userId,
            organization_id: orgId,
            project_id: v.project_id,
            rate_id: v.rate_id ?? null,
            date: v.date,
            start_time: normalizeTime(v.start_time),
            end_time: normalizeTime(v.end_time),
            break_minutes: v.break_minutes ?? 0,
            comment,
            source: v.source ?? "timer",
          })
          .select(
            "id, organization_id, project_id, rate_id, date, start_time, end_time, break_minutes, total_minutes, hourly_rate, amount, comment, source, started_at, ended_at",
          )
          .single();

        if (error) {
          return Response.json(
            withContract({ error: { code: "db_error", message: error.message } }),
            { status: 400 },
          );
        }
        return Response.json(withContract({ data }), { status: 201 });
      },

      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
