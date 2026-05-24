import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmModal } from "../ConfirmModal.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConfirmModal", () => {
  const defaultProps = {
    open: true,
    title: "Delete item",
    children: "Are you sure?",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders nothing when open is false", () => {
    render(<ConfirmModal {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog when open is true", () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete item")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("calls onCancel when Escape key is pressed", () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when backdrop is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("dialog"));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("traps focus: Tab from last element wraps to first", () => {
    render(<ConfirmModal {...defaultProps} />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const confirmButton = screen.getByRole("button", { name: "Confirm" });

    confirmButton.focus();
    expect(document.activeElement).toBe(confirmButton);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(cancelButton);
  });

  it("traps focus: Shift+Tab from first element wraps to last", () => {
    render(<ConfirmModal {...defaultProps} />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const confirmButton = screen.getByRole("button", { name: "Confirm" });

    // Focus the first focusable element (cancel button)
    cancelButton.focus();
    expect(document.activeElement).toBe(cancelButton);

    // Shift+Tab should wrap to the last element (confirm button)
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Tab",
      shiftKey: true,
    });
    expect(document.activeElement).toBe(confirmButton);
  });

  it("uses custom button labels when provided", () => {
    render(<ConfirmModal {...defaultProps} confirmLabel="Delete" cancelLabel="Keep" />);

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });
});
