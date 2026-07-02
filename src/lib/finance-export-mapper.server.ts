// Server-side Finance Core HTTP client + time-entry → finance-entry mapper.

const SOURCE_APP = "work-core";
const SOURCE_TYPE = "time_entry";

export type FinanceEntryCreate = {
  entry_type: "expense";
  entry_date: string;
  description: string;
  counterparty?: string;
  category?: string;
  category_group?: string;
  amount_gross: number;
  vat_rate?: number;
  source_app: string;
  source_type: string;
  source_ref: string;
  external_url?: string;
  notes?: string;
};

export async function createFinanceEntry(params: {
  baseUrl: string;
  apiKey: string;
  body: FinanceEntryCreate;
}): Promise<{ id: string; data: unknown }> {
  const base = params.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/public/v1/entries`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ??
        `Finance API ${res.status}: ${JSON.stringify(json)}`,
    );
  }
  const id = (json as { data?: { id?: string } }).data?.id;
  if (!id) throw new Error("Finance API returned no entry id");
  return { id, data: json };
}

export async function pingFinance(params: {
  baseUrl: string;
  apiKey: string;
}): Promise<void> {
  const base = params.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/public/v1/entries?limit=1`, {
    headers: { Authorization: `Bearer ${params.apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Finance API ${res.status}: ${body.slice(0, 200)}`);
  }
}

export function mapTimeEntryToFinanceEntry(input: {
  timeEntryId: string;
  entryDate: string;
  projectName: string | null;
  rateName: string | null;
  hours: number;
  amount: number;
  comment: string | null;
  workOrgId: string;
  workBaseUrl: string;
}): FinanceEntryCreate {
  const proj = input.projectName ?? "General";
  const rate = input.rateName ?? "Regular";
  const desc = `Work: ${proj} — ${input.hours.toFixed(2)}h (${rate})`;
  return {
    entry_type: "expense",
    entry_date: input.entryDate,
    description: desc.slice(0, 500),
    counterparty: "Internal labor",
    category: "Labor",
    category_group: proj,
    amount_gross: Math.round(input.amount * 100) / 100,
    vat_rate: 0,
    source_app: SOURCE_APP,
    source_type: SOURCE_TYPE,
    source_ref: input.timeEntryId,
    external_url: `${input.workBaseUrl.replace(/\/+$/, "")}/orgs/${input.workOrgId}`,
    notes: input.comment?.slice(0, 2000) ?? undefined,
  };
}
