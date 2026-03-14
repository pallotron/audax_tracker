import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityRow } from "../../components/ActivityRow";
import type { Activity } from "../../db/database";

const mockActivity: Activity = {
  stravaId: "abc123",
  name: "Paris-Brest-Paris 1200km",
  date: new Date("2024-08-18"),
  distance: 1230,
  elevationGain: 8500,
  movingTime: 300000,
  elapsedTime: 320000,
  type: "Ride",
  eventType: "PBP",
  homologationNumber: "H-001",
  classificationSource: "manual",
  needsConfirmation: false,
  manualOverride: true,
  excludeFromAwards: false,
  dnf: false,
  sourceUrl: "https://strava.com/activities/123",
  startLat: 48.45,
  startLng: 1.75,
  endLat: 48.45,
  endLng: 1.75,
  startRegion: "Île-de-France",
  startCountry: "France",
  endRegion: "Île-de-France",
  endCountry: "France",
  isNotableInternational: false,
};

function renderRow(overrides: Partial<Parameters<typeof ActivityRow>[0]> = {}) {
  const props = {
    activity: mockActivity,
    selected: false,
    onToggle: vi.fn(),
    onRefresh: vi.fn(),
    refreshing: false,
    refreshError: null,
    isExpanded: false,
    onToggleExpand: vi.fn(),
    isEditing: false,
    onEditingChange: vi.fn(),
    ...overrides,
  };
  // ActivityRow returns a Fragment with two <tr>s — wrap in table/tbody for valid DOM
  return render(
    <table>
      <tbody>
        <ActivityRow {...props} />
      </tbody>
    </table>
  );
}

describe("ActivityRow", () => {
  it("renders the activity name and distance", () => {
    renderRow();
    expect(screen.getByText("Paris-Brest-Paris 1200km")).toBeInTheDocument();
    expect(screen.getByText("1230")).toBeInTheDocument();
  });

  it("shows a chevron in the type cell on mobile", () => {
    renderRow();
    // chevron character ▸ should be in the document
    expect(screen.getByText(/▸|▾/)).toBeInTheDocument();
  });

  it("calls onToggleExpand when the row is clicked and not editing", async () => {
    const onToggleExpand = vi.fn();
    renderRow({ onToggleExpand });
    // Click the date cell — the name cell's <a> stops propagation.
    // formatDate returns locale-formatted "18 Aug 2024" or "Aug 18, 2024" etc.
    // Match any text that includes "2024" to find the date cell safely.
    await userEvent.click(screen.getByText(/2024/));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });

  it("does not call onToggleExpand when isEditing is true", async () => {
    const onToggleExpand = vi.fn();
    renderRow({ onToggleExpand, isEditing: true, isExpanded: true });
    // Click the date cell (does not stopPropagation, so it reaches the <tr> handler)
    await userEvent.click(screen.getByText(/2024/));
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it("shows expand panel when isExpanded is true", () => {
    renderRow({ isExpanded: true });
    // "Elevation" label only exists in the expand panel
    expect(screen.getByText("Elevation")).toBeInTheDocument();
  });

  it("hides expand panel when isExpanded is false", () => {
    renderRow({ isExpanded: false });
    // The "Elevation" label only appears in the expand panel, not the main row
    expect(screen.queryByText("Elevation")).not.toBeInTheDocument();
  });

  it("calls onEditingChange(true) when Edit is clicked from expand panel", async () => {
    const onEditingChange = vi.fn();
    renderRow({ isExpanded: true, onEditingChange });
    // Scope to the expand panel row — JSDOM renders hidden desktop buttons too,
    // so we use within() to avoid "multiple elements" errors.
    const expandPanel = screen.getByText("Elevation").closest("tr")!;
    await userEvent.click(within(expandPanel).getByRole("button", { name: /edit/i }));
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });

  it("shows edit controls in expand panel when isEditing is true", () => {
    renderRow({ isExpanded: true, isEditing: true });
    const expandPanel = screen.getByText("Elevation").closest("tr")!;
    expect(within(expandPanel).getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(within(expandPanel).getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls onEditingChange(false) when Cancel is clicked", async () => {
    const onEditingChange = vi.fn();
    renderRow({ isExpanded: true, isEditing: true, onEditingChange });
    const expandPanel = screen.getByText("Elevation").closest("tr")!;
    await userEvent.click(within(expandPanel).getByRole("button", { name: /cancel/i }));
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });
});
