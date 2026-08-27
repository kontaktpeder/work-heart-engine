import assert from "node:assert/strict";
import { describe, it } from "node:test";

function isOrgAdmin(role) {
  return role === "owner" || role === "admin";
}

function canEditCatalog(role) {
  return isOrgAdmin(role) || role === "editor";
}

function allowsAccess(access, role) {
  if (access === "admin") return isOrgAdmin(role);
  if (access === "editor") return canEditCatalog(role);
  return true;
}

const SETTINGS_ITEMS = [
  { section: "report", access: "member" },
  { section: "members", access: "admin" },
  { section: "organization", access: "admin" },
  { section: "projects", access: "editor" },
  { section: "rates", access: "editor" },
  { section: "finance", access: "admin" },
  { section: "api-keys", access: "admin" },
];

function visibleSections(role) {
  return SETTINGS_ITEMS.filter((item) => allowsAccess(item.access, role)).map((i) => i.section);
}

function hasRequiredEmployeeName(name) {
  return Boolean(String(name ?? "").trim());
}

describe("editor settings visibility", () => {
  it("shows only report, projects and rates to editors", () => {
    assert.deepEqual(visibleSections("editor"), ["report", "projects", "rates"]);
  });

  it("hides admin-only panes from viewers", () => {
    assert.deepEqual(visibleSections("viewer"), ["report"]);
  });

  it("keeps the full list for owners and admins", () => {
    const expected = [
      "report",
      "members",
      "organization",
      "projects",
      "rates",
      "finance",
      "api-keys",
    ];
    assert.deepEqual(visibleSections("owner"), expected);
    assert.deepEqual(visibleSections("admin"), expected);
  });
});

describe("export employee name", () => {
  it("requires a non-empty ansattnavn", () => {
    assert.equal(hasRequiredEmployeeName("Ada"), true);
    assert.equal(hasRequiredEmployeeName("  "), false);
    assert.equal(hasRequiredEmployeeName(""), false);
    assert.equal(hasRequiredEmployeeName(null), false);
  });
});
