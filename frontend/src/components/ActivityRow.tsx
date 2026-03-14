import { useState } from "react";
import { db, type Activity, setExcludeFromAwards, confirmActivity } from "../db/database";
import type { EventType } from "../db/types";
import { EventTypeBadge } from "./EventTypeBadge";
import { formatDate } from "../utils/date";

interface ActivityRowProps {
  activity: Activity;
  selected: boolean;
  onToggle: (stravaId: string) => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  refreshError: string | null;
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
}

const EVENT_TYPE_OPTIONS: EventType[] = [
  null,
  "BRM200",
  "BRM300",
  "BRM400",
  "BRM600",
  "BRM1000",
  "PBP",
  "RM1200+",
  "Fleche",
  "SR600",
  "TraceVelocio",
  "FlecheDeFrance",
  "Permanent",
  "Other",
];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

interface AwardsStatusIconProps {
  activity: Activity;
  onExclude: () => void;
  onInclude: () => void;
  onConfirm: () => void;
}

function AwardsStatusIcon({ activity, onExclude, onInclude, onConfirm }: AwardsStatusIconProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const isUnconfirmed = activity.needsConfirmation && !activity.manualOverride && !activity.excludeFromAwards;
  const isExcluded = activity.excludeFromAwards;

  if (isUnconfirmed) {
    return (
      <div className="relative">
        <button
          onClick={() => setPopoverOpen((v) => !v)}
          title="Not counting — needs confirmation"
          className="text-amber-500 hover:text-amber-600 text-sm font-bold w-5 text-center"
        >
          ?
        </button>
        {popoverOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setPopoverOpen(false)}
            />
            <div className="absolute right-0 top-6 z-20 w-52 rounded-lg border border-gray-200 bg-white shadow-lg p-2">
              <p className="text-xs text-gray-500 px-2 py-1 border-b border-gray-100 mb-1 truncate">
                {activity.name}
              </p>
              <button
                onClick={() => { onConfirm(); setPopoverOpen(false); }}
                className="w-full text-left text-xs text-green-700 hover:bg-green-50 rounded px-2 py-1.5 flex items-center gap-2"
              >
                <span>✓</span> Confirm as {activity.eventType}
              </button>
              <button
                onClick={() => { onExclude(); setPopoverOpen(false); }}
                className="w-full text-left text-xs text-red-700 hover:bg-red-50 rounded px-2 py-1.5 flex items-center gap-2"
              >
                <span>✕</span> Exclude from awards
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (isExcluded) {
    return (
      <button
        onClick={onInclude}
        title="Manually excluded from awards — click to include"
        className="text-red-500 hover:text-red-600 text-sm font-bold w-5 text-center"
      >
        ✕
      </button>
    );
  }

  return (
    <button
      onClick={onExclude}
      title="Counting towards awards — click to exclude"
      className="text-green-500 hover:text-green-600 text-sm font-bold w-5 text-center"
    >
      ✓
    </button>
  );
}

export function ActivityRow({
  activity,
  selected,
  onToggle,
  onRefresh,
  refreshing,
  refreshError,
  isEditing,
  onEditingChange,
}: ActivityRowProps) {
  const [eventType, setEventType] = useState<EventType>(activity.eventType);
  const [homologation, setHomologation] = useState(
    activity.homologationNumber ?? ""
  );
  const [dnf, setDnf] = useState(activity.dnf);

  const handleExclude = async () => {
    await setExcludeFromAwards(activity.stravaId, true);
  };
  const handleInclude = async () => {
    await setExcludeFromAwards(activity.stravaId, false);
  };
  const handleConfirm = async () => {
    await confirmActivity(activity.stravaId);
  };

  const handleSave = async () => {
    await db.activities.update(activity.stravaId, {
      eventType,
      homologationNumber: homologation || null,
      manualOverride: true,
      classificationSource: "manual",
      dnf,
    });
    onEditingChange(false);
  };

  const handleCancel = () => {
    setEventType(activity.eventType);
    setHomologation(activity.homologationNumber ?? "");
    setDnf(activity.dnf);
    onEditingChange(false);
  };

  const date =
    activity.date instanceof Date
      ? activity.date
      : new Date(activity.date);

  const isUnconfirmed = activity.needsConfirmation && !activity.manualOverride && !activity.excludeFromAwards;
  const isExcluded = activity.excludeFromAwards;
  const awardStatusText = isUnconfirmed
    ? "? needs confirmation"
    : isExcluded
    ? "✕ excluded"
    : "✓ counting";

  return (
    <>
      <tr className="hover:bg-gray-50">
        {/* col 1: checkbox — hidden on mobile */}
        <td className="hidden sm:table-cell whitespace-nowrap px-3 py-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => { e.stopPropagation(); onToggle(activity.stravaId); }}
            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
        </td>
        {/* col 2: date — always visible */}
        <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-900">
          {formatDate(date)}
        </td>
        {/* col 3: name — always visible */}
        <td className="max-w-xs truncate px-3 py-2 text-sm text-gray-900">
          <a
            href={activity.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-orange-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {activity.name}
          </a>
        </td>
        {/* col 4: distance — always visible */}
        <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-600 text-right">
          {Math.round(activity.distance)}
        </td>
        {/* col 5: elevation — hidden on mobile */}
        <td className="hidden sm:table-cell whitespace-nowrap px-3 py-2 text-sm text-gray-600 text-right">
          {Math.round(activity.elevationGain)}
        </td>
        {/* col 6: moving time — hidden on mobile */}
        <td className="hidden sm:table-cell whitespace-nowrap px-3 py-2 text-sm text-gray-600">
          {formatDuration(activity.movingTime)}
        </td>
        {/* col 7: elapsed time — hidden on mobile */}
        <td className="hidden sm:table-cell whitespace-nowrap px-3 py-2 text-sm text-gray-600">
          {formatDuration(activity.elapsedTime)}
        </td>
        {/* col 8: event type — always visible */}
        <td className="whitespace-nowrap px-3 py-2 text-sm">
          {isEditing ? (
            <select
              value={eventType ?? ""}
              onChange={(e) =>
                setEventType(e.target.value === "" ? null : (e.target.value as EventType))
              }
              onClick={(e) => e.stopPropagation()}
              className="rounded border border-gray-300 px-1 py-0.5 text-xs"
            >
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt ?? "__null__"} value={opt ?? ""}>{opt ?? "(none)"}</option>
              ))}
            </select>
          ) : (
            <EventTypeBadge
              eventType={activity.eventType}
              source={activity.classificationSource}
              needsConfirmation={activity.needsConfirmation && !activity.manualOverride}
              dnf={activity.dnf}
            />
          )}
        </td>
        {/* col 9: homologation — hidden on mobile */}
        <td className="hidden sm:table-cell whitespace-nowrap px-3 py-2 text-sm text-gray-600">
          {isEditing ? (
            <input
              type="text"
              value={homologation}
              onChange={(e) => setHomologation(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Homologation #"
              title="Retrieve homologation # from https://myaccount.audax-club-parisien.com/"
              className="w-28 rounded border border-gray-300 px-1 py-0.5 text-xs"
            />
          ) : (
            activity.homologationNumber ?? "-"
          )}
        </td>
        {/* col 10: awards — hidden on mobile */}
        <td className="hidden sm:table-cell whitespace-nowrap px-3 py-2 text-sm text-center">
          <AwardsStatusIcon
            activity={activity}
            onExclude={handleExclude}
            onInclude={handleInclude}
            onConfirm={handleConfirm}
          />
        </td>
        {/* col 11: start region — hidden on mobile */}
        <td className="hidden sm:table-cell whitespace-nowrap px-3 py-2 text-sm text-gray-500">
          {activity.startRegion && activity.startCountry
            ? `${activity.startRegion}, ${activity.startCountry}`
            : activity.startCountry ?? "—"}
        </td>
        {/* col 12: actions — hidden on mobile */}
        <td className="hidden sm:table-cell whitespace-nowrap px-3 py-2 text-sm">
          {isEditing ? (
            <span className="inline-flex items-center gap-2">
              <label className="inline-flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dnf}
                  onChange={(e) => setDnf(e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded border-gray-300 text-red-500 focus:ring-red-400"
                />
                😢 DNF
              </label>
              <button
                onClick={(e) => { e.stopPropagation(); void handleSave(); }}
                className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700"
              >
                Save
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                className="rounded bg-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-400"
              >
                Cancel
              </button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); void onRefresh(); }}
                disabled={refreshing}
                title={refreshError ?? "Refresh from Strava"}
                className={`rounded px-2 py-0.5 text-xs ${
                  refreshError
                    ? "bg-red-100 text-red-600 hover:bg-red-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                } disabled:opacity-50`}
              >
                {refreshing ? "…" : "↺"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEditingChange(true); }}
                className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
              >
                Edit
              </button>
            </span>
          )}
        </td>
      </tr>

      {/* Mobile secondary row — always visible on mobile (sm:hidden) */}
      <tr className="sm:hidden bg-gray-50">
        <td colSpan={12} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            <span>↗ {Math.round(activity.elevationGain)}m</span>
            <span>⏱ {formatDuration(activity.movingTime)}</span>
            <span>⌛ {formatDuration(activity.elapsedTime)}</span>
            {!isEditing && (
              <>
                <span>{awardStatusText}</span>
                <span>{activity.homologationNumber ?? "-"}</span>
              </>
            )}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={homologation}
                    onChange={(e) => setHomologation(e.target.value)}
                    placeholder="Homologation #"
                    className="w-24 rounded border border-gray-300 px-1 py-0.5 text-xs"
                  />
                  <label className="inline-flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dnf}
                      onChange={(e) => setDnf(e.target.checked)}
                      className="rounded border-gray-300 text-red-500 focus:ring-red-400"
                    />
                    😢 DNF
                  </label>
                  <button
                    onClick={() => void handleSave()}
                    className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="rounded bg-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => void onRefresh()}
                    disabled={refreshing}
                    title={refreshError ?? "Refresh from Strava"}
                    className={`rounded px-2 py-0.5 text-xs ${
                      refreshError
                        ? "bg-red-100 text-red-600 hover:bg-red-200"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    } disabled:opacity-50`}
                  >
                    {refreshing ? "…" : "↺ Refresh"}
                  </button>
                  <button
                    onClick={() => onEditingChange(true)}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}
