import { useRef, useState } from "react";
import { exportExclusions, importExclusions } from "../db/database";

export function ExclusionsTransferButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    exportExclusions()
      .then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "audax-exclusions.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        setStatus("Exclusions exported.");
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Export failed.");
        setStatus(null);
      });
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !window.confirm(
        "This will overwrite exclusion settings for all matching rides. Continue?"
      )
    ) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target!.result as string);
        await importExclusions(data);
        setStatus("Exclusions imported successfully.");
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed.");
        setStatus(null);
      } finally {
        e.target.value = "";
      }
    };
    reader.onerror = () => {
      setError("Could not read file.");
      setStatus(null);
    };
    reader.readAsText(file);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setStatus(null); setError(null); }}
        title="Export / Import exclusions"
        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50"
        aria-label="Export or import exclusions"
      >
        {/* Upload/download icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12"
          />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-80 rounded-lg bg-white p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">
              Exclusions
            </h2>

            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Export your exclusion settings to a file, then import on another
                device.
              </p>

              <button
                onClick={handleExport}
                className="w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                Export exclusions
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Import exclusions…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileSelected}
              />
            </div>

            {status && (
              <p className="text-sm text-green-700">{status}</p>
            )}
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              onClick={() => { setOpen(false); setStatus(null); setError(null); }}
              className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
