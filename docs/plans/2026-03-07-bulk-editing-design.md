# Bulk Editing for Activities Page

## Goal

Allow users to confirm or change the event type of multiple activities at once, reducing the tedium of one-by-one inline editing.

## Design

### Selection Model

- A new checkbox column is added as the first column in the activities table.
- **Header checkbox** toggles all *filtered* activity IDs (across all pages, not just the visible page).
- **Row checkboxes** toggle individual activities in/out of the selection.
- Header checkbox shows indeterminate state when some (but not all) filtered activities are selected.
- Changing filters does not clear the selection.
- State: `selectedIds: Set<string>` in `ActivitiesPage`.

### Bulk Action Bar

- Sticky bar fixed to the bottom of the viewport, visible only when `selectedIds.size > 0`.
- Dark background (`bg-gray-800 text-white`), rounded top corners, subtle shadow.
- Left side: "{N} activities selected" count.
- Right side actions:
  - **"Confirm Selected"** button — accepts current auto-classification for all selected (`manualOverride: true`, `needsConfirmation: false`), no type change.
  - **Event type dropdown + "Set Type"** button — sets chosen `eventType` on all selected, plus `manualOverride: true`, `needsConfirmation: false`, `classificationSource: "manual"`.
  - **"Clear Selection"** button — deselects all.
- After any bulk action completes, the selection is cleared.

### Database Operations

- Bulk confirm: `db.transaction("rw", db.activities, ...)` updating all selected IDs with `{ manualOverride: true, needsConfirmation: false }`.
- Bulk set type: same transaction pattern, updating `{ eventType, manualOverride: true, needsConfirmation: false, classificationSource: "manual" }`.
- Dexie's `useLiveQuery` auto-re-renders the table after updates.

### Approach

All state and logic lives in `ActivitiesPage` (Approach A). The sticky bar is extracted into a `BulkActionBar` component for readability, but receives all state via props. No new hooks or contexts.

### Components Changed

- `ActivitiesPage.tsx` — selection state, checkbox column, bulk action handlers, renders `BulkActionBar`
- `ActivityRow.tsx` — receives `selected` and `onToggle` props, renders row checkbox
- New: `BulkActionBar.tsx` — sticky bottom bar with action buttons
