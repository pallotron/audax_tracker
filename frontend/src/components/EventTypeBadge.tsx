import type { EventType, ClassificationSource } from "../db/types";

interface EventTypeBadgeProps {
  eventType: EventType;
  source: ClassificationSource;
  needsConfirmation?: boolean;
  dnf?: boolean;
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
  Permanent: "bg-violet-100 text-violet-800",
  Other: "bg-gray-100 text-gray-800",
};

export const SOURCE_LABELS: Record<ClassificationSource, { icon: string; title: string }> = {
  manual: { icon: "✏️", title: "Manually classified" },
  "auto-name": { icon: "🏷️", title: "Auto-classified by name" },
  "auto-distance": { icon: "📏", title: "Auto-classified by distance" },
};

export function ClassificationLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
      <span className="font-medium text-gray-600">Legend:</span>
      {(Object.entries(SOURCE_LABELS) as [ClassificationSource, { icon: string; title: string }][]).map(
        ([, { icon, title }]) => (
          <span key={title} className="inline-flex items-center gap-1">
            <span>{icon}</span>
            <span>{title}</span>
          </span>
        )
      )}
      <span className="inline-flex items-center gap-1">
        <span className="inline-block rounded-full px-1.5 py-0.5 text-xs ring-2 ring-yellow-400 bg-gray-100">?</span>
        <span>Needs confirmation</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span>😢</span>
        <span>DNF</span>
      </span>
    </div>
  );
}

export function EventTypeBadge({ eventType, source, needsConfirmation, dnf }: EventTypeBadgeProps) {
  if (eventType === null) {
    return <span className="text-gray-400">-</span>;
  }

  const colorClass = badgeColors[eventType] ?? "bg-gray-100 text-gray-800";
  const borderClass = needsConfirmation ? "ring-2 ring-yellow-400" : "";

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass} ${borderClass}`}
      >
        {eventType}
        {needsConfirmation && <span className="ml-0.5 text-yellow-600">?</span>}
      </span>
      <span className="text-xs cursor-help" title={SOURCE_LABELS[source].title}>
        {SOURCE_LABELS[source].icon}
      </span>
      {dnf && <span className="text-sm cursor-help" title="Did Not Finish">😢</span>}
    </span>
  );
}
