import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Activity } from "../db/database";
import {
  checkAcp5000,
  checkAcp10000,
  findBestWindow,
  type QualifyingActivity,
  type Requirement,
  type ExpiringEvent,
} from "../qualification/tracker";
import { ProgressBar } from "../components/ProgressBar";
import { EventTypeBadge, ClassificationLegend } from "../components/EventTypeBadge";

function toQualifyingActivities(activities: Activity[]): QualifyingActivity[] {
  return activities
    .filter((a) => a.eventType !== null)
    .map((a) => ({
      stravaId: a.stravaId,
      name: a.name,
      date: new Date(a.date).toISOString(),
      distance: a.distance,
      elevationGain: a.elevationGain,
      eventType: a.eventType!,
      dnf: a.dnf,
      sourceUrl: a.sourceUrl,
    }));
}

interface RequirementCardProps {
  label: string;
  requirement: Requirement;
}

function RequirementCard({ label, requirement }: RequirementCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
      {requirement.met ? (
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ) : (
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <circle cx="12" cy="12" r="9" />
        </svg>
      )}
      <div className="min-w-0">
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">{requirement.details}</p>
        {requirement.completedDate && (
          <p className="text-xs text-gray-400">
            Completed: {requirement.completedDate.toLocaleDateString()}
          </p>
        )}
        {requirement.matchingActivities.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {requirement.matchingActivities.map((a) => (
              <p key={a.stravaId} className="text-xs text-gray-400">
                <span className="font-medium text-gray-500">{a.eventType}</span>
                {" — "}
                <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 hover:underline">
                  {a.name}
                </a>
                {" "}
                <span>({new Date(a.date).toLocaleDateString()})</span>
                {" · "}
                <span>{Math.round(a.distance)} km</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function QualificationDetailPage() {
  const { type } = useParams<{ type: string }>();
  const activities = useLiveQuery(() => db.activities.toArray());

  if (!activities) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const qualActivities = toQualifyingActivities(activities);

  const is5000 = type === "5000";
  const targetKm = is5000 ? 5000 : 10000;
  const windowYears = is5000 ? 4 : 6;
  const title = is5000 ? "ACP Randonneur 5000" : "ACP Randonneur 10,000";

  const status = is5000
    ? checkAcp5000(qualActivities)
    : checkAcp10000(qualActivities);

  const windowActivities = findBestWindow(qualActivities, windowYears);

  // Derive window dates from the activities in the best window
  const windowDates =
    windowActivities.length > 0
      ? (() => {
          const sorted = [...windowActivities].sort(
            (a, b) =>
              new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          const windowStart = new Date(sorted[0].date);
          const windowEnd = new Date(windowStart);
          windowEnd.setFullYear(windowEnd.getFullYear() + windowYears);
          return { start: windowStart, end: windowEnd };
        })()
      : null;

  // Activities in the best window, sorted by date descending (most recent first)
  const windowActivityIds = new Set(windowActivities.map((a) => a.stravaId));
  const tableActivities = activities
    .filter((a) => windowActivityIds.has(a.stravaId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // For timeline: find the most recent ride per BRM distance in the window
  const BRM_DISTANCES = ["BRM200", "BRM300", "BRM400", "BRM600", "BRM1000"] as const;
  const latestPerBrmDistance = BRM_DISTANCES.map((dist) => {
    const match = tableActivities.find((a) => a.eventType === dist);
    return match ? { distance: dist, name: match.name, date: new Date(match.date), sourceUrl: match.sourceUrl } : null;
  }).filter(Boolean) as { distance: string; name: string; date: Date; sourceUrl: string }[];

  // For timeline: find the most recent ride for single-event requirements
  const findLatestForType = (eventType: string) => {
    const match = tableActivities.find((a) => a.eventType === eventType);
    return match ? { name: match.name, date: new Date(match.date), sourceUrl: match.sourceUrl } : null;
  };

  // Build requirements list
  const requirements: { label: string; requirement: Requirement }[] = [];

  if (is5000) {
    const s = status as ReturnType<typeof checkAcp5000>;
    requirements.push(
      { label: "Full BRM Series", requirement: s.brmSeries },
      { label: "Paris-Brest-Paris", requirement: s.pbp },
      { label: "Fleche", requirement: s.fleche },
    );
  } else {
    const s = status as ReturnType<typeof checkAcp10000>;
    requirements.push(
      { label: "2x BRM Series", requirement: s.twoBrmSeries },
      { label: "Paris-Brest-Paris", requirement: s.pbp },
      {
        label: "RM 1200+ (separate from PBP)",
        requirement: s.separateRm1200,
      },
      {
        label: "Mountain BRM 600 (8000m+)",
        requirement: s.mountain600,
      },
      { label: "Fleche", requirement: s.fleche },
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {windowYears}-year qualifying window
          {windowDates && (
            <>
              {" "}
              &mdash; best window:{" "}
              {windowDates.start.toLocaleDateString()} to{" "}
              {windowDates.end.toLocaleDateString()}
            </>
          )}
        </p>
      </div>

      {/* Status banner */}
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="flex items-center gap-3 mb-3">
          {status.qualified ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
              QUALIFIED
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-800">
              IN PROGRESS
            </span>
          )}
          <span className="text-sm text-gray-600">
            {Math.round(status.totalKm).toLocaleString()} km total
          </span>
        </div>
        <ProgressBar
          current={Math.round(status.totalKm)}
          target={targetKm}
          label="Distance progress"
        />
      </div>

      {/* Requirements checklist */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Requirements
        </h2>
        <div className="space-y-2">
          {requirements.map((r) => (
            <RequirementCard
              key={r.label}
              label={r.label}
              requirement={r.requirement}
            />
          ))}
        </div>
      </div>

      {/* Expiring events warning */}
      {status.expiringEvents.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-yellow-800">
            Events expiring within 6 months
          </h3>
          <ul className="space-y-1">
            {status.expiringEvents.map((ev: ExpiringEvent) => (
              <li key={ev.stravaId} className="flex items-center gap-2 text-sm text-yellow-700">
                <span className="font-medium">{ev.eventType}</span>
                <a
                  href={ev.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate max-w-xs hover:text-yellow-900 hover:underline"
                >
                  {ev.name}
                </a>
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
      )}

      {/* Completion timeline */}
      {requirements.some((r) => r.requirement.completedDate) && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Completion Timeline
          </h2>
          <div className="rounded-lg bg-white p-4 shadow">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />
              <div className="space-y-4">
                {[...requirements, { label: `Distance (${targetKm} km)`, requirement: status.distance }]
                  .filter((r) => r.requirement.completedDate)
                  .sort(
                    (a, b) =>
                      a.requirement.completedDate!.getTime() -
                      b.requirement.completedDate!.getTime(),
                  )
                  .map((r) => {
                    // Determine qualifying rides for this requirement
                    const isBrmSeries = r.label === "Full BRM Series" || r.label === "2x BRM Series";
                    const pbpRide = r.label === "Paris-Brest-Paris" ? findLatestForType("PBP") : null;
                    const flecheRide = r.label === "Fleche" ? findLatestForType("Fleche") : null;
                    const rm1200Ride = r.label === "RM 1200+ (separate from PBP)" ? findLatestForType("RM1200+") : null;
                    const mountain600Ride = r.label === "Mountain BRM 600 (8000m+)"
                      ? (() => {
                          const m = tableActivities.find(
                            (a) => a.eventType === "BRM600" && a.elevationGain >= 8000,
                          );
                          return m ? { name: m.name, date: new Date(m.date), sourceUrl: m.sourceUrl } : null;
                        })()
                      : null;
                    const singleRide = pbpRide ?? flecheRide ?? rm1200Ride ?? mountain600Ride;

                    return (
                      <div key={r.label} className="relative pl-7">
                        <div className="absolute left-1.5 top-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" />
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-24 flex-shrink-0">
                            {r.requirement.completedDate!.toLocaleDateString()}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {r.label}
                          </span>
                        </div>
                        {/* Show qualifying rides */}
                        {isBrmSeries && latestPerBrmDistance.length > 0 && (
                          <div className="ml-28 mt-1 space-y-0.5">
                            {latestPerBrmDistance.map((d) => (
                              <p key={d.distance} className="text-xs text-gray-400">
                                {d.distance}:{" "}
                                <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 hover:underline">
                                  {d.name}
                                </a>
                                {" "}({d.date.toLocaleDateString()})
                              </p>
                            ))}
                          </div>
                        )}
                        {singleRide && (
                          <p className="ml-28 mt-1 text-xs text-gray-400">
                            <a href={singleRide.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 hover:underline">
                              {singleRide.name}
                            </a>
                            {" "}({singleRide.date.toLocaleDateString()})
                          </p>
                        )}
                      </div>
                    );
                  })}
                {/* Pending items */}
                {[...requirements, { label: `Distance (${targetKm} km)`, requirement: status.distance }]
                  .filter((r) => !r.requirement.met)
                  .map((r) => (
                    <div key={r.label} className="relative flex items-center gap-3 pl-7">
                      <div className="absolute left-1.5 h-3 w-3 rounded-full border-2 border-gray-300 bg-white" />
                      <span className="text-xs text-gray-300 w-24 flex-shrink-0">pending</span>
                      <span className="text-sm text-gray-400">{r.label}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Qualifying events table */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Qualifying Events
        </h2>
        {tableActivities.length === 0 ? (
          <p className="py-8 text-center text-gray-500">
            No qualifying events found.
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
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Homologation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tableActivities.map((activity) => (
                  <tr key={activity.stravaId} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {new Date(activity.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <a
                        href={activity.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-orange-600 hover:underline"
                      >
                        {activity.name}
                      </a>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                      {Math.round(activity.distance)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                      {Math.round(activity.elevationGain)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <EventTypeBadge
                        eventType={activity.eventType}
                        source={activity.classificationSource}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {activity.homologationNumber ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
