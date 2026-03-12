import { useEffect, useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Activity } from "../db/database";
import { useSyncContext } from "../context/SyncContext";
import {
  checkAcp5000,
  checkAcp10000,
  checkRrty,
  mergeExpiringEvents,
  type QualifyingActivity,
} from "../qualification/tracker";
import { QualificationCard } from "../components/QualificationCard";
import { Link } from "react-router-dom";
import { UnconfirmedRidesNotice } from "../components/UnconfirmedRidesNotice";
import { shouldShowMigrationNotice, dismissMigrationNotice as _dismiss } from "../utils/migrationNotice";
import { BackupTransferButton } from "../components/BackupTransferButton";


function toQualifyingActivity(a: Activity): QualifyingActivity {
  return {
    stravaId: a.stravaId,
    name: a.name,
    date: a.date instanceof Date ? a.date.toISOString() : String(a.date),
    distance: a.distance,
    elevationGain: a.elevationGain,
    eventType: a.eventType,
    dnf: a.dnf,
    sourceUrl: a.sourceUrl,
    classificationSource: a.classificationSource,
    manualOverride: a.manualOverride,
    excludeFromAwards: a.excludeFromAwards,
    needsConfirmation: a.needsConfirmation,
  };
}

export default function DashboardPage() {
  const { sync, syncing, checking, hasPending, checkPending, progress, error, lastSync, cloudSync } = useSyncContext();

  const activities = useLiveQuery(() => db.activities.toArray(), []);

  const unconfirmedCount = (activities ?? []).filter(
    (a) => a.needsConfirmation && !a.manualOverride && !a.excludeFromAwards && a.eventType !== null
  ).length;

  const [showMigrationNotice, setShowMigrationNotice] = useState(shouldShowMigrationNotice);

  const handleDismissMigrationNotice = useCallback(() => {
    _dismiss();
    setShowMigrationNotice(false);
  }, []);

  // Check for new activities on page load
  useEffect(() => {
    checkPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qualifying = (activities ?? [])
    .filter((a) => a.eventType !== null)
    .map(toQualifyingActivity);
  const status5000 = checkAcp5000(qualifying);
  const status10000 = checkAcp10000(qualifying);
  const rrtyStatus = checkRrty(qualifying);

  const currentYear = new Date().getFullYear();
  const thisYearActivities = (activities ?? []).filter(
    (a) => new Date(a.date).getFullYear() === currentYear
  );
  const audaxThisYear = thisYearActivities.filter((a) => a.eventType !== null);
  const totalKmThisYear = thisYearActivities.reduce(
    (sum, a) => sum + a.distance,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <BackupTransferButton />
          <button
            onClick={sync}
            disabled={syncing || checking}
            className="relative inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
          {hasPending && !syncing && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-300 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-400" />
            </span>
          )}
          {syncing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {progress ? `Fetched ${progress.fetched} activities…` : "Connecting..."}
              </>
            ) : checking ? (
              "Checking Strava…"
            ) : hasPending ? (
              "New activities — Sync now"
            ) : (
              "Sync with Strava"
            )}
          </button>
        </div>
      </div>

      <UnconfirmedRidesNotice count={unconfirmedCount} />

      {cloudSync.enabled && !lastSync && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="font-medium">First time on this device?</span>{" "}
          Sync with Strava first — your saved classifications will be restored from the cloud automatically once your activities are loaded.
        </div>
      )}

      {showMigrationNotice && (
        <div className="flex items-start justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>
            Award filtering has been updated. Rides classified by distance now require confirmation to count.{" "}
            <Link to="/activities?needsConfirm=1" className="font-medium underline hover:text-blue-900">
              Review unconfirmed rides →
            </Link>
          </span>
          <button
            onClick={handleDismissMigrationNotice}
            className="ml-4 text-blue-600 hover:text-blue-800 flex-shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Rides this year</p>
          <p className="text-2xl font-bold text-gray-900">
            {thisYearActivities.length}
          </p>
          <p className="text-sm text-orange-600">{audaxThisYear.length} {audaxThisYear.length === 1 ? "audax" : "audaxes"}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Km this year</p>
          <p className="text-2xl font-bold text-gray-900">
            {Math.round(totalKmThisYear).toLocaleString()}
          </p>
          <p className="text-sm text-orange-600">
            {Math.round(audaxThisYear.reduce((s, a) => s + a.distance, 0)).toLocaleString()} km {audaxThisYear.length === 1 ? "audax" : "audaxes"}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Elevation this year</p>
          <p className="text-2xl font-bold text-gray-900">
            {Math.round(thisYearActivities.reduce((s, a) => s + a.elevationGain, 0)).toLocaleString()} m
          </p>
          <p className="text-sm text-orange-600">
            {Math.round(audaxThisYear.reduce((s, a) => s + a.elevationGain, 0)).toLocaleString()} m {audaxThisYear.length === 1 ? "audax" : "audaxes"}
          </p>
        </div>
      </div>

      {/* Expiring events warnings */}
      {(() => {
        const merged = mergeExpiringEvents(status5000.expiringEvents, status10000.expiringEvents);
        return merged.length > 0 ? (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-yellow-800">
              Critical events expiring within 6 months
            </h3>
            <ul className="space-y-1">
              {merged.map((ev) => (
                <li key={ev.stravaId} className="flex items-center gap-2 text-sm text-yellow-700">
                  <span className="font-medium">{ev.eventType}</span>
                  <span className="truncate max-w-xs">{ev.name}</span>
                  <span>({ev.date.toLocaleDateString()})</span>
                  <span className="text-yellow-600">
                    — expires {ev.expiresAt.toLocaleDateString()}
                  </span>
                  <span className="text-xs text-yellow-500 italic">
                    (affects {ev.affects.join(", ")})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null;
      })()}

      {/* RRTY card */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">RRTY — Randonneur Round The Year</h2>
          {rrtyStatus.qualified ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-0.5 text-sm font-medium text-green-800">
              Qualified
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-0.5 text-sm font-medium text-yellow-800">
              In Progress
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          One 200 km+ brevet every month for 12 consecutive months (Audax Ireland award).
        </p>
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-gray-600">
            <span>
              <span className="font-semibold">{rrtyStatus.currentStreakLength}</span> consecutive month{rrtyStatus.currentStreakLength !== 1 ? "s" : ""}
            </span>
            {rrtyStatus.bestStreakMonths.length > 0 && (
              <span className="text-gray-400 text-xs">
                best ever: {rrtyStatus.bestStreakLength}
              </span>
            )}
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-2.5 rounded-full ${rrtyStatus.qualified ? "bg-green-500" : "bg-orange-500"}`}
              style={{ width: `${Math.min((rrtyStatus.currentStreakLength / 12) * 100, 100)}%` }}
            />
          </div>
        </div>
        <Link to="/rrty" className="text-sm text-orange-600 hover:text-orange-700 font-medium mt-auto">
          View details &rarr;
        </Link>
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
        <div className="flex items-center justify-center gap-4">
          <p className="text-xs text-gray-400">
            Last synced: {new Date(lastSync).toLocaleString()}
          </p>
          <button
            onClick={async () => {
              if (window.confirm("Clear all activity data? You'll need to re-sync from Strava.")) {
                await db.activities.clear();
                localStorage.removeItem("audax_last_sync");
                window.location.reload();
              }
            }}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Clear data
          </button>
        </div>
      )}
    </div>
  );
}
