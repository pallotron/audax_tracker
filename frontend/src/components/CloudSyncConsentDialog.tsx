interface Props {
  onEnable: () => void;
  onDismiss: () => void;
}

export default function CloudSyncConsentDialog({ onEnable, onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Enable Cloud Sync?</h2>
        <p className="mb-3 text-sm text-gray-600">
          Your activity annotations (event types, DNF flags, homologation numbers) will be
          securely stored on Cloudflare using your Strava identity. No separate account needed.
        </p>
        <ul className="mb-4 space-y-1 text-sm text-gray-600 list-disc pl-5">
          <li>Syncs automatically in the background</li>
          <li>Works across all your devices</li>
          <li>Strava activity data, GPS tracks, and personal info are never stored in the cloud</li>
          <li>You can delete your cloud data at any time</li>
        </ul>
        <div className="flex justify-end gap-3">
          <button
            onClick={onDismiss}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            No thanks
          </button>
          <button
            onClick={onEnable}
            aria-label="Enable cloud sync"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Yes, enable it
          </button>
        </div>
      </div>
    </div>
  );
}
