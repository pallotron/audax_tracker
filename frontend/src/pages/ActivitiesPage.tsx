import { useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, bulkConfirm, bulkSetType, bulkSetDnf, bulkExcludeFromAwards, bulkIncludeInAwards, type Activity } from "../db/database";
import type { EventType } from "../db/types";
import { useSyncContext } from "../context/SyncContext";
import { ActivityRow } from "../components/ActivityRow";
import { BulkActionBar } from "../components/BulkActionBar";
import { ClassificationLegend } from "../components/EventTypeBadge";
import { formatDuration } from "../utils/formatDuration";

const AUDAX_EVENT_TYPES_ROW1: NonNullable<EventType>[] = [
  "BRM200",
  "BRM300",
  "BRM400",
  "BRM600",
  "BRM1000",
  "PBP",
  "RM1200+",
];

const AUDAX_EVENT_TYPES_ROW2: NonNullable<EventType>[] = [
  "Fleche",
  "SR600",
  "TraceVelocio",
  "FlecheDeFrance",
  "Permanent",
  "Other",
];

const SHOW_ONLY_OPTIONS = [
  { id: "audax", label: "Audax" },
  { id: "needsConfirm", label: "Needs confirmation" },
  { id: "dnf", label: "DNF" },
  { id: "noHomologation", label: "Missing homologation #" },
  { id: "awardsEligible", label: "Awards eligible" },
  { id: "noPermanents", label: "Exclude permanents" },
] as const;

