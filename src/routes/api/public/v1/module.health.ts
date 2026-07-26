import { createFileRoute } from "@tanstack/react-router";
import { workModuleInfo, withContract } from "@/lib/module-contract.server";

export const Route = createFileRoute("/api/public/v1/module/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          withContract({
            status: "ok",
            module_slug: workModuleInfo.module_slug,
            module_version: workModuleInfo.module_version,
            time: new Date().toISOString(),
          }),
        ),
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
