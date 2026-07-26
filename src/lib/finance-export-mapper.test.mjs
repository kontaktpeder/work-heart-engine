import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Lightweight contract smoke test (plain JS mirror of mapper rules).
function mapTimeEntryToFinanceEntry(input) {
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
    source_app: "work-core",
    source_type: "time_entry",
    source_ref: input.timeEntryId,
    external_url: `${input.workBaseUrl.replace(/\/+$/, "")}/orgs/${input.workOrgId}`,
  };
}

describe("finance export mapper contract", () => {
  it("maps billable time to Finance expense shape", () => {
    const body = mapTimeEntryToFinanceEntry({
      timeEntryId: "11111111-1111-4111-8111-111111111111",
      entryDate: "2026-07-01",
      projectName: "Client A",
      rateName: "Ordinær",
      hours: 2.5,
      amount: 525.5,
      comment: null,
      workOrgId: "22222222-2222-4222-8222-222222222222",
      workBaseUrl: "https://work.example.com/",
    });
    assert.equal(body.entry_type, "expense");
    assert.equal(body.source_app, "work-core");
    assert.equal(body.source_type, "time_entry");
    assert.equal(body.amount_gross, 525.5);
    assert.equal(body.vat_rate, 0);
    assert.match(body.description, /Client A/);
    assert.equal(
      body.external_url,
      "https://work.example.com/orgs/22222222-2222-4222-8222-222222222222",
    );
  });
});
