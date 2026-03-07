import { useState } from "react";
import type { EventType } from "../db/types";

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: null, label: "(none)" },
  { value: "BRM200", label: "BRM200" },
  { value: "BRM300", label: "BRM300" },
  { value: "BRM400", label: "BRM400" },
  { value: "BRM600", label: "BRM600" },
  { value: "BRM1000", label: "BRM1000" },
  { value: "PBP", label: "PBP" },
  { value: "RM1200+", label: "RM1200+" },
  { value: "Fleche", label: "Fleche" },
  { value: "SuperRandonneur", label: "SuperRandonneur" },
  { value: "TraceVelocio", label: "TraceVelocio" },
  { value: "FlecheDeFrance", label: "FlecheDeFrance" },
  { value: "Permanent", label: "Permanent" },
  { value: "Other", label: "Other" },
];

interface BulkActionBarProps {
  selectedCount: number;
  onConfirm: () => void;
  onSetType: (eventType: EventType) => void;
  onSetDnf: (dnf: boolean) => void;
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, onConfirm, onSetType, onSetDnf, onClear }: BulkActionBarProps) {
  const [bulkEventType, setBulkEventType] = useState<EventType>("BRM200");

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between rounded-t-lg bg-gray-800 px-6 py-3 text-white shadow-lg">
      <span className="text-sm font-medium">
        {selectedCount} {selectedCount === 1 ? "activity" : "activities"} selected
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={onConfirm}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          Confirm Selected
        </button>
        <div className="flex items-center gap-1.5">
          <select
            value={bulkEventType ?? ""}
            onChange={(e) =>
              setBulkEventType(e.target.value === "" ? null : (e.target.value as EventType))
            }
            className="rounded-md border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white"
          >
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => onSetType(bulkEventType)}
            className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Set Type
          </button>
        </div>
        <button
          onClick={() => onSetDnf(true)}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          😢 Mark DNF
        </button>
        <button
          onClick={() => onSetDnf(false)}
          className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
        >
          Clear DNF
        </button>
        <button
          onClick={onClear}
          className="rounded-md bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-500"
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
}
