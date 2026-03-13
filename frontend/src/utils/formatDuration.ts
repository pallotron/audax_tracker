export function formatDuration(seconds: number): string {
  const y = Math.floor(seconds / (365 * 86400));
  const d = Math.floor((seconds % (365 * 86400)) / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (y > 0) parts.push(`${y}yr`);
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || y === 0) parts.push(`${h}h`);
  parts.push(`${m.toString().padStart(2, "0")}m`);
  return parts.join(" ");
}
