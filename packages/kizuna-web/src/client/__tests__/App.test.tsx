import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

/**
 * Stub fetch to return minimal valid responses for any page's initial data load.
 */
function stubFetchForAllPages() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.startsWith("/api/stats")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              databaseSizeBytes: 0,
              sessionCount: 0,
              chunkCount: 0,
              oldestChunkDate: null,
              newestChunkDate: null,
              lastMaintenanceAt: null,
              projectDistribution: [],
            }),
        } as Response);
      }

      if (url.startsWith("/api/config")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ write: false }),
        } as Response);
      }

      if (url.startsWith("/api/sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [],
              total: 0,
              page: 1,
              totalPages: 0,
              limit: 20,
            }),
        } as Response);
      }

      if (url.startsWith("/api/reports")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ reports: [], total: 0 }),
        } as Response);
      }

      if (url.startsWith("/api/search")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [], query: "" }),
        } as Response);
      }

      return Promise.reject(new Error(`Unmocked: ${url}`));
    }),
  );
}

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "";
    stubFetchForAllPages();
  });

  it("renders the nav bar with all links", async () => {
    render(<App />);

    expect(screen.getByText("Kizuna")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Analysis")).toBeInTheDocument();
  });

  it("defaults to dashboard page", async () => {
    render(<App />);

    expect(await screen.findByText("Kizuna Dashboard")).toBeInTheDocument();
  });

  it("navigates to sessions page via hash", async () => {
    window.location.hash = "#sessions";
    render(<App />);

    // SessionBrowser shows "Sessions" heading when loaded
    // Wait for async content
    expect(await screen.findByText("No sessions found")).toBeInTheDocument();
  });

  it("navigates to search page via hash", async () => {
    window.location.hash = "#search";
    render(<App />);

    // The Search page heading
    expect(await screen.findByText("Enter a query to search memories")).toBeInTheDocument();
  });

  it("navigates to analysis page via hash", async () => {
    window.location.hash = "#analysis";
    render(<App />);

    expect(await screen.findByText("Workflow Analysis")).toBeInTheDocument();
  });

  it("responds to hashchange events", async () => {
    render(<App />);

    // Start at dashboard
    expect(await screen.findByText("Kizuna Dashboard")).toBeInTheDocument();

    // Navigate to search
    window.location.hash = "#search";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(await screen.findByText("Enter a query to search memories")).toBeInTheDocument();
  });
});
