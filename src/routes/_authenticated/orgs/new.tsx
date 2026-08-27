import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganization } from "@/lib/organization.functions";
import { setDefaultOrgId } from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/orgs/new")({
  head: () => ({ meta: [{ title: "Ny organisasjon · Work Core" }] }),
  component: NewOrgPage,
});

function NewOrgPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createOrganization);
  const [name, setName] = useState("");

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim() } }),
    onSuccess: async (org) => {
      await setDefaultOrgId(org.id);
      await qc.invalidateQueries({ queryKey: ["orgs"] });
      await qc.invalidateQueries({ queryKey: ["default-org"] });
      toast.success("Organisasjon opprettet");
      navigate({ to: "/orgs/$orgId/start", params: { orgId: org.id } });
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunne ikke opprette"),
  });

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/orgs">
            <ArrowLeft className="h-4 w-4 mr-1" /> Tilbake
          </Link>
        </Button>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Ny organisasjon</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Du blir eier. Standard prosjekt og satser opprettes automatisk.
        </p>
      </div>

      <form
        className="space-y-4 rounded-md border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          createMut.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="org-name">Navn</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kunde / byrå / team"
            required
            autoFocus
          />
        </div>
        <Button type="submit" disabled={!name.trim() || createMut.isPending}>
          {createMut.isPending ? "Oppretter…" : "Opprett"}
        </Button>
      </form>
    </div>
  );
}
