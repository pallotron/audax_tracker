import { describe, it, expect } from "vitest";

import { computeAfterEpoch } from "../../context/SyncContext";

describe("computeAfterEpoch", () => {
  it("returns undefined when lastSync is null (first sync — fetch full history)", () => {
    expect(computeAfterEpoch(null)).toBeUndefined();
  });

  it("returns unix epoch seconds minus 60s buffer when lastSync is set (incremental sync)", () => {
    const ts = "2025-06-15T06:00:00.000Z";
    const expected = Math.floor(new Date(ts).getTime() / 1000) - 60;
    expect(computeAfterEpoch(ts)).toBe(expected);
  });

  it("returns epoch even when DB has activities with null lat/lng (indoor rides do not trigger full sync)", () => {
    const ts = "2025-06-15T06:00:00.000Z";
    // computeAfterEpoch is a pure function — it only uses lastSync, never inspects the DB
    expect(computeAfterEpoch(ts)).toBe(Math.floor(new Date(ts).getTime() / 1000) - 60);
  });
});
