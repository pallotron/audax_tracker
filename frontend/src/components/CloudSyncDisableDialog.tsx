interface Props {
  onKeep: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export default function CloudSyncDisableDialog({ onKeep, onDelete, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Disable Cloud Sync</h2>
        <p className="mb-4 text-sm text-gray-600">What would you like to do with your cloud data?</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onKeep}
            className="rounded-lg border border-gray-200 px-4 py-3 text-left text-sm hover:bg-gray-50"
          >
            <span className="font-medium text-gray-800">Keep my cloud data</span>
            <p className="text-gray-500 mt-0.5">
              Sync is turned off, but your data stays in the cloud. You can re-enable later.
            </p>
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg border border-red-200 px-4 py-3 text-left text-sm hover:bg-red-50"
          >
            <span className="font-medium text-red-700">Delete my cloud data</span>
            <p className="text-red-500 mt-0.5">
              Permanently removes your data from the cloud. Only your local browser copy remains.
            </p>
          </button>
          <button onClick={onCancel} className="mt-1 text-sm text-gray-500 hover:text-gray-700 text-center">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
