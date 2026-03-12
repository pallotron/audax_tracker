import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CloudSyncDisableDialog from "../../components/CloudSyncDisableDialog";

describe("CloudSyncDisableDialog", () => {
  it("renders keep, delete, and cancel options", () => {
    render(<CloudSyncDisableDialog onKeep={vi.fn()} onDelete={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Keep my cloud data/i)).toBeInTheDocument();
    expect(screen.getByText(/Delete my cloud data/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
  });

  it("calls onKeep when Keep button is clicked", async () => {
    const onKeep = vi.fn();
    render(<CloudSyncDisableDialog onKeep={onKeep} onDelete={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByText(/Keep my cloud data/i));
    expect(onKeep).toHaveBeenCalledOnce();
  });

  it("calls onDelete when Delete button is clicked", async () => {
    const onDelete = vi.fn();
    render(<CloudSyncDisableDialog onKeep={vi.fn()} onDelete={onDelete} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByText(/Delete my cloud data/i));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const onCancel = vi.fn();
    render(<CloudSyncDisableDialog onKeep={vi.fn()} onDelete={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
