import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CloudSyncConsentDialog from "../../components/CloudSyncConsentDialog";

describe("CloudSyncConsentDialog", () => {
  it("renders the dialog with enable and dismiss buttons", () => {
    render(<CloudSyncConsentDialog onEnable={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/Enable Cloud Sync/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enable cloud sync/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /No thanks/i })).toBeInTheDocument();
  });

  it("calls onEnable when Enable button is clicked", async () => {
    const onEnable = vi.fn();
    render(<CloudSyncConsentDialog onEnable={onEnable} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Enable cloud sync/i }));
    expect(onEnable).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when No thanks button is clicked", async () => {
    const onDismiss = vi.fn();
    render(<CloudSyncConsentDialog onEnable={vi.fn()} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: /No thanks/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
