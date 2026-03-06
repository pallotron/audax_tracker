interface ProgressBarProps {
  current: number;
  target: number;
  label: string;
}

export function ProgressBar({ current, target, label }: ProgressBarProps) {
  const pct = Math.min((current / target) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{label}</span>
        <span>
          {current.toLocaleString()} / {target.toLocaleString()} km
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-orange-500 h-3 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
