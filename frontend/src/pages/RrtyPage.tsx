import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db, type Activity } from "../db/database";
import { checkRrty, type QualifyingActivity } from "../qualification/tracker";
import { UnconfirmedRidesNotice } from "../components/UnconfirmedRidesNotice";

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

export default function RrtyPage() {
  const activities = useLiveQuery(() => db.activities.toArray(), []);

  const unconfirmedCount = (activities ?? []).filter(
    (a) => a.needsConfirmation && !a.manualOverride && !a.excludeFromAwards && a.eventType !== null
  ).length;

  const qualifying = (activities ?? [])
    .filter((a) => a.eventType !== null)
    .map(toQualifyingActivity);

  const result = checkRrty(qualifying);

  return (
    <div className="space-y-6">
      <UnconfirmedRidesNotice count={unconfirmedCount} />
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">RRTY — Randonneur Round The Year</h1>
        {result.qualified ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-0.5 text-sm font-medium text-green-800">
            Qualified
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-0.5 text-sm font-medium text-yellow-800">
            In Progress
          </span>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow">
        <p className="text-sm text-gray-500">
          Complete at least one approved brevet of 200 km or more every month for any 12 consecutive
          months. Events from any Audax Ireland calendar, approved permanents, or foreign ACP events
          count.
        </p>
      </div>

      {result.currentStreakLength > 0 || result.bestStreakMonths.length > 0 ? (
        <>
          {/* Current streak — primary focus */}
          {result.currentStreakLength > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {result.qualified ? "Qualifying streak" : "Current streak"}
                  </h2>
                  {result.currentStreakStart && (
                    <p className="text-sm text-gray-500">
                      Started {formatMonth(result.currentStreakStart)}
                      {!result.qualified && ` — ${12 - result.currentStreakLength} more month${12 - result.currentStreakLength !== 1 ? "s" : ""} needed`}
                    </p>
                  )}
                </div>
                <span className="text-2xl font-bold text-gray-900">
                  {result.currentStreakLength}
                  <span className="text-base font-normal text-gray-400"> / 12</span>
                </span>
              </div>
              <div className="mb-6 h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-2.5 rounded-full transition-all ${result.qualified ? "bg-green-500" : "bg-orange-500"}`}
                  style={{ width: `${Math.min((result.currentStreakLength / 12) * 100, 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {result.currentStreakMonths.map((m) => (
                  <div key={m.month} className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-green-800">{m.label}</span>
                      <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {m.activities.map((a) => (
                        <li key={a.stravaId} className="truncate text-xs text-green-700">
                          <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" title={`${a.name} (${Math.round(a.distance)} km)`}>
                            {a.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow text-center">
              <p className="text-lg font-semibold text-gray-700">Starting from 0</p>
              <p className="mt-1 text-sm text-gray-400">
                No active streak — ride a qualifying 200 km+ brevet this month to begin.
              </p>
            </div>
          )}

          {/* Historical best — only shown when different from current streak */}
          {result.bestStreakMonths.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
              <h3 className="mb-1 text-sm font-semibold text-gray-600">
                Previous best streak — {result.bestStreakLength} months
              </h3>
              <p className="mb-3 text-xs text-gray-400">
                {result.bestStreakStart && result.bestStreakEnd &&
                  `${formatMonth(result.bestStreakStart)} – ${formatMonth(result.bestStreakEnd)}`}
                {" "}— streak ended, clock has reset
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {result.bestStreakMonths.map((m) => (
                  <div key={m.month} className="rounded-lg border border-gray-200 bg-white p-2 opacity-60">
                    <span className="text-xs font-medium text-gray-500">{m.label}</span>
                    {m.activities[0] && (
                      <p className="mt-0.5 truncate text-xs text-gray-400" title={m.activities[0].name}>
                        {m.activities[0].name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow">
          <p className="text-gray-500">No qualifying activities yet.</p>
          <p className="mt-1 text-sm text-gray-400">
            Sync your Strava activities and classify events to get started.
          </p>
        </div>
      )}
    </div>
  );
}

function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IE", {
    month: "long",
    year: "numeric",
  });
}
