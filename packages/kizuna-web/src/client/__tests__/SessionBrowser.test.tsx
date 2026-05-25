import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionBrowser } from "../SessionBrowser.js";
import type { PaginatedResult, SessionListItem, Session, StoredChunk } from "@kizuna/core";

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

const mockSession: SessionListItem = {
  sessionId: "session-abc123",
  projectId: "test-project",
  startedAt: "2025-05-20T10:00:00Z",
  chunkCount: 3,
  preview: "This is a session preview",
};

const mockSession2: SessionListItem = {
  sessionId: "session-def456",
  projectId: "other-project",
  startedAt: "2025-05-19T10:00:00Z",
  chunkCount: 1,
  preview: "Another session preview",
};

const mockSessions: PaginatedResult<SessionListItem> = {
  items: [mockSession, mockSession2],
  total: 2,
  page: 1,
  totalPages: 1,
  limit: 20,
};

const mockChunk: StoredChunk = {
  id: 1,
  sessionId: "session-abc123",
  projectId: "test-project",
  role: "user",
  turnIndex: 0,
  content: "User message content",
  importance: 5,
  tokenCount: 10,
  createdAt: "2025-05-20T10:00:00Z",
};

const mockChunk2: StoredChunk = {
  id: 2,
  sessionId: "session-abc123",
  projectId: "test-project",
  role: "assistant",
  turnIndex: 1,
  content: "Assistant response content",
  importance: 7,
  tokenCount: 15,
  createdAt: "2025-05-20T10:01:00Z",
};

const mockSessionDetail: Session = {
  id: "session-abc123",
  projectId: "test-project",
  startedAt: "2025-05-20T10:00:00Z",
  endedAt: "2025-05-20T11:00:00Z",
};

function defaultHandlers(
  overrides: Partial<{
    config: FetchHandler;
    sessions: FetchHandler;
    chunks: FetchHandler;
    patchChunk: FetchHandler;
    deleteChunk: FetchHandler;
  }> = {},
): FetchHandler[] {
  return [
    overrides.config ?? {
      match: (url) => url.startsWith("/api/config"),
      response: { write: false },
    },
    overrides.chunks ?? {
      match: (url) => url.includes("/chunks") && !url.startsWith("/api/chunks/"),
      response: { session: mockSessionDetail, chunks: [mockChunk, mockChunk2] },
    },
    overrides.patchChunk ?? {
      match: (url, init) => url.startsWith("/api/chunks/") && init?.method === "PATCH",
      response: { ok: true },
    },
    overrides.deleteChunk ?? {
      match: (url, init) => url.startsWith("/api/chunks/") && init?.method === "DELETE",
      response: { ok: true },
    },
    overrides.sessions ?? {
      match: (url) => url.startsWith("/api/sessions"),
      response: mockSessions,
    },
  ];
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SessionBrowser", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchByUrl(defaultHandlers()));
  });

  it("shows loading state initially", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<SessionBrowser />);
    expect(screen.getByText("Loading sessions...")).toBeInTheDocument();
  });

  it("renders session list", async () => {
    render(<SessionBrowser />);

    expect(await screen.findByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("2 sessions")).toBeInTheDocument();
    expect(screen.getByText("test-project")).toBeInTheDocument();
    expect(screen.getByText("other-project")).toBeInTheDocument();
    expect(screen.getByText("This is a session preview")).toBeInTheDocument();
    expect(screen.getByText("Another session preview")).toBeInTheDocument();
  });

  it("shows table headers", async () => {
    render(<SessionBrowser />);

    expect(await screen.findByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Chunks")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("shows empty state when no sessions", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          sessions: {
            match: (url) => url.startsWith("/api/sessions"),
            response: { items: [], total: 0, page: 1, totalPages: 0, limit: 20 },
          },
        }),
      ),
    );

    render(<SessionBrowser />);

    expect(await screen.findByText("No sessions found")).toBeInTheDocument();
  });

  it("shows error on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          sessions: {
            match: (url) => url.startsWith("/api/sessions"),
            response: {},
            ok: false,
            status: 500,
          },
        }),
      ),
    );

    render(<SessionBrowser />);

    expect(await screen.findByText(/Failed to load sessions/)).toBeInTheDocument();
  });

  it("opens session detail when a session row is clicked", async () => {
    render(<SessionBrowser />);

    // Wait for sessions to load
    await screen.findByText("test-project");

    // Click the session row
    fireEvent.click(screen.getByText("This is a session preview"));

    // Wait for detail to load
    expect(await screen.findByText("Session Detail")).toBeInTheDocument();
    expect(screen.getByText("User message content")).toBeInTheDocument();
    expect(screen.getByText("Assistant response content")).toBeInTheDocument();
  });

  it("shows role badges in chunk cards", async () => {
    render(<SessionBrowser />);

    await screen.findByText("test-project");
    fireEvent.click(screen.getByText("This is a session preview"));

    expect(await screen.findByText("user")).toBeInTheDocument();
    expect(screen.getByText("assistant")).toBeInTheDocument();
  });

  it("shows export links in session detail", async () => {
    render(<SessionBrowser />);

    await screen.findByText("test-project");
    fireEvent.click(screen.getByText("This is a session preview"));

    expect(await screen.findByText("Export JSON")).toBeInTheDocument();
    expect(screen.getByText("Export MD")).toBeInTheDocument();
  });

  it("closes session detail when close button is clicked", async () => {
    render(<SessionBrowser />);

    await screen.findByText("test-project");
    fireEvent.click(screen.getByText("This is a session preview"));

    expect(await screen.findByText("Session Detail")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByText("Session Detail")).not.toBeInTheDocument();
    });
  });

  it("toggles session detail on repeated click", async () => {
    render(<SessionBrowser />);

    await screen.findByText("test-project");

    // Click to open
    fireEvent.click(screen.getByText("This is a session preview"));
    expect(await screen.findByText("Session Detail")).toBeInTheDocument();

    // Click same session again to close
    fireEvent.click(screen.getByText("This is a session preview"));
    await waitFor(() => {
      expect(screen.queryByText("Session Detail")).not.toBeInTheDocument();
    });
  });

  it("shows error when chunk loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          chunks: {
            match: (url) => url.includes("/chunks"),
            response: {},
            ok: false,
            status: 500,
          },
        }),
      ),
    );

    render(<SessionBrowser />);

    await screen.findByText("test-project");
    fireEvent.click(screen.getByText("This is a session preview"));

    expect(await screen.findByText(/Failed to load chunks/)).toBeInTheDocument();
  });
});

