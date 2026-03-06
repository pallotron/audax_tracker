import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import type { EventType } from "../db/types";
import { useSync } from "../hooks/useSync";
import { ActivityRow } from "../components/ActivityRow";

const EVENT_TYPE_FILTER_OPTIONS: EventType[] = [
  null,
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

export default function ActivitiesPage() {
  const { sync, syncing, error } = useSync();
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");

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
    return activities.filter((a) => {
      if (yearFilter !== "all") {
        const d = a.date instanceof Date ? a.date : new Date(a.date);
        if (d.getFullYear() !== Number(yearFilter)) return false;
      }
      if (eventTypeFilter !== "all") {
        if (eventTypeFilter === "__null__") {
          if (a.eventType !== null) return false;
        } else {
          if (a.eventType !== eventTypeFilter) return false;
        }
      }
      return true;
    });
  }, [activities, yearFilter, eventTypeFilter]);

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
              Syncing...
            </>
          ) : (
            "Sync with Strava"
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div>
          <label
            htmlFor="year-filter"
            className="mr-2 text-sm font-medium text-gray-700"
          >
            Year:
          </label>
          <select
            id="year-filter"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="type-filter"
            className="mr-2 text-sm font-medium text-gray-700"
          >
            Type:
          </label>
          <select
            id="type-filter"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="all">All types</option>
            <option value="__null__">(unclassified)</option>
            {EVENT_TYPE_FILTER_OPTIONS.filter((t) => t !== null).map((t) => (
              <option key={t} value={t!}>
                {t}
              </option>
            ))}
          </select>
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
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Km
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Elev (m)
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Moving
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Elapsed
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Homologation
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {/* edit */}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((a) => (
                <ActivityRow key={a.stravaId} activity={a} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
