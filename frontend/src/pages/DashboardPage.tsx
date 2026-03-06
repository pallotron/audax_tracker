import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Activity } from "../db/database";
import { useSync } from "../hooks/useSync";
import {
  checkAcp5000,
  checkAcp10000,
  type QualifyingActivity,
} from "../qualification/tracker";
import { QualificationCard } from "../components/QualificationCard";

function toQualifyingActivity(a: Activity): QualifyingActivity {
  return {
    stravaId: a.stravaId,
    date: a.date instanceof Date ? a.date.toISOString() : String(a.date),
    distance: a.distance,
    elevationGain: a.elevationGain,
    eventType: a.eventType,
  };
}

export default function DashboardPage() {
  const { sync, syncing, error, lastSync } = useSync();
  const hasSynced = useRef(false);

  const activities = useLiveQuery(() => db.activities.toArray(), []);

  // Auto-sync on first visit if no data
  useEffect(() => {
    if (!hasSynced.current && activities !== undefined && activities.length === 0 && !lastSync) {
      hasSynced.current = true;
      sync();
    }
  }, [activities, lastSync, sync]);

  const qualifying = (activities ?? []).map(toQualifyingActivity);
  const status5000 = checkAcp5000(qualifying);
  const status10000 = checkAcp10000(qualifying);

  const currentYear = new Date().getFullYear();
  const thisYearActivities = (activities ?? []).filter(
    (a) => new Date(a.date).getFullYear() === currentYear
  );
  const totalKmThisYear = thisYearActivities.reduce(
    (sum, a) => sum + a.distance,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
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
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Year summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Rides this year</p>
          <p className="text-2xl font-bold text-gray-900">
            {thisYearActivities.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Km this year</p>
          <p className="text-2xl font-bold text-gray-900">
            {Math.round(totalKmThisYear).toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total synced</p>
          <p className="text-2xl font-bold text-gray-900">
            {(activities ?? []).length}
          </p>
        </div>
      </div>

      {/* Qualification cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <QualificationCard
          title="Randonneur 5000"
          type="5000"
          qualified={status5000.qualified}
          totalKm={status5000.totalKm}
          targetKm={5000}
          requirements={[
            {
              label: "BRM Series",
              met: status5000.brmSeries.met,
              details: status5000.brmSeries.details,
            },
            {
              label: "Paris-Brest-Paris",
              met: status5000.pbp.met,
              details: status5000.pbp.details,
            },
            {
              label: "Fleche",
              met: status5000.fleche.met,
              details: status5000.fleche.details,
            },
            {
              label: "Distance (5000 km)",
              met: status5000.distance.met,
              details: status5000.distance.details,
            },
          ]}
        />
        <QualificationCard
          title="Randonneur 10000"
          type="10000"
          qualified={status10000.qualified}
          totalKm={status10000.totalKm}
          targetKm={10000}
          requirements={[
            {
              label: "2x BRM Series",
              met: status10000.twoBrmSeries.met,
              details: status10000.twoBrmSeries.details,
            },
            {
              label: "Paris-Brest-Paris",
              met: status10000.pbp.met,
              details: status10000.pbp.details,
            },
            {
              label: "Separate RM 1200+",
              met: status10000.separateRm1200.met,
              details: status10000.separateRm1200.details,
            },
            {
              label: "Mountain 600",
              met: status10000.mountain600.met,
              details: status10000.mountain600.details,
            },
            {
              label: "Fleche",
              met: status10000.fleche.met,
              details: status10000.fleche.details,
            },
            {
              label: "Distance (10000 km)",
              met: status10000.distance.met,
              details: status10000.distance.details,
            },
          ]}
        />
      </div>

      {lastSync && (
        <p className="text-xs text-gray-400 text-center">
          Last synced: {new Date(lastSync).toLocaleString()}
        </p>
      )}
    </div>
  );
}
