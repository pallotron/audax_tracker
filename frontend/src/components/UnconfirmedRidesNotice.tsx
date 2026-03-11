import { Link } from "react-router-dom";

export function UnconfirmedRidesNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>
        {count} {count === 1 ? "ride is" : "rides are"} unconfirmed and not counted toward awards.
      </span>
      <Link
        to="/activities?needsConfirm=1"
        className="ml-4 font-medium underline hover:text-amber-900 whitespace-nowrap"
      >
        Review in Activities →
      </Link>
    </div>
  );
}
