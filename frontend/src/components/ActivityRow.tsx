import { useState } from "react";
import { db, type Activity } from "../db/database";
import type { EventType } from "../db/types";
import { EventTypeBadge } from "./EventTypeBadge";

interface ActivityRowProps {
  activity: Activity;
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
  "SuperRandonneur",
  "TraceVelocio",
  "FlecheDeFrance",
  "Other",
];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function ActivityRow({ activity }: ActivityRowProps) {
  const [editing, setEditing] = useState(false);
  const [eventType, setEventType] = useState<EventType>(activity.eventType);
  const [homologation, setHomologation] = useState(
    activity.homologationNumber ?? ""
  );

  const handleSave = async () => {
    await db.activities.update(activity.stravaId, {
      eventType,
      homologationNumber: homologation || null,
      manualOverride: true,
      classificationSource: "manual",
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEventType(activity.eventType);
    setHomologation(activity.homologationNumber ?? "");
    setEditing(false);
  };

  const date =
    activity.date instanceof Date
      ? activity.date
      : new Date(activity.date);

  return (
    <tr className="hover:bg-gray-50">
      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-900">
        {date.toLocaleDateString()}
      </td>
      <td className="max-w-xs truncate px-3 py-2 text-sm text-gray-900">
        {activity.name}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-600 text-right">
        {Math.round(activity.distance)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-600 text-right">
        {Math.round(activity.elevationGain)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-600">
        {formatDuration(activity.movingTime)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-600">
        {formatDuration(activity.elapsedTime)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">
        {editing ? (
          <select
            value={eventType ?? ""}
            onChange={(e) =>
              setEventType(
                e.target.value === "" ? null : (e.target.value as EventType)
              )
            }
            className="rounded border border-gray-300 px-1 py-0.5 text-xs"
          >
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt ?? "__null__"} value={opt ?? ""}>
                {opt ?? "(none)"}
              </option>
            ))}
          </select>
        ) : (
          <EventTypeBadge
            eventType={activity.eventType}
            source={activity.classificationSource}
            needsConfirmation={activity.needsConfirmation && !activity.manualOverride}
          />
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-600">
        {editing ? (
          <input
            type="text"
            value={homologation}
            onChange={(e) => setHomologation(e.target.value)}
            placeholder="Homologation #"
            className="w-28 rounded border border-gray-300 px-1 py-0.5 text-xs"
          />
        ) : (
          activity.homologationNumber ?? "-"
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">
        {editing ? (
          <span className="inline-flex gap-1">
            <button
              onClick={handleSave}
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
          </span>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}
