import { Link } from "react-router-dom";
import { ProgressBar } from "./ProgressBar";

interface RequirementItem {
  label: string;
  met: boolean;
  details: string;
}

interface QualificationCardProps {
  title: string;
  type: "5000" | "10000";
  qualified: boolean;
  totalKm: number;
  targetKm: number;
  requirements: RequirementItem[];
}

export function QualificationCard({
  title,
  type,
  qualified,
  totalKm,
  targetKm,
  requirements,
}: QualificationCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {qualified ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-0.5 text-sm font-medium text-green-800">
            Qualified
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-0.5 text-sm font-medium text-yellow-800">
            In Progress
          </span>
        )}
      </div>

      <ProgressBar
        current={Math.round(totalKm)}
        target={targetKm}
        label="Distance"
      />

      <ul className="space-y-2">
        {requirements.map((req) => (
          <li key={req.label} className="flex items-start gap-2 text-sm">
            {req.met ? (
              <svg
                className="h-5 w-5 flex-shrink-0 text-green-500"
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
                className="h-5 w-5 flex-shrink-0 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            <div>
              <span
                className={
                  req.met ? "text-gray-900" : "text-red-600 font-medium"
                }
              >
                {req.label}
              </span>
              <p className={req.met ? "text-gray-400 text-xs" : "text-red-500 text-xs"}>
                {req.details}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <Link
        to={`/qualification/${type}`}
        className="text-sm text-orange-600 hover:text-orange-700 font-medium mt-auto"
      >
        View details &rarr;
      </Link>
    </div>
  );
}
