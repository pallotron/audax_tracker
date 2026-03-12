import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOverrides, putOverrides, deleteOverrides } from "../../cloud/client";
import type { BackupExport } from "../../db/database";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const BASE = "https://api.example.com";
const TOKEN = "test-token";

const sampleBackup: BackupExport = {
  version: 2,
  exportedAt: "2026-01-01T00:00:00.000Z",
  preferences: { cloudSyncEnabled: true },
  activities: [],
};

beforeEach(() => mockFetch.mockReset());

describe("getOverrides", () => {
  it("returns null when server returns 204", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    expect(await getOverrides(BASE, TOKEN)).toBeNull();
  });

  it("returns parsed backup when server returns 200", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => sampleBackup });
    expect(await getOverrides(BASE, TOKEN)).toEqual(sampleBackup);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" });
    await expect(getOverrides(BASE, TOKEN)).rejects.toThrow("GET /overrides failed: 401");
  });
});

describe("putOverrides", () => {
  it("sends PUT with JSON body and Authorization header", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await putOverrides(BASE, TOKEN, sampleBackup);
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/overrides`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });
    await expect(putOverrides(BASE, TOKEN, sampleBackup)).rejects.toThrow("PUT /overrides failed: 429");
  });
});

describe("deleteOverrides", () => {
  it("sends DELETE with Authorization header", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await deleteOverrides(BASE, TOKEN);
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/overrides`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(deleteOverrides(BASE, TOKEN)).rejects.toThrow("DELETE /overrides failed: 500");
  });
});
