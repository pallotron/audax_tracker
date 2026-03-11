# Exclusions Export/Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to export their ride exclusion settings to a JSON file and import that file on another device so exclusions stay consistent across devices.

**Architecture:** Two new functions in `database.ts` handle serialisation/deserialisation. A new `ExclusionsTransferButton` React component renders a secondary icon button near the Sync with Strava button that opens a modal with export and import actions. The import overwrites all matching exclusion states on the target device (imported file wins).

**Tech Stack:** React 19, TypeScript, Dexie.js 4.x (IndexedDB), Vitest, Tailwind CSS 4.x

**Spec:** `docs/superpowers/specs/2026-03-11-exclusions-export-import-design.md`

---

## Chunk 1: Database layer

### Task 1: Add export/import types and functions to `database.ts`

**Files:**
- Modify: `frontend/src/db/database.ts` (append near the end, after the existing bulk functions)
- Test: `frontend/src/__tests__/db/database.test.ts`

---

- [ ] **Step 1.1: Write failing tests**

Append a new `describe` block to `frontend/src/__tests__/db/database.test.ts`:

```typescript
import {
  db,
  type Activity,
  bulkConfirm,
  bulkSetType,
  bulkExcludeFromAwards,
  bulkIncludeInAwards,
  exportExclusions,
  importExclusions,
} from "../../db/database";

// --- add inside the existing describe("Activity database", ...) block ---

describe("exportExclusions", () => {
  it("returns all activities with stravaId and excludeFromAwards", async () => {
    await db.activities.bulkAdd([
      { ...sampleActivity, stravaId: "1", excludeFromAwards: false },
      { ...sampleActivity, stravaId: "2", excludeFromAwards: true },
    ]);

    const result = await exportExclusions();

    expect(result.version).toBe(1);
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.exclusions).toHaveLength(2);
    expect(result.exclusions).toEqual(
      expect.arrayContaining([
        { stravaId: "1", excludeFromAwards: false },
        { stravaId: "2", excludeFromAwards: true },
      ])
    );
  });

  it("returns empty exclusions array when no activities exist", async () => {
    const result = await exportExclusions();
    expect(result.exclusions).toHaveLength(0);
  });
});

describe("importExclusions", () => {
  beforeEach(async () => {
    await db.activities.bulkAdd([
      { ...sampleActivity, stravaId: "1", excludeFromAwards: false },
      { ...sampleActivity, stravaId: "2", excludeFromAwards: false },
    ]);
  });

  it("updates excludeFromAwards for matching activities", async () => {
    await importExclusions({
      version: 1,
      exportedAt: "2026-03-11T10:00:00Z",
      exclusions: [
        { stravaId: "1", excludeFromAwards: true },
        { stravaId: "2", excludeFromAwards: false },
      ],
    });

    const a1 = await db.activities.get("1");
    const a2 = await db.activities.get("2");
    expect(a1!.excludeFromAwards).toBe(true);
    expect(a2!.excludeFromAwards).toBe(false);
  });

  it("silently skips stravaIds not in the local database", async () => {
    await expect(
      importExclusions({
        version: 1,
        exportedAt: "2026-03-11T10:00:00Z",
        exclusions: [{ stravaId: "unknown-999", excludeFromAwards: true }],
      })
    ).resolves.not.toThrow();
  });

  it("throws on wrong version", async () => {
    await expect(
      importExclusions({ version: 99, exportedAt: "", exclusions: [] })
    ).rejects.toThrow("Unsupported exclusions file version");
  });

  it("throws when exclusions is not an array", async () => {
    await expect(
      importExclusions({ version: 1, exportedAt: "", exclusions: "bad" })
    ).rejects.toThrow("Invalid exclusions file format");
  });

  it("throws when an entry is missing stravaId", async () => {
    await expect(
      importExclusions({
        version: 1,
        exportedAt: "",
        exclusions: [{ excludeFromAwards: true }],
      })
    ).rejects.toThrow("Invalid exclusions file format");
  });

  it("throws when excludeFromAwards is not a boolean", async () => {
    await expect(
      importExclusions({
        version: 1,
        exportedAt: "",
        exclusions: [{ stravaId: "1", excludeFromAwards: "yes" }],
      })
    ).rejects.toThrow("Invalid exclusions file format");
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|exportExclusions|importExclusions"
```

