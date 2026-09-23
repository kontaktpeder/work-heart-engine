import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inheritShiftWindow, normalizeClock } from "./schedule-times.mjs";

describe("inheritShiftWindow", () => {
  const day = { start_time: "08:00", end_time: "16:00", break_minutes: 30 };

  it("copies the production day when the assignment omits times", () => {
    assert.deepEqual(inheritShiftWindow(day, {}), {
      start_time: "08:00:00",
      end_time: "16:00:00",
      break_minutes: 30,
    });
  });

  it("keeps a later start on one assignment", () => {
    assert.deepEqual(
      inheritShiftWindow(day, { start_time: "10:00", end_time: "18:00", break_minutes: 0 }),
      { start_time: "10:00:00", end_time: "18:00:00", break_minutes: 0 },
    );
  });

  it("rejects a clock that is not HH:MM", () => {
    assert.equal(normalizeClock("8:00"), null);
    assert.equal(normalizeClock("25:00"), null);
  });
});
