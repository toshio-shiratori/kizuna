import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Telepathy } from "../Telepathy.js";

interface FetchHandler {
  match: (url: string, init?: RequestInit) => boolean;
  response: unknown;
  ok?: boolean;
  status?: number;
}

function mockFetchByUrl(handlers: FetchHandler[]) {
  return vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    const h = handlers.find((handler) => handler.match(url, init));
    if (!h) return Promise.reject(new Error(`Unmocked: ${url}`));
    return Promise.resolve({
      ok: h.ok ?? true,
      status: h.status ?? 200,
      json: () => Promise.resolve(h.response),
    } as Response);
  });
}

function defaultHandlers(overrides: Partial<Record<string, FetchHandler>> = {}): FetchHandler[] {
  return [
    overrides.reports ?? {
      match: (url) => url.startsWith("/api/reports"),
      response: { reports: [], total: 0 },
    },
    overrides.references ?? {
      match: (url) => url.startsWith("/api/telepathy/references"),
      response: { references: [] },
    },
    overrides.receive ?? {
      match: (url) => url.startsWith("/api/telepathy/receive"),
      response: { messages: [] },
    },
    overrides.send ?? {
      match: (url, init) => url.startsWith("/api/telepathy/send") && init?.method === "POST",
      response: { ok: true, length: 10 },
    },
  ];
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Telepathy", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchByUrl(defaultHandlers()));
  });

  it("renders send and receive sections", async () => {
    render(<Telepathy />);

    expect(await screen.findByText("Send Message")).toBeInTheDocument();
    expect(screen.getByText("Received Messages")).toBeInTheDocument();
  });

  it("shows message input and send button", async () => {
    render(<Telepathy />);

    expect(await screen.findByPlaceholderText("Enter message to share...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("disables send button when message is empty", async () => {
    render(<Telepathy />);

    const sendButton = await screen.findByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();
  });

  it("enables send button when message has content", async () => {
    render(<Telepathy />);

    const textarea = await screen.findByPlaceholderText("Enter message to share...");
    fireEvent.change(textarea, { target: { value: "Hello other project!" } });

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).not.toBeDisabled();
  });

  it("opens confirm modal when send is clicked", async () => {
    render(<Telepathy />);

    const textarea = await screen.findByPlaceholderText("Enter message to share...");
    fireEvent.change(textarea, { target: { value: "Hello other project!" } });

    const sendButton = screen.getByRole("button", { name: "Send" });
    fireEvent.click(sendButton);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Send Telepathy Message")).toBeInTheDocument();
  });

  it("sends message after confirmation", async () => {
    render(<Telepathy />);

    const textarea = await screen.findByPlaceholderText("Enter message to share...");
    fireEvent.change(textarea, { target: { value: "Hello other project!" } });

    // Click send to open modal
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // Confirm in modal -- find the dialog, then get the Send button inside it
    const dialog = await screen.findByRole("dialog");
    const allSendButtons = screen.getAllByRole("button", { name: "Send" });
    const modalSendButton = allSendButtons.find((btn) => dialog.contains(btn));
    fireEvent.click(modalSendButton!);

    // Wait for success result
    expect(await screen.findByText(/Sent/)).toBeInTheDocument();
  });

  it("shows send error on failure", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          send: {
            match: (url, init) => url.startsWith("/api/telepathy/send") && init?.method === "POST",
            response: { error: "Write mode disabled" },
            ok: false,
            status: 403,
          },
        }),
      ),
    );

    render(<Telepathy />);

    const textarea = await screen.findByPlaceholderText("Enter message to share...");
    fireEvent.change(textarea, { target: { value: "Test message" } });

    // Click send to open modal
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // Confirm in modal
    const dialog = await screen.findByRole("dialog");
    const allSendButtons = screen.getAllByRole("button", { name: "Send" });
    const modalSendButton = allSendButtons.find((btn) => dialog.contains(btn));
    fireEvent.click(modalSendButton!);

    expect(await screen.findByText(/Write mode disabled/)).toBeInTheDocument();
  });

  it("shows received messages", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          receive: {
            match: (url) => url.startsWith("/api/telepathy/receive"),
            response: {
              messages: [
                {
                  source: "project-alpha",
                  message: "Hello from alpha!",
                  createdAt: "2025-05-20T10:00:00Z",
                },
                {
                  source: "project-beta",
                  message: "Hello from beta!",
                  createdAt: "2025-05-20T11:00:00Z",
                },
              ],
            },
          },
        }),
      ),
    );

    render(<Telepathy />);

    expect(await screen.findByText("project-alpha")).toBeInTheDocument();
    expect(screen.getByText("Hello from alpha!")).toBeInTheDocument();
    expect(screen.getByText("project-beta")).toBeInTheDocument();
    expect(screen.getByText("Hello from beta!")).toBeInTheDocument();
  });

  it("shows empty state when no messages", async () => {
    render(<Telepathy />);

    expect(await screen.findByText("No messages from other projects")).toBeInTheDocument();
  });

  it("shows refresh button and triggers a new receive fetch", async () => {
    const fetchMock = mockFetchByUrl(defaultHandlers());
    vi.stubGlobal("fetch", fetchMock);

    render(<Telepathy />);

    const refreshButton = await screen.findByRole("button", { name: "Refresh" });
    expect(refreshButton).toBeInTheDocument();

    const callsBefore = fetchMock.mock.calls.filter(
      (call: [RequestInfo, RequestInit?]) =>
        typeof call[0] === "string" && call[0].startsWith("/api/telepathy/receive"),
    ).length;

    fireEvent.click(refreshButton);

    await waitFor(() => {
      const callsAfter = fetchMock.mock.calls.filter(
        (call: [RequestInfo, RequestInit?]) =>
          typeof call[0] === "string" && call[0].startsWith("/api/telepathy/receive"),
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  it("shows references when available", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          references: {
            match: (url) => url.startsWith("/api/telepathy/references"),
            response: {
              references: [
                { name: "project-alpha", dbPath: "/path/to/alpha.db" },
                { name: "project-beta", dbPath: "/path/to/beta.db" },
              ],
            },
          },
        }),
      ),
    );

    render(<Telepathy />);

    expect(await screen.findByText("project-alpha")).toBeInTheDocument();
    expect(screen.getByText("project-beta")).toBeInTheDocument();
    expect(screen.getByText(/Discoverable projects/)).toBeInTheDocument();
  });

  it("shows report dropdown when reports are available", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          reports: {
            match: (url) => url.startsWith("/api/reports"),
            response: {
              reports: [
                {
                  id: 1,
                  type: "analysis",
                  source: "test",
                  title: "Test Report",
                  content: "Report content here",
                  status: "active",
                  createdAt: "2025-05-20T10:00:00Z",
                },
              ],
              total: 1,
            },
          },
        }),
      ),
    );

    render(<Telepathy />);

    expect(await screen.findByText("Load from report")).toBeInTheDocument();
    expect(screen.getByText("Select a report...")).toBeInTheDocument();
  });

  it("shows receive note when returned by API", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          receive: {
            match: (url) => url.startsWith("/api/telepathy/receive"),
            response: {
              messages: [],
              note: "No references configured",
            },
          },
        }),
      ),
    );

    render(<Telepathy />);

    expect(await screen.findByText("No references configured")).toBeInTheDocument();
  });

  it("shows receive error on failure", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          receive: {
            match: (url) => url.startsWith("/api/telepathy/receive"),
            response: {},
            ok: false,
            status: 500,
          },
        }),
      ),
    );

    render(<Telepathy />);

    expect(await screen.findByText(/Failed to load/)).toBeInTheDocument();
  });
});
