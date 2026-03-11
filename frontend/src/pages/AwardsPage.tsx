import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db, type Activity } from "../db/database";
import { UnconfirmedRidesNotice } from "../components/UnconfirmedRidesNotice";
import {
  checkRrtyYears,
  checkBrevetKm,
  checkSuperRandonneur,
  checkFourProvinces,
  checkEasterFleche,
  checkFourNations,
  checkIsr,
  getInternationalRides,
  type AwardsActivity,
} from "../awards/awards";
import { checkAcp5000, checkAcp10000 } from "../qualification/tracker";
import type { QualifyingActivity } from "../qualification/tracker";

function toQualifying(a: Activity): QualifyingActivity {
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

function toAwards(a: Activity): AwardsActivity {
  return {
    stravaId: a.stravaId,
    name: a.name,
    date: a.date instanceof Date ? a.date.toISOString() : String(a.date),
    distance: a.distance,
    elevationGain: a.elevationGain,
    eventType: a.eventType,
    dnf: a.dnf,
    sourceUrl: a.sourceUrl,
    startCountry: a.startCountry ?? null,
    startRegion: a.startRegion ?? null,
    endCountry: a.endCountry ?? null,
    endRegion: a.endRegion ?? null,
    isNotableInternational: a.isNotableInternational ?? false,
    classificationSource: a.classificationSource,
    manualOverride: a.manualOverride,
    excludeFromAwards: a.excludeFromAwards,
    needsConfirmation: a.needsConfirmation,
  };
}

function TrophyBadge({ label, activities }: { label: string | number; activities?: AwardsActivity[] }) {
  const badge = (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
      🏆 {label}
    </span>
  );

  if (!activities || activities.length === 0) return badge;

  return (
    <details className="group relative inline-block">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:opacity-80">
        {badge}
      </summary>
      <div className="absolute left-0 z-10 mt-1 w-64 rounded-md border border-gray-200 bg-white p-2 shadow-xl">
        <ul className="flex flex-col gap-1">
          {activities.map((a) => (
            <li key={a.stravaId} className="truncate text-xs">
              <span className="text-gray-400 mr-1.5 tabular-nums">
                {new Date(a.date).toLocaleDateString("en-IE", { month: "short", year: "2-digit" })}
              </span>
              <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline" title={a.name}>
                {a.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function AwardRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{label}</h3>
      </div>
      {description && (
        <p className="mb-2 text-xs text-gray-500">{description}</p>
      )}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-gray-900">{children}</h2>;
}

export default function AwardsPage() {
  const activities = useLiveQuery(() => db.activities.toArray(), []);

  if (!activities) {
    return <div className="text-gray-500">Loading…</div>;
  }

  const unconfirmedCount = activities.filter(
    (a) => a.needsConfirmation && !a.manualOverride && !a.excludeFromAwards && a.eventType !== null
  ).length;

  const qualifying = activities.map(toQualifying);
  const awards = activities.map(toAwards);

  const status5000 = checkAcp5000(qualifying.filter((a) => a.eventType !== null));
  const status10000 = checkAcp10000(qualifying.filter((a) => a.eventType !== null));

  const rrtyYears = checkRrtyYears(awards);
  const brevetKm = checkBrevetKm(awards);
  const superRandonneur = checkSuperRandonneur(awards);
  const fourProvinces = checkFourProvinces(awards);
  const easterFleches = checkEasterFleche(awards);
  const fourNations = checkFourNations(awards);
  const isr = checkIsr(awards);
  const internationalRides = getInternationalRides(awards);

  const allSeasons = Array.from(brevetKm.keys()).sort();

  return (
    <div className="space-y-8">
      <UnconfirmedRidesNotice count={unconfirmedCount} />
      <h1 className="text-2xl font-bold text-gray-900">Awards</h1>

      {/* ── ACP Awards ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>ACP Awards</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            to="/qualification/5000"
            className="rounded-lg border border-gray-200 bg-white p-4 hover:border-orange-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Randonneur 5000
              </h3>
              {status5000.qualified ? (
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Qualified ✓
                </span>
              ) : (
                <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                  {Math.round(status5000.totalKm).toLocaleString()} / 5000 km
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-orange-600">View details →</p>
          </Link>

          <Link
            to="/qualification/10000"
            className="rounded-lg border border-gray-200 bg-white p-4 hover:border-orange-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Randonneur 10000
              </h3>
              {status10000.qualified ? (
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Qualified ✓
                </span>
              ) : (
                <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                  {Math.round(status10000.totalKm).toLocaleString()} / 10000 km
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-orange-600">View details →</p>
          </Link>
        </div>
      </section>

      {/* ── Annual Awards ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Annual Awards</SectionHeading>

        <AwardRow
          label="Super Randonneur"
          description={`Complete a BRM 200, 300, 400, and 600 in the same audax season (Nov–Oct). Total completed: ${[...superRandonneur.values()].filter(s => s.met).length}`}
        >
          {allSeasons.filter((s) => superRandonneur.get(s)?.met).length === 0 ? (
            <span className="text-xs text-gray-400 italic">No completed seasons yet</span>
          ) : (
            allSeasons
              .filter((s) => superRandonneur.get(s)?.met)
              .map((season) => (
                <TrophyBadge key={season} label={season} activities={superRandonneur.get(season)?.activities} />
              ))
          )}
        </AwardRow>

        <AwardRow
          label="RRTY — Randonneur Round The Year"
          description="One 200 km+ brevet every month for 12 consecutive months."
        >
          {rrtyYears.size === 0 ? (
            <span className="text-xs text-gray-400 italic">No completed years yet</span>
          ) : (
            [...rrtyYears.entries()].sort(([a], [b]) => a - b).map(([year, activities]) => (
              <TrophyBadge key={year} label={year} activities={activities} />
            ))
          )}
        </AwardRow>

        <AwardRow
          label="Brevet 2000"
          description="Ride 2000 km of BRM/Permanent events in an audax season (Nov–Oct)."
        >
          {allSeasons.filter((s) => (brevetKm.get(s)?.total ?? 0) >= 2000).length === 0 ? (
            <span className="text-xs text-gray-400 italic">No completed seasons yet</span>
          ) : (
            allSeasons
              .filter((s) => (brevetKm.get(s)?.total ?? 0) >= 2000)
              .map((season) => (
                <TrophyBadge key={season} label={`${season} (${Math.round(brevetKm.get(season)!.total)} km)`} activities={brevetKm.get(season)?.activities} />
              ))
          )}
        </AwardRow>

        <AwardRow
          label="Brevet 5000"
          description="Ride 5000 km of BRM/Permanent events in an audax season (Nov–Oct)."
        >
          {allSeasons.filter((s) => (brevetKm.get(s)?.total ?? 0) >= 5000).length === 0 ? (
            <span className="text-xs text-gray-400 italic">No completed seasons yet</span>
          ) : (
            allSeasons
              .filter((s) => (brevetKm.get(s)?.total ?? 0) >= 5000)
              .map((season) => (
                <TrophyBadge key={season} label={`${season} (${Math.round(brevetKm.get(season)!.total)} km)`} activities={brevetKm.get(season)?.activities} />
              ))
          )}
        </AwardRow>

        <AwardRow
          label="4 Provinces of Ireland"
          description="Start a 200 km+ brevet in each of Ulster, Leinster, Munster, and Connacht in an audax season (Nov–Oct)."
        >
          {[...fourProvinces.entries()].filter(([, d]) => d.met).length === 0 ? (
            <span className="text-xs text-gray-400 italic">No completed seasons yet</span>
          ) : (
            [...fourProvinces.entries()]
              .filter(([, d]) => d.met)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([season, data]) => {
                const activities = Object.values(data.provinces)
                  .filter((v): v is AwardsActivity[] => !!v)
                  .flat();
                return <TrophyBadge key={season} label={season} activities={activities} />;
              })
          )}
        </AwardRow>

        <AwardRow
          label="Easter Flèche Finisher"
          description="Complete a Flèche event during Easter weekend (Good Friday–Easter Monday)."
        >
          {easterFleches.length === 0 ? (
            <span className="text-xs text-gray-400 italic">
              No Easter Flèche completions yet
            </span>
          ) : (
            easterFleches.map(({ year, activity }) => (
              <a
                key={activity.stravaId}
                href={activity.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 hover:bg-green-200"
              >
                {year} ✓
              </a>
            ))
          )}
        </AwardRow>
      </section>

      {/* ── Lifetime Awards ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Lifetime Awards</SectionHeading>

        {/* 4 Nations SR */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">
              4 Nations Super Randonneur
            </h3>
            {fourNations.met ? (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Completed ✓
              </span>
            ) : (
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                In progress
              </span>
            )}
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Complete BRM 200+300+400+600 with each distance starting and finishing in a
            different nation (England, Ireland, Scotland, Wales). Counts from 2024–25 season onward.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["BRM200", "BRM300", "BRM400", "BRM600"] as const).map((dist) => {
              const assignment = fourNations.assignments.find((a) => a.distance === dist);
              return (
                <div
                  key={dist}
                  className={`rounded border p-2 text-center text-xs ${
                    assignment
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="font-medium text-gray-700">{dist}</div>
                  {assignment ? (
                    <a
                      href={assignment.activity.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-700 hover:underline"
                    >
                      {assignment.nation}
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              );
            })}
          </div>
          {fourNations.hasConflict && (
            <p className="mt-2 text-xs text-amber-600">
              You have activities for all distances but cannot cover 4 distinct nations — check for duplicate nations.
            </p>
          )}
        </div>

        {/* ISR */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">
              International Super Randonneur (ISR)
            </h3>
            {isr.met ? (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Completed ✓
              </span>
            ) : (
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                In progress
              </span>
            )}
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Complete BRM 200+300+400+600 with each distance in a different country. No time restriction.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["BRM200", "BRM300", "BRM400", "BRM600"] as const).map((dist) => {
              const assignment = isr.assignments.find((a) => a.distance === dist);
              return (
                <div
                  key={dist}
                  className={`rounded border p-2 text-center text-xs ${
                    assignment
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="font-medium text-gray-700">{dist}</div>
                  {assignment ? (
                    <a
                      href={assignment.activity.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-700 hover:underline"
                    >
                      {assignment.activity.startCountry}
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              );
            })}
          </div>
          {isr.hasConflict && (
            <p className="mt-2 text-xs text-amber-600">
              You have activities for all distances but cannot cover 4 distinct countries — check for duplicate countries.
            </p>
          )}
        </div>

        {/* International Rides */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-800">
            International Rides
          </h3>
          <p className="mb-3 text-xs text-gray-500">
            Brevets started outside Ireland, or manually flagged notable international events.
          </p>
          {internationalRides.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              No international rides yet. Sync activities to detect rides abroad.
            </p>
          ) : (
            <ul className="space-y-1">
              {internationalRides.map((a) => (
                <li key={a.stravaId} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 tabular-nums">
                    {new Date(a.date).toLocaleDateString("en-IE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <a
                    href={a.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-orange-600 hover:underline"
                  >
                    {a.name}
                  </a>
                  {a.startCountry && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      {a.startCountry}
                    </span>
                  )}
                  {a.isNotableInternational && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                      notable
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
