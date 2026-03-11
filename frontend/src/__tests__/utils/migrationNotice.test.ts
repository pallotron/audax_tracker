import { describe, it, expect, beforeEach } from "vitest";
import { shouldShowMigrationNotice, dismissMigrationNotice } from "../../utils/migrationNotice";

const FLAG = "audax_awards_filter_migrated";

beforeEach(() => {
  localStorage.removeItem(FLAG);
});

describe("shouldShowMigrationNotice", () => {
  it("returns true when flag is not set", () => {
    expect(shouldShowMigrationNotice()).toBe(true);
  });

  it("returns false after flag is set", () => {
    localStorage.setItem(FLAG, "1");
    expect(shouldShowMigrationNotice()).toBe(false);
  });
});

describe("dismissMigrationNotice", () => {
  it("sets the flag in localStorage", () => {
    dismissMigrationNotice();
    expect(localStorage.getItem(FLAG)).toBe("1");
  });

  it("makes shouldShowMigrationNotice return false", () => {
    dismissMigrationNotice();
    expect(shouldShowMigrationNotice()).toBe(false);
  });
});
