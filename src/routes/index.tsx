import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchDefaultOrgId } from "@/lib/work-core";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const defaultOrg = await fetchDefaultOrgId();
    if (defaultOrg) {
      throw redirect({ to: "/orgs/$orgId/start", params: { orgId: defaultOrg } });
    }
    throw redirect({ to: "/orgs" });
  },
  component: () => null,
});
