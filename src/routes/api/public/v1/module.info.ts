import { createFileRoute } from "@tanstack/react-router";
import {
  workModuleInfo,
  workModuleDeepLinks,
  workModuleWidgets,
  moduleAppBaseUrl,
  withContract,
} from "@/lib/module-contract.server";

export const Route = createFileRoute("/api/public/v1/module/info")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = moduleAppBaseUrl(request);
        return Response.json(
          withContract({
            module_slug: workModuleInfo.module_slug,
            module_name: workModuleInfo.module_name,
            module_version: workModuleInfo.module_version,
            capabilities: workModuleInfo.capabilities,
            base_url: base,
            endpoints: {
              health: `${base}/api/public/v1/module/health`,
              info: `${base}/api/public/v1/module/info`,
              organization: `${base}/api/public/v1/module/organization`,
              organization_verify: `${base}/api/public/v1/module/organization/{org_id}`,
              widgets: `${base}/api/public/v1/module/widgets`,
              alerts: `${base}/api/public/v1/module/alerts`,
              projects: `${base}/api/public/v1/projects`,
              rates: `${base}/api/public/v1/rates`,
              time_entries: `${base}/api/public/v1/time-entries`,
            },
            scopes: {
              organization: ["platform:read"],
              organization_verify: ["platform:verify"],
              projects: ["time:read", "platform:read"],
              rates: ["time:read", "platform:read"],
              time_entries_read: ["time:read", "platform:read"],
              time_entries_write: ["time:write", "platform:read"],
            },
            deep_links: workModuleDeepLinks,
            widgets: workModuleWidgets,
          }),
        );
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
