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

// Helper: the secondary row always contains "↗" in its stats — use it to scope queries.
// JSDOM renders hidden desktop columns too, so within() prevents "multiple elements" errors.
function getSecondaryRow() {
  return screen.getByText(/↗/).closest("tr")!;
}

describe("ActivityRow", () => {
  it("renders the activity name and distance", () => {
    renderRow();
    expect(screen.getByText("Paris-Brest-Paris 1200km")).toBeInTheDocument();
    expect(screen.getByText("1230")).toBeInTheDocument();
  });

  it("secondary row is always rendered", () => {
    renderRow();
    // The "↗" elevation prefix only appears in the secondary row stats
    expect(screen.getByText(/↗/)).toBeInTheDocument();
  });

  it("Edit button is always visible in secondary row", () => {
    renderRow();
    expect(within(getSecondaryRow()).getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("Refresh button is always visible in secondary row", () => {
    renderRow();
    expect(within(getSecondaryRow()).getByRole("button", { name: /↺/i })).toBeInTheDocument();
  });

  it("calls onEditingChange(true) when Edit is clicked", async () => {
    const onEditingChange = vi.fn();
    renderRow({ onEditingChange });
    await userEvent.click(within(getSecondaryRow()).getByRole("button", { name: /edit/i }));
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });

  it("shows Save and Cancel in secondary row when isEditing", () => {
    renderRow({ isEditing: true });
    expect(within(getSecondaryRow()).getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(within(getSecondaryRow()).getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls onEditingChange(false) when Cancel is clicked", async () => {
    const onEditingChange = vi.fn();
    renderRow({ isEditing: true, onEditingChange });
    await userEvent.click(within(getSecondaryRow()).getByRole("button", { name: /cancel/i }));
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });
});
