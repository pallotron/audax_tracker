import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Activity } from "../db/database";
import { EventTypeBadge } from "../components/EventTypeBadge";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

export default function YearlySummaryPage() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const activities = useLiveQuery(() => db.activities.toArray());

  if (!activities) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // Get audax activities (eventType !== null)
  const audaxActivities = activities.filter((a) => a.eventType !== null);

  // Collect years that have audax activities, sorted descending
  const years = [
    ...new Set(audaxActivities.map((a) => new Date(a.date).getFullYear())),
  ].sort((a, b) => b - a);

  // Default to most recent year
  const activeYear = selectedYear ?? years[0] ?? new Date().getFullYear();

  // Filter activities for the selected year, sorted by date ascending
  const yearActivities = audaxActivities
    .filter((a) => new Date(a.date).getFullYear() === activeYear)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Stats
  const rideCount = yearActivities.length;
  const totalKm = yearActivities.reduce((sum, a) => sum + a.distance, 0);
  const totalElevation = yearActivities.reduce(
    (sum, a) => sum + a.elevationGain,
    0,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Yearly Summary</h1>

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

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Year</p>
          <p className="text-2xl font-bold text-gray-900">{activeYear}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Audax Rides</p>
          <p className="text-2xl font-bold text-gray-900">{rideCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total Km</p>
          <p className="text-2xl font-bold text-gray-900">
            {Math.round(totalKm).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total Elevation</p>
          <p className="text-2xl font-bold text-gray-900">
            {Math.round(totalElevation).toLocaleString()} m
          </p>
        </div>
      </div>

      {/* Events table or empty state */}
      {yearActivities.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          No audax rides recorded for {activeYear}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
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
                    {new Date(activity.date).toLocaleDateString()}
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
      )}
    </div>
  );
}
