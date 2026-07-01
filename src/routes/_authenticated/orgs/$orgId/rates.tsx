import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchRates, type Organization, type Rate } from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/rates")({
  head: () => ({ meta: [{ title: "Satser · Work Core" }] }),
  component: RatesPage,
});

function RatesPage() {
  const { org, orgId } = Route.useRouteContext() as { org: Organization; orgId: string };
  const qc = useQueryClient();
  const ratesQ = useQuery({
    queryKey: ["rates", orgId, "all"],
    queryFn: () => fetchRates(orgId, true),
  });
  const [editing, setEditing] = useState<Rate | null>(null);
  const [open, setOpen] = useState(false);

  async function toggleActive(r: Rate) {
    const { error } = await supabase
      .from("rates")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rates"] });
  }
  async function remove(r: Rate) {
    if (!confirm(`Slette satsen "${r.name}"? Eksisterende timer beholder frosset timepris.`))
      return;
    const { error } = await supabase.from("rates").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rates"] });
    toast.success("Slettet");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Satser</h1>
          <p className="text-xs text-muted-foreground">i {org.name}</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="tap-target bg-primary text-primary-foreground h-11 px-4"
        >
          <Plus className="w-5 h-5 mr-1" />
          Ny
        </button>
      </div>

      <div className="space-y-2">
        {(ratesQ.data ?? []).map((r) => (
          <div
            key={r.id}
            className={`surface-card flex items-center justify-between p-4 ${!r.is_active ? "opacity-60" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{r.name}</span>
                {!r.is_active && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    Inaktiv
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                {r.amount} {r.currency === "NOK" ? "kr/t" : `${r.currency}/t`}
                {r.description ? ` · ${r.description}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleActive(r)}
                className="text-xs text-muted-foreground px-2 py-1"
              >
                {r.is_active ? "Arkiver" : "Aktiver"}
              </button>
              <button
                onClick={() => {
                  setEditing(r);
                  setOpen(true);
                }}
                className="p-2 text-muted-foreground hover:text-foreground"
                aria-label="Rediger"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => remove(r)}
                className="p-2 text-muted-foreground hover:text-destructive"
                aria-label="Slett"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {ratesQ.data?.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Ingen satser ennå.</p>
        )}
      </div>

      {open && (
        <RateSheet
          key={editing?.id ?? "new"}
          orgId={orgId}
          rate={editing}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function RateSheet({
  orgId,
  rate,
  onClose,
}: {
  orgId: string;
  rate: Rate | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(rate?.name ?? "");
  const [amount, setAmount] = useState(rate?.amount.toString() ?? "");
  const [currency, setCurrency] = useState(rate?.currency ?? "NOK");
  const [description, setDescription] = useState(rate?.description ?? "");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !amount) return;
    setBusy(true);
    const payload = {
      organization_id: orgId,
      name: name.trim(),
      amount: Number(amount),
      currency: currency.trim() || "NOK",
      description: description.trim() || null,
    };
    const res = rate
      ? await supabase.from("rates").update(payload).eq("id", rate.id)
      : await supabase.from("rates").insert({ ...payload, is_active: true });
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(rate ? "Oppdatert" : "Opprettet");
    qc.invalidateQueries({ queryKey: ["rates"] });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{rate ? "Rediger sats" : "Ny sats"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-muted-foreground"
            aria-label="Lukk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Navn</label>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="f.eks. Rigging"
            className="w-full h-11 px-3 rounded-xl bg-input border border-border"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Beløp per time</label>
            <input
              required
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="f.eks. 210"
              className="w-full h-11 px-3 rounded-xl bg-input border border-border"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Valuta</label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Beskrivelse (valgfri)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-input border border-border"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim() || !amount}
          className="w-full tap-target bg-primary text-primary-foreground h-12 disabled:opacity-60"
        >
          {rate ? "Lagre" : "Opprett"}
        </button>
      </form>
    </div>
  );
}
