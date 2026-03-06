import type { EventType, ClassificationSource } from "../db/types";

interface EventTypeBadgeProps {
  eventType: EventType;
  source: ClassificationSource;
}

const badgeColors: Record<string, string> = {
  BRM200: "bg-blue-100 text-blue-800",
  BRM300: "bg-indigo-100 text-indigo-800",
  BRM400: "bg-purple-100 text-purple-800",
  BRM600: "bg-pink-100 text-pink-800",
  BRM1000: "bg-red-100 text-red-800",
  PBP: "bg-yellow-100 text-yellow-800",
  "RM1200+": "bg-orange-100 text-orange-800",
  Fleche: "bg-green-100 text-green-800",
  SuperRandonneur: "bg-teal-100 text-teal-800",
  TraceVelocio: "bg-cyan-100 text-cyan-800",
  FlecheDeFrance: "bg-emerald-100 text-emerald-800",
  Other: "bg-gray-100 text-gray-800",
};

const sourceLabels: Record<ClassificationSource, string> = {
  manual: "(manual)",
  "auto-name": "(name)",
  "auto-distance": "(dist)",
};

export function EventTypeBadge({ eventType, source }: EventTypeBadgeProps) {
  if (eventType === null) {
    return <span className="text-gray-400">-</span>;
  }

  const colorClass = badgeColors[eventType] ?? "bg-gray-100 text-gray-800";

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
      >
        {eventType}
      </span>
      <span className="text-xs text-gray-400">{sourceLabels[source]}</span>
    </span>
  );
}
