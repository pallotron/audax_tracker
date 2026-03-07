import { useMemo, useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Activity } from "../db/database";
import type { EventType } from "../db/types";
import { useSync } from "../hooks/useSync";
import { ActivityRow } from "../components/ActivityRow";
import { ClassificationLegend } from "../components/EventTypeBadge";

const AUDAX_EVENT_TYPES: NonNullable<EventType>[] = [
  "BRM200",
  "BRM300",
  "BRM400",
  "BRM600",
  "BRM1000",
  "PBP",
  "RM1200+",
  "Fleche",
  "SuperRandonneur",
  "TraceVelocio",
  "FlecheDeFrance",
  "Other",
];

type SortKey = "date" | "name" | "distance" | "elevationGain" | "movingTime" | "elapsedTime" | "eventType" | "homologationNumber";
type SortDir = "asc" | "desc";

function getSortValue(a: Activity, key: SortKey): string | number {
  switch (key) {
    case "date":
      return a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
    case "name":
      return a.name.toLowerCase();
    case "distance":
      return a.distance;
    case "elevationGain":
      return a.elevationGain;
    case "movingTime":
      return a.movingTime;
    case "elapsedTime":
      return a.elapsedTime;
    case "eventType":
      return a.eventType ?? "";
    case "homologationNumber":
      return a.homologationNumber ?? "";
  }
}

export default function ActivitiesPage() {
  const { sync, syncing, progress, error } = useSync();
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [audaxOnly, setAudaxOnly] = useState(false);
  const [needsConfirmOnly, setNeedsConfirmOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const activities = useLiveQuery(
    () => db.activities.orderBy("date").reverse().toArray(),
    []
  );

  const years = useMemo(() => {
    if (!activities) return [];
    const set = new Set<number>();
    for (const a of activities) {
      const d = a.date instanceof Date ? a.date : new Date(a.date);
      set.add(d.getFullYear());
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [activities]);

  const filtered = useMemo(() => {
    if (!activities) return [];
    let result = activities.filter((a) => {
      if (yearFilter !== "all") {
        const d = a.date instanceof Date ? a.date : new Date(a.date);
        if (d.getFullYear() !== Number(yearFilter)) return false;
      }
      if (audaxOnly && a.eventType === null) return false;
      if (needsConfirmOnly && !(a.needsConfirmation && !a.manualOverride)) return false;
      if (selectedTypes.size > 0) {
        const typeKey = a.eventType ?? "__null__";
        if (!selectedTypes.has(typeKey)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [activities, yearFilter, selectedTypes, audaxOnly, needsConfirmOnly, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const resetPage = () => setPage(0);
  const handleYearChange = (v: string) => { setYearFilter(v); resetPage(); };
  const toggleType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
    resetPage();
  };
  const clearTypeFilter = () => { setSelectedTypes(new Set()); resetPage(); };
  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortDir(key === "name" || key === "eventType" ? "asc" : "desc");
      }
      return key;
    });
    resetPage();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Activities</h1>
        <button
          onClick={sync}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncing ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {progress
                ? `Fetched ${progress.fetched}…`
                : "Connecting..."}
            </>
          ) : (
            "Sync with Strava"
          )}
        </button>
      </div>

      {syncing && progress && (
        <div className="w-full rounded-full bg-gray-200 h-2.5 overflow-hidden">
          <div
            className="bg-orange-500 h-2.5 rounded-full animate-pulse"
            style={{ width: "100%" }}
          />
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="year-filter" className="mr-2 text-sm font-medium text-gray-700">
              Year:
            </label>
            <select
              id="year-filter"
              value={yearFilter}
              onChange={(e) => handleYearChange(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <label className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={audaxOnly}
              onChange={(e) => { setAudaxOnly(e.target.checked); resetPage(); }}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            Audax only
          </label>
          <label className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={needsConfirmOnly}
              onChange={(e) => { setNeedsConfirmOnly(e.target.checked); resetPage(); }}
              className="rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
            />
            Needs confirmation
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-gray-700 mr-1">Type:</span>
          {selectedTypes.size > 0 && (
            <button
              onClick={clearTypeFilter}
              className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 hover:bg-gray-300"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => toggleType("__null__")}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              selectedTypes.has("__null__")
                ? "bg-gray-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            (unclassified)
          </button>
          {AUDAX_EVENT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                selectedTypes.has(t)
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {activities === undefined ? (
        <p className="text-gray-500">Loading...</p>
      ) : activities.length === 0 ? (
        <p className="text-gray-500">
          No activities yet. Click "Sync with Strava" to import your rides.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">
          No activities match the selected filters.
        </p>
      ) : (
        <>
        <ClassificationLegend />
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {([
                  ["date", "Date", "text-left"],
                  ["name", "Name", "text-left"],
                  ["distance", "Km", "text-right"],
                  ["elevationGain", "Elev (m)", "text-right"],
                  ["movingTime", "Moving", "text-left"],
                  ["elapsedTime", "Elapsed", "text-left"],
                  ["eventType", "Type", "text-left"],
                  ["homologationNumber", "Homologation", "text-left"],
                ] as [SortKey, string, string][]).map(([key, label, align]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`px-3 py-2 ${align} text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer select-none hover:text-gray-700`}
                  >
                    {label}
                    {sortKey === key && (
                      <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {/* edit */}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {paged.map((a) => (
                <ActivityRow key={a.stravaId} activity={a} />
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
