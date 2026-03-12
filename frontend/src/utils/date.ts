/**
 * Format a date in an unambiguous, locale-aware format (e.g. "8 Dec 2024" or "Dec 8, 2024").
 * Using explicit options avoids the browser defaulting to a numeric M/D/YYYY or D/M/YYYY
 * format that is ambiguous depending on locale.
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
