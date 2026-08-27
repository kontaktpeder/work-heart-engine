import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySheetScrollChain } from "./sheetMotion.ts";

const half = {
  startSheetY: 200,
  startScrollTop: 0,
  fullY: 0,
  maxScroll: 400,
  grabber: false,
};

const fullScrolled = {
  startSheetY: 0,
  startScrollTop: 100,
  fullY: 0,
  maxScroll: 400,
  grabber: false,
};

describe("applySheetScrollChain", () => {
  it("moves only the sheet from the grabber, even when the list can scroll", () => {
    assert.deepEqual(
      applySheetScrollChain({ ...fullScrolled, grabber: true, fingerDy: 40 }),
      { sheetY: 40, scrollTop: 100 },
    );
    assert.deepEqual(
      applySheetScrollChain({ ...fullScrolled, grabber: true, fingerDy: -40 }),
      { sheetY: -40, scrollTop: 100 },
    );
  });

  it("expands a half-open sheet before the list scrolls", () => {
    assert.deepEqual(applySheetScrollChain({ ...half, fingerDy: -80 }), {
      sheetY: 120,
      scrollTop: 0,
    });
    assert.deepEqual(applySheetScrollChain({ ...half, fingerDy: -250 }), {
      sheetY: 0,
      scrollTop: 50,
    });
  });

  it("unwinds list scroll before the sheet follows down", () => {
    assert.deepEqual(applySheetScrollChain({ ...fullScrolled, fingerDy: 40 }), {
      sheetY: 0,
      scrollTop: 60,
    });
    assert.deepEqual(applySheetScrollChain({ ...fullScrolled, fingerDy: 80 }), {
      sheetY: 0,
      scrollTop: 20,
    });
    assert.deepEqual(applySheetScrollChain({ ...fullScrolled, fingerDy: 150 }), {
      sheetY: 50,
      scrollTop: 0,
    });
  });

  it("drags the sheet down immediately when the list is already at the top", () => {
    assert.deepEqual(
      applySheetScrollChain({ ...half, startSheetY: 0, fingerDy: 50 }),
      { sheetY: 50, scrollTop: 0 },
    );
  });

  it("scrolls the list up when the sheet is already full", () => {
    assert.deepEqual(
      applySheetScrollChain({ ...fullScrolled, startScrollTop: 0, fingerDy: -30 }),
      { sheetY: 0, scrollTop: 30 },
    );
  });
});
