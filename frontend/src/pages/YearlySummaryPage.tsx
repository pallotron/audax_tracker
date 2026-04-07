import { useState, useMemo, Fragment } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Activity } from "../db/database";
import { EventTypeBadge, ClassificationLegend } from "../components/EventTypeBadge";
import { formatDate } from "../utils/date";
import { formatDuration } from "../utils/formatDuration";
import { activitySeason } from "../awards/awards";

export default function YearlySummaryPage() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [mode, setMode] = useState<"year" | "season">("year");
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const activities = useLiveQuery(() => db.activities.toArray());

  const audaxActivities = useMemo(
    () => (activities ?? []).filter((a) => a.eventType !== null && !a.dnf),
    [activities],
  );

  const years = useMemo(
    () =>
      [
        ...new Set(audaxActivities.map((a) => new Date(a.date).getFullYear())),
      ].sort((a, b) => b - a),
    [audaxActivities],
  );

  const seasons = useMemo(
    () =>
      [
        ...new Set(
          audaxActivities.map((a) => activitySeason(a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10)))
        ),
      ].sort((a, b) => b.localeCompare(a)),
    [audaxActivities],
  );

  const activeYear = selectedYear ?? years[0] ?? new Date().getFullYear();

  const activeSeason = selectedSeason ?? seasons[0] ?? "";

  const yearActivities = useMemo(
    () =>
      audaxActivities
        .filter((a) => new Date(a.date).getFullYear() === activeYear)
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
    [audaxActivities, activeYear],
  );

  const seasonActivities = useMemo(
    () =>
      audaxActivities
        .filter((a) => activitySeason(a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10)) === activeSeason)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [audaxActivities, activeSeason],
  );

  const yearlyStats = useMemo(() => {
    return years.map((year) => {
      const ya = audaxActivities.filter(
        (a) => new Date(a.date).getFullYear() === year,
      );
      return {
        year,
        rides: ya.length,
        km: Math.round(ya.reduce((s, a) => s + a.distance, 0)),
        elevation: Math.round(ya.reduce((s, a) => s + a.elevationGain, 0)),
      };
    });
  }, [years, audaxActivities]);

  const seasonStats = useMemo(() => {
    return seasons.map((season) => {
      const sa = audaxActivities.filter(
        (a) => activitySeason(a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10)) === season
      );
      return {
        season,
        rides: sa.length,
        km: Math.round(sa.reduce((s, a) => s + a.distance, 0)),
        elevation: Math.round(sa.reduce((s, a) => s + a.elevationGain, 0)),
      };
    });
  }, [seasons, audaxActivities]);

  if (!activities) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const displayActivities = mode === "season" ? seasonActivities : yearActivities;
  const displayRideCount = displayActivities.length;
  const displayTotalKm = displayActivities.reduce((sum, a) => sum + a.distance, 0);
  const displayTotalElevation = displayActivities.reduce((sum, a) => sum + a.elevationGain, 0);
  const displayTotalMoving = displayActivities.reduce((sum, a) => sum + a.movingTime, 0);
  const displayTotalElapsed = displayActivities.reduce((sum, a) => sum + a.elapsedTime, 0);
  const displayByCountry = new Map<string, number>();
  for (const a of displayActivities) {
    const key = a.startCountry ?? "Unknown";
    displayByCountry.set(key, (displayByCountry.get(key) ?? 0) + 1);
  }
  const displayLabel = mode === "season" ? activeSeason : String(activeYear);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Audax {mode === "season" ? "Season" : "Yearly"} Summary
        </h1>
        {(mode === "year" ? years.length > 1 : seasons.length > 1) && (
          <button
            onClick={() => setShowComparison((v) => !v)}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            {showComparison
              ? "Hide comparison"
              : mode === "season"
                ? "Compare seasons"
                : "Compare years"}
          </button>
        )}
      </div>

      {/* Mode toggle + selector */}
      {(years.length > 0 || seasons.length > 0) && (
        <div className="space-y-2">
          <div className="flex gap-1">
            <button
              onClick={() => { setMode("year"); setShowComparison(false); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === "year"
                  ? "bg-gray-700 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Year
            </button>
            <button
              onClick={() => { setMode("season"); setShowComparison(false); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === "season"
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Season
            </button>
          </div>

          {mode === "year" && years.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    year === activeYear
                      ? "bg-orange-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          {mode === "season" && seasons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {seasons.map((season) => (
                <button
                  key={season}
                  onClick={() => setSelectedSeason(season)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    season === activeSeason
                      ? "bg-orange-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {season}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Multi-year/season comparison */}
      {showComparison && (
        <>
          {mode === "year" && yearlyStats.length > 0 && (
            <div className="overflow-x-auto rounded-lg bg-white shadow">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Year</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Rides</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Km</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Elevation (m)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {yearlyStats.map((s) => (
                    <tr
                      key={s.year}
                      className={`hover:bg-gray-50 cursor-pointer ${s.year === activeYear ? "bg-orange-50" : ""}`}
                      onClick={() => { setSelectedYear(s.year); setShowComparison(false); }}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.year}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">{s.rides}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">{s.km.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">{s.elevation.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {mode === "season" && seasonStats.length > 0 && (
            <div className="overflow-x-auto rounded-lg bg-white shadow">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Season</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Rides</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Km</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Elevation (m)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {seasonStats.map((s) => (
                    <tr
                      key={s.season}
                      className={`hover:bg-gray-50 cursor-pointer ${s.season === activeSeason ? "bg-orange-50" : ""}`}
                      onClick={() => { setSelectedSeason(s.season); setShowComparison(false); }}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.season}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">{s.rides}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">{s.km.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">{s.elevation.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Audax Rides</p>
          <p className="text-2xl font-bold text-gray-900">{displayRideCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total Km</p>
          <p className="text-2xl font-bold text-gray-900">{Math.round(displayTotalKm).toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total Elevation</p>
          <p className="text-2xl font-bold text-gray-900">{Math.round(displayTotalElevation).toLocaleString()} m</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Moving time</p>
          <p className="text-2xl font-bold text-gray-900">{formatDuration(displayTotalMoving)}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Elapsed time</p>
          <p className="text-2xl font-bold text-gray-900">{formatDuration(displayTotalElapsed)}</p>
        </div>
        {displayByCountry.size > 0 && (
          <div className="rounded-lg bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Locations</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {[...displayByCountry.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([country, count]) => (
                  <span key={country} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                    {country} × {count}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Events table or empty state */}
      {displayActivities.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          No audax rides recorded for {displayLabel}.
        </p>
      ) : (
        <>
        <ClassificationLegend />
        <div className="mt-2 overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Km
                </th>
                <th className="hidden sm:table-cell px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Elev
                </th>
                <th className="hidden sm:table-cell px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Homologation
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayActivities.map((activity: Activity) => {
                return (
                  <Fragment key={activity.stravaId}>
                    <tr
                      className="hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {formatDate(new Date(activity.date))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div>{activity.name}</div>
                        <a
                          href={activity.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold underline hover:opacity-80"
                          style={{ color: "#FC5200" }}
                        >
                          View on Strava
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                        {Math.round(activity.distance)}
                      </td>
                      <td className="hidden sm:table-cell whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                        {Math.round(activity.elevationGain)}
                      </td>
                      <td className="hidden sm:table-cell whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                        {formatDuration(activity.elapsedTime)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className="inline-flex items-center gap-1">
                          <EventTypeBadge
                            eventType={activity.eventType}
                            source={activity.classificationSource}
                            needsConfirmation={activity.needsConfirmation && !activity.manualOverride}
                            dnf={activity.dnf}
                          />
                        </span>
                      </td>
                      <td className="hidden sm:table-cell whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {activity.homologationNumber ?? "-"}
                      </td>
                    </tr>
                    <tr className="sm:hidden bg-gray-50">
                      <td colSpan={7} className="px-4 py-2">
                        <div className="text-xs text-gray-600">
                          ↗ {Math.round(activity.elevationGain)}m · ⌛ {formatDuration(activity.elapsedTime)} · {activity.homologationNumber ?? "-"}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