describe("SessionBrowser - pagination", () => {
  it("shows pagination when multiple pages exist", async () => {
    const manySessionsPage1: PaginatedResult<SessionListItem> = {
      items: [mockSession],
      total: 40,
      page: 1,
      totalPages: 2,
      limit: 20,
    };

    vi.stubGlobal(
      "fetch",
      mockFetchByUrl([
        {
          match: (url) => url.startsWith("/api/config"),
          response: { write: false },
        },
        {
          match: (url) => url.startsWith("/api/sessions"),
          response: manySessionsPage1,
        },
      ]),
    );

    render(<SessionBrowser />);

    expect(await screen.findByText("40 sessions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("navigates to next page when Next is clicked", async () => {
    const page2Session: SessionListItem = {
      sessionId: "session-page2",
      projectId: "page2-project",
      startedAt: "2025-05-18T10:00:00Z",
      chunkCount: 2,
      preview: "Page two session preview",
    };
    const page2Response: PaginatedResult<SessionListItem> = {
      items: [page2Session],
      total: 40,
      page: 2,
      totalPages: 2,
      limit: 20,
    };

    const fetchFn = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/config")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ write: false }),
        } as Response);
      }
      if (url.includes("page=2")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(page2Response),
        } as Response);
      }
      // page=1
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [mockSession],
            total: 40,
            page: 1,
            totalPages: 2,
            limit: 20,
          }),
      } as Response);
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<SessionBrowser />);

    expect(await screen.findByText("40 sessions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Page two session preview")).toBeInTheDocument();
    expect(screen.getByText("page2-project")).toBeInTheDocument();
  });

  it("does not show pagination for single page", async () => {
    vi.stubGlobal("fetch", mockFetchByUrl(defaultHandlers()));

    render(<SessionBrowser />);

    await screen.findByText("2 sessions");
    expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });
});

describe("SessionBrowser - write mode", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl(
        defaultHandlers({
          config: {
            match: (url) => url.startsWith("/api/config"),
            response: { write: true },
          },
        }),
      ),
    );
  });

  it("shows importance slider and delete button in write mode", async () => {
    render(<SessionBrowser />);

    await screen.findByText("test-project");
    fireEvent.click(screen.getByText("This is a session preview"));

    // Wait for chunk cards with write mode controls
    expect(await screen.findByText("User message content")).toBeInTheDocument();
    // Write mode shows Save and Delete buttons
    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    expect(saveButtons.length).toBeGreaterThanOrEqual(1);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("opens delete confirmation modal", async () => {
    render(<SessionBrowser />);

    await screen.findByText("test-project");
    fireEvent.click(screen.getByText("This is a session preview"));

    // Wait for chunks to load
    await screen.findByText("User message content");

    // Click delete on first chunk
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[0]!);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete Chunk")).toBeInTheDocument();
  });

  it("saves importance change via PATCH request", async () => {
    const fetchMock = mockFetchByUrl(
      defaultHandlers({
        config: {
          match: (url) => url.startsWith("/api/config"),
          response: { write: true },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SessionBrowser />);

    await screen.findByText("test-project");
    fireEvent.click(screen.getByText("This is a session preview"));

    await screen.findByText("User message content");

    // Change importance slider
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0]!, { target: { value: "8" } });

    // Save button should now be enabled and clickable
    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    fireEvent.click(saveButtons[0]!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/chunks/1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ importance: 8 }),
        }),
      );
    });
  });

  it("deletes chunk after confirmation", async () => {
    render(<SessionBrowser />);

    await screen.findByText("test-project");
    fireEvent.click(screen.getByText("This is a session preview"));

    await screen.findByText("User message content");

    // Click delete on first chunk
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[0]!);

    // Confirm deletion in modal
    const dialog = await screen.findByRole("dialog");
    const allDeleteButtons = screen.getAllByRole("button", { name: "Delete" });
    const modalDeleteButton = allDeleteButtons.find((btn) => dialog.contains(btn));
    fireEvent.click(modalDeleteButton!);

    // The chunk should be removed
    await waitFor(() => {
      expect(screen.queryByText("User message content")).not.toBeInTheDocument();
    });
  });
});
