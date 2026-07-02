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
            },
            scopes: {
              organization: ["platform:read"],
              organization_verify: ["platform:verify"],
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