type ShowOnlyId = typeof SHOW_ONLY_OPTIONS[number]["id"];

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
  const { syncing, progress, error, refreshActivity, refreshing, refreshErrors } = useSyncContext();
  const [searchParams, setSearchParams] = useSearchParams();

  // All filter state lives in the URL
  const textFilter = searchParams.get("q") ?? "";
  const yearFilter = searchParams.get("year") ?? "all";
  const selectedTypes = useMemo(
    () => new Set(searchParams.getAll("type")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams.toString()]
  );
  const activeFilters = useMemo(
    () => new Set((searchParams.get("filter") ?? "").split(",").filter(Boolean) as ShowOnlyId[]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams.toString()]
  );

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showTypeFilter, setShowTypeFilter] = useState(() => selectedTypes.size > 0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetPage = () => setPage(0);

  const updateParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value) next.delete(key); else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleTextChange = (value: string) => {
    updateParam("q", value || null);
    resetPage();
  };

  const handleYearChange = (value: string) => {
    updateParam("year", value === "all" ? null : value);
    resetPage();
  };

  const toggleType = useCallback((type: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const types = new Set(prev.getAll("type"));
      if (types.has(type)) types.delete(type); else types.add(type);
      next.delete("type");
      for (const t of types) next.append("type", t);
      return next;
    }, { replace: true });
    resetPage();
  }, [setSearchParams]);

  const clearTypeFilter = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("type");
      return next;
    }, { replace: true });
    resetPage();
  }, [setSearchParams]);

  const toggleShowOnly = useCallback((id: ShowOnlyId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const filters = new Set((prev.get("filter") ?? "").split(",").filter(Boolean));
      if (filters.has(id)) filters.delete(id); else filters.add(id);
      if (filters.size === 0) next.delete("filter"); else next.set("filter", [...filters].join(","));
      return next;
    }, { replace: true });
    resetPage();
  }, [setSearchParams]);

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
      if (activeFilters.has("audax") && a.eventType === null) return false;
      if (activeFilters.has("needsConfirm") && !(a.needsConfirmation && !a.manualOverride)) return false;
      if (activeFilters.has("dnf") && !a.dnf) return false;
      if (activeFilters.has("noHomologation") && !(a.eventType !== null && !a.homologationNumber)) return false;
      if (activeFilters.has("awardsEligible") && a.excludeFromAwards) return false;
      if (activeFilters.has("noPermanents") && a.eventType === "Permanent") return false;
      if (selectedTypes.size > 0) {
        const typeKey = a.eventType ?? "__null__";
        if (!selectedTypes.has(typeKey)) return false;
      }
      if (textFilter) {
        if (!a.name.toLowerCase().includes(textFilter.toLowerCase())) return false;
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
  }, [activities, yearFilter, selectedTypes, activeFilters, textFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allFilteredIds = filtered.map((a) => a.stravaId);
      const allSelected = allFilteredIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of allFilteredIds) next.delete(id);
        return next;
      } else {
        const next = new Set(prev);
        for (const id of allFilteredIds) next.add(id);
        return next;
      }
    });
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectionSummary = useMemo(() => {
    if (filtered.length === 0) return null;
    const source = selectedIds.size > 0
      ? filtered.filter((a) => selectedIds.has(a.stravaId))
      : filtered;
    const totalDistance = source.reduce((sum, a) => sum + a.distance, 0);
    const totalElevation = source.reduce((sum, a) => sum + a.elevationGain, 0);
    const audaxCount = source.filter((a) => a.eventType !== null).length;
    const totalMoving = source.reduce((sum, a) => sum + a.movingTime, 0);
    const totalElapsed = source.reduce((sum, a) => sum + a.elapsedTime, 0);
    const byCountry = new Map<string, number>();
    for (const a of source) {
      const key = a.startCountry ?? "Unknown";
      byCountry.set(key, (byCountry.get(key) ?? 0) + 1);
    }
    return { count: source.length, isSelection: selectedIds.size > 0, totalDistance, totalElevation, audaxCount, totalMoving, totalElapsed, byCountry };
  }, [filtered, selectedIds]);

  const handleBulkConfirm = useCallback(async () => {
    await bulkConfirm(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleBulkSetType = useCallback(async (eventType: EventType) => {
    await bulkSetType(Array.from(selectedIds), eventType);
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleBulkSetDnf = useCallback(async (dnf: boolean) => {
    await bulkSetDnf(Array.from(selectedIds), dnf);
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleBulkExcludeFromAwards = useCallback(async () => {
    await bulkExcludeFromAwards(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleBulkIncludeInAwards = useCallback(async () => {
    await bulkIncludeInAwards(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const handleBulkRefresh = useCallback(async () => {
    await Promise.allSettled(Array.from(selectedIds).map((id) => refreshActivity(id)));
    setSelectedIds(new Set());
  }, [selectedIds, refreshActivity]);

  const handleToggleExpand = useCallback((id: string) => {
    if (editingId !== null) return;
    setExpandedId((prev) => (prev === id ? null : id));
  }, [editingId]);

  const handleEditingChange = useCallback((id: string, editing: boolean) => {
    if (editing) {
      setEditingId(id);
      setExpandedId(id);
    } else {
      setEditingId(null);
    }
  }, []);

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selectedIds.has(a.stravaId));
  const someFilteredSelected = filtered.some((a) => selectedIds.has(a.stravaId));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Activities</h1>

      {syncing && (
        <div className="w-full rounded-full bg-gray-200 h-2.5 overflow-hidden">
          <div
            className="bg-orange-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: progress ? `${Math.min((progress.fetched / Math.max(progress.fetched + 50, 100)) * 100, 95)}%` : "15%" }}
          />
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2">
        {/* Row 1: text search + year + reset */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={textFilter}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Filter by name…"
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-orange-500 focus:ring-orange-500"
          />
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
          {(textFilter || yearFilter !== "all" || selectedTypes.size > 0 || activeFilters.size > 0) && (
            <button
              onClick={() => { setSearchParams({}, { replace: true }); resetPage(); }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Row 2: show-only chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-gray-700 mr-1">Filters:</span>
          {SHOW_ONLY_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => toggleShowOnly(id)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                activeFilters.has(id)
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Type chips */}
        <div className="space-y-1.5">
          <button
            onClick={() => setShowTypeFilter((v) => !v)}
            className="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Filter by type{selectedTypes.size > 0 ? ` (${selectedTypes.size} active)` : ""} {showTypeFilter ? "▲" : "▼"}
          </button>
          {showTypeFilter && (
            <div className="flex items-start gap-1.5">
              <div className="flex flex-wrap gap-1.5">
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
                {[...AUDAX_EVENT_TYPES_ROW1, ...AUDAX_EVENT_TYPES_ROW2].map((t) => (
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
          )}
        </div>
      </div>

      {/* Selection summary */}
      {selectionSummary && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-orange-900">
              {selectionSummary.isSelection ? "Selection" : "Filter"} summary — {selectionSummary.count} ride{selectionSummary.count !== 1 ? "s" : ""}
            </h3>
            <span className="text-xs text-orange-700">{selectionSummary.audaxCount} audax</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-orange-800 sm:grid-cols-4">
            <div>
              <span className="font-medium">Distance</span>
              <div className="text-sm font-semibold text-orange-900">{Math.round(selectionSummary.totalDistance).toLocaleString()} km</div>
            </div>
            <div>
              <span className="font-medium">Elevation</span>
              <div className="text-sm font-semibold text-orange-900">{Math.round(selectionSummary.totalElevation).toLocaleString()} m</div>
            </div>
            <div>
              <span className="font-medium">Moving time</span>
              <div className="text-sm font-semibold text-orange-900">{formatDuration(selectionSummary.totalMoving)}</div>
            </div>
            <div>
              <span className="font-medium">Elapsed time</span>
              <div className="text-sm font-semibold text-orange-900">{formatDuration(selectionSummary.totalElapsed)}</div>
            </div>
          </div>
          {selectionSummary.byCountry.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...selectionSummary.byCountry.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([country, count]) => (
                  <span
                    key={country}
                    className="rounded-full bg-orange-200 px-2 py-0.5 text-xs text-orange-800"
                  >
                    {country} × {count}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
            <ClassificationLegend />
            <div className="text-xs text-gray-500">
              Homologation # can be retrieved from{" "}
              <a
                href="https://myaccount.audax-club-parisien.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-600 hover:underline font-medium"
              >
                Audax Club Parisien
              </a>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="hidden sm:table-cell px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                  </th>
                  {([
                    ["date", "Date", "text-left", false],
                    ["name", "Name", "text-left", false],
                    ["distance", "Km", "text-right", false],
                    ["elevationGain", "Elev (m)", "text-right", true],
                    ["movingTime", "Moving", "text-left", true],
                    ["elapsedTime", "Elapsed", "text-left", true],
                    ["eventType", "Type", "text-left", false],
                    ["homologationNumber", "Homologation", "text-left", true],
                  ] as [SortKey, string, string, boolean][]).map(([key, label, align, mobileHidden]) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className={`${mobileHidden ? "hidden sm:table-cell" : ""} px-3 py-2 ${align} text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer select-none hover:text-gray-700`}
                    >
                      {label}
                      {sortKey === key && (
                        <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </th>
                  ))}
                  <th className="hidden sm:table-cell px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                    Awards
                  </th>
                  <th className="hidden sm:table-cell px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Start
                  </th>
                  <th className="hidden sm:table-cell px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {/* edit */}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {paged.map((a) => (
                  <ActivityRow
                    key={a.stravaId}
                    activity={a}
                    selected={selectedIds.has(a.stravaId)}
                    onToggle={toggleSelect}
                    onRefresh={() => refreshActivity(a.stravaId)}
                    refreshing={refreshing.has(a.stravaId)}
                    refreshError={refreshErrors.get(a.stravaId) ?? null}
                    isExpanded={expandedId === a.stravaId}
                    onToggleExpand={() => handleToggleExpand(a.stravaId)}
                    isEditing={editingId === a.stravaId}
                    onEditingChange={(editing) => handleEditingChange(a.stravaId, editing)}
                  />
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

      <div className="hidden sm:block">
        <BulkActionBar
          selectedCount={selectedIds.size}
          onConfirm={handleBulkConfirm}
          onSetType={handleBulkSetType}
          onSetDnf={handleBulkSetDnf}
          onExcludeFromAwards={handleBulkExcludeFromAwards}
          onIncludeInAwards={handleBulkIncludeInAwards}
          onRefresh={handleBulkRefresh}
          onClear={clearSelection}
        />
      </div>
    </div>
  );
}
