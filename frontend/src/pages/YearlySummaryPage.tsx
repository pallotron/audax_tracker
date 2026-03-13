import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Activity } from "../db/database";
import { EventTypeBadge, ClassificationLegend } from "../components/EventTypeBadge";
import { formatDate } from "../utils/date";
import { formatDuration } from "../utils/formatDuration";

export default function YearlySummaryPage() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  const activities = useLiveQuery(() => db.activities.toArray());

  const audaxActivities = useMemo(
    () => (activities ?? []).filter((a) => a.eventType !== null),
    [activities],
  );

  const years = useMemo(
    () =>
      [
        ...new Set(audaxActivities.map((a) => new Date(a.date).getFullYear())),
      ].sort((a, b) => b - a),
    [audaxActivities],
  );

  const activeYear = selectedYear ?? years[0] ?? new Date().getFullYear();

  const yearActivities = useMemo(
    () =>
      audaxActivities
        .filter((a) => new Date(a.date).getFullYear() === activeYear)
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
    [audaxActivities, activeYear],
  );

  const rideCount = yearActivities.length;
  const totalKm = yearActivities.reduce((sum, a) => sum + a.distance, 0);
  const totalElevation = yearActivities.reduce((sum, a) => sum + a.elevationGain, 0);
  const totalMoving = yearActivities.reduce((sum, a) => sum + a.movingTime, 0);
  const totalElapsed = yearActivities.reduce((sum, a) => sum + a.elapsedTime, 0);
  const byCountry = new Map<string, number>();
  for (const a of yearActivities) {
    const key = a.startCountry ?? "Unknown";
    byCountry.set(key, (byCountry.get(key) ?? 0) + 1);
  }

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

  if (!activities) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Audax Yearly Summary</h1>
        {years.length > 1 && (
          <button
            onClick={() => setShowComparison((v) => !v)}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            {showComparison ? "Hide comparison" : "Compare years"}
          </button>
        )}
      </div>

      {/* Year selector */}
      {years.length > 0 && (
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

      {/* Multi-year comparison */}
      {showComparison && yearlyStats.length > 0 && (
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

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Audax Rides</p>
          <p className="text-2xl font-bold text-gray-900">{rideCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total Km</p>
          <p className="text-2xl font-bold text-gray-900">{Math.round(totalKm).toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total Elevation</p>
          <p className="text-2xl font-bold text-gray-900">{Math.round(totalElevation).toLocaleString()} m</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Moving time</p>
          <p className="text-2xl font-bold text-gray-900">{formatDuration(totalMoving)}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Elapsed time</p>
          <p className="text-2xl font-bold text-gray-900">{formatDuration(totalElapsed)}</p>
        </div>
        {byCountry.size > 0 && (
          <div className="rounded-lg bg-white p-4 shadow">
            <p className="text-sm text-gray-500">Locations</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {[...byCountry.entries()]
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
      {yearActivities.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          No audax rides recorded for {activeYear}.
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
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Elev
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Homologation
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {yearActivities.map((activity: Activity) => (
                <tr key={activity.stravaId} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {formatDate(new Date(activity.date))}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {activity.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                    {Math.round(activity.distance)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                    {Math.round(activity.elevationGain)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                    {formatDuration(activity.elapsedTime)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <EventTypeBadge
                      eventType={activity.eventType}
                      source={activity.classificationSource}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {activity.homologationNumber ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
