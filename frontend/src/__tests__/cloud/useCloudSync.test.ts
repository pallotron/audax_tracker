import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCloudSync } from "../../cloud/useCloudSync";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ getAccessToken: async () => "mock-token" }),
}));
vi.mock("../../config", () => ({
  config: { oauthWorkerUrl: "https://api.test.com" },
}));

const mockGetOverrides = vi.fn().mockResolvedValue(null);
const mockPutOverrides = vi.fn().mockResolvedValue(undefined);
const mockDeleteOverrides = vi.fn().mockResolvedValue(undefined);

vi.mock("../../cloud/client", () => ({
  getOverrides: (...args: unknown[]) => mockGetOverrides(...args),
  putOverrides: (...args: unknown[]) => mockPutOverrides(...args),
  deleteOverrides: (...args: unknown[]) => mockDeleteOverrides(...args),
}));

vi.mock("../../db/database", () => ({
  exportBackup: vi.fn().mockResolvedValue({
    version: 2,
    exportedAt: "2026-01-01T00:00:00.000Z",
    preferences: { cloudSyncEnabled: true },
    activities: [],
  }),
  importBackup: vi.fn().mockResolvedValue(undefined),
  db: {
    activities: {
      hook: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    },
  },
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("useCloudSync", () => {
  it("is disabled by default when no localStorage key is set", () => {
    const { result } = renderHook(() => useCloudSync());
    expect(result.current.enabled).toBe(false);
  });

  it("is enabled when audax_cloud_sync_enabled is 'true' in localStorage", () => {
    localStorage.setItem("audax_cloud_sync_enabled", "true");
    const { result } = renderHook(() => useCloudSync());
    expect(result.current.enabled).toBe(true);
  });

  it("enable() sets enabled to true and writes to localStorage", async () => {
    const { result } = renderHook(() => useCloudSync());
    await act(async () => { result.current.enable(); });
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem("audax_cloud_sync_enabled")).toBe("true");
  });

  it("disable(false) sets enabled to false without calling deleteOverrides", async () => {
    localStorage.setItem("audax_cloud_sync_enabled", "true");
    const { result } = renderHook(() => useCloudSync());
    await act(async () => { await result.current.disable(false); });
    expect(result.current.enabled).toBe(false);
    expect(localStorage.getItem("audax_cloud_sync_enabled")).toBe("false");
    expect(mockDeleteOverrides).not.toHaveBeenCalled();
  });

  it("disable(true) calls deleteOverrides", async () => {
    localStorage.setItem("audax_cloud_sync_enabled", "true");
    const { result } = renderHook(() => useCloudSync());
    await act(async () => { await result.current.disable(true); });
    expect(mockDeleteOverrides).toHaveBeenCalledWith("https://api.test.com", "mock-token");
  });
});
