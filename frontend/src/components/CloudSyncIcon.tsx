import type { CloudSyncHook } from "../cloud/useCloudSync";

interface Props {
  sync: CloudSyncHook;
  onRetry?: () => void;
  onDisable?: () => void;
}

export default function CloudSyncIcon({ sync, onRetry, onDisable }: Props) {
  if (!sync.enabled) return null;

  const isClickable = sync.status === "error" || sync.status === "synced" || sync.status === "idle";
  const tooltip =
    sync.status === "synced" && sync.lastSynced
      ? `Last synced: ${new Date(sync.lastSynced).toLocaleTimeString()} — click to manage`
      : sync.status === "error"
      ? `${sync.error ?? "Sync error"} — click to retry`
      : sync.status === "syncing"
      ? "Syncing to cloud…"
      : "Cloud sync enabled — click to manage";

  const handleClick = () => {
    if (sync.status === "error") onRetry?.();
    else onDisable?.();
  };

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center ${isClickable ? "cursor-pointer" : ""}`}
      onClick={isClickable ? handleClick : undefined}
    >
      {sync.status === "syncing" && (
        <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {sync.status === "synced" && (
        <svg className="h-4 w-4 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
        </svg>
      )}
      {sync.status === "error" && (
        <svg className="h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 01-1-1v-4a1 1 0 112 0v4a1 1 0 01-1 1z" clipRule="evenodd" />
        </svg>
      )}
      {sync.status === "idle" && (
        <svg className="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
        </svg>
      )}
    </span>
  );
}