Expected: tests fail with `exportExclusions is not exported` (or similar import error).

- [ ] **Step 1.3: Add types and functions to `database.ts`**

Append the following after the existing `bulkIncludeInAwards` function in `frontend/src/db/database.ts`:

```typescript
// --- Exclusions export/import ---

export interface ExclusionEntry {
  stravaId: string;
  excludeFromAwards: boolean;
}

export interface ExclusionsExport {
  version: 1;
  exportedAt: string;
  exclusions: ExclusionEntry[];
}

export async function exportExclusions(): Promise<ExclusionsExport> {
  const activities = await db.activities.toArray();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    exclusions: activities.map((a) => ({
      stravaId: a.stravaId,
      excludeFromAwards: a.excludeFromAwards,
    })),
  };
}

export async function importExclusions(data: unknown): Promise<void> {
  const d = data as Record<string, unknown>;
  if (d.version !== 1) {
    throw new Error("Unsupported exclusions file version");
  }
  if (!Array.isArray(d.exclusions)) {
    throw new Error("Invalid exclusions file format");
  }
  for (const entry of d.exclusions) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>).stravaId !== "string" ||
      typeof (entry as Record<string, unknown>).excludeFromAwards !== "boolean"
    ) {
      throw new Error("Invalid exclusions file format");
    }
  }
  await db.transaction("rw", db.activities, async () => {
    for (const entry of d.exclusions as ExclusionEntry[]) {
      await db.activities.update(entry.stravaId, {
        excludeFromAwards: entry.excludeFromAwards,
      });
    }
  });
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|exportExclusions|importExclusions"
```

Expected: all new tests PASS.

- [ ] **Step 1.5: Commit**

```bash
jj st
jj desc -m "feat: add exportExclusions and importExclusions to database"
```

---

## Chunk 2: UI component and integration

### Task 2: Create `ExclusionsTransferButton` component

**Files:**
- Create: `frontend/src/components/ExclusionsTransferButton.tsx`

This component renders an icon button that opens a modal with Export and Import actions.

- [ ] **Step 2.1: Create the component**

Create `frontend/src/components/ExclusionsTransferButton.tsx`:

```tsx
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
        URL.revokeObjectURL(url);
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
              onClick={() => setOpen(false)}
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
```

- [ ] **Step 2.2: Run the full test suite to confirm nothing broke**

```bash
cd frontend && npm test
```

Expected: all tests PASS (no new tests needed for this pure UI component — it has no logic beyond what's already tested in database.ts).

- [ ] **Step 2.3: Commit**

```bash
jj st
jj desc -m "feat: add ExclusionsTransferButton component"
```

---

### Task 3: Integrate `ExclusionsTransferButton` into `DashboardPage`

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

The Sync with Strava button lives in the `flex items-center justify-between` header row at the top of `DashboardPage`. Add `ExclusionsTransferButton` next to it as a secondary, visually subdued companion.

- [ ] **Step 3.1: Import and render the component**

In `frontend/src/pages/DashboardPage.tsx`:

1. Add the import at the top:
```typescript
import { ExclusionsTransferButton } from "../components/ExclusionsTransferButton";
```

2. Find the header row (around line 76–105):
```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
  <button
    onClick={sync}
    ...
  >
    ...
  </button>
</div>
```

Replace the inner `<button>` section with a flex group so both buttons sit side by side:
```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
  <div className="flex items-center gap-2">
    <ExclusionsTransferButton />
    <button
      onClick={sync}
      disabled={syncing || checking}
      className="relative inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {hasPending && !syncing && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-300 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-400" />
        </span>
      )}
      {syncing ? (
        <>
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {progress ? `Fetched ${progress.fetched} activities…` : "Connecting..."}
        </>
      ) : checking ? (
        "Checking Strava…"
      ) : hasPending ? (
        "New activities — Sync now"
      ) : (
        "Sync with Strava"
      )}
    </button>
  </div>
</div>
```

- [ ] **Step 3.2: Run the full test suite**

```bash
cd frontend && npm test
```

Expected: all tests PASS.

- [ ] **Step 3.3: Build to confirm no TypeScript errors**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build completes without errors.

- [ ] **Step 3.4: Commit**

```bash
jj st
jj desc -m "feat: integrate ExclusionsTransferButton into DashboardPage"
```
