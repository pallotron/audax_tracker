import type { BackupExport } from "../db/database";

export async function getOverrides(baseUrl: string, token: string): Promise<BackupExport | null> {
  const res = await fetch(`${baseUrl}/overrides`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`GET /overrides failed: ${res.status}`);
  return res.json() as Promise<BackupExport>;
}

export async function putOverrides(
  baseUrl: string,
  token: string,
  backup: BackupExport
): Promise<void> {
  const res = await fetch(`${baseUrl}/overrides`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(backup),
  });
  if (!res.ok) throw new Error(`PUT /overrides failed: ${res.status}`);
}

export async function deleteOverrides(baseUrl: string, token: string): Promise<void> {
  const res = await fetch(`${baseUrl}/overrides`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DELETE /overrides failed: ${res.status}`);
}
