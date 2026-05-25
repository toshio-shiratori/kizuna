import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "../Dashboard.js";
import type { DatabaseStats } from "@kizuna/core";

const mockStats: DatabaseStats = {
  databaseSizeBytes: 1048576, // 1 MB
  sessionCount: 42,
  chunkCount: 1234,
  oldestChunkDate: "2025-01-15T10:00:00Z",
  newestChunkDate: "2025-05-20T18:30:00Z",
  lastMaintenanceAt: "2025-05-19T12:00:00Z",
  projectDistribution: [
    { projectId: "project-alpha", chunkCount: 800 },
    { projectId: "project-beta", chunkCount: 434 },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Dashboard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStats),
        } as Response),
      ),
    );
  });

  it("shows loading state initially", () => {
    // Use a fetch that never resolves
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<Dashboard />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders stats after successful fetch", async () => {
    render(<Dashboard />);

    expect(await screen.findByText("Kizuna Dashboard")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("project-alpha")).toBeInTheDocument();
    expect(screen.getByText("project-beta")).toBeInTheDocument();
  });

  it("shows error message on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as Response),
      ),
    );

    render(<Dashboard />);

    expect(await screen.findByText(/Failed to load stats/)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });

  it("shows error message on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Network error"))),
    );

    render(<Dashboard />);

    expect(await screen.findByText(/Failed to load stats/)).toBeInTheDocument();
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it("renders 'No data' when date range is missing", async () => {
    const statsWithoutDates: DatabaseStats = {
      ...mockStats,
      oldestChunkDate: null,
      newestChunkDate: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(statsWithoutDates),
        } as Response),
      ),
    );

    render(<Dashboard />);

    expect(await screen.findByText("Kizuna Dashboard")).toBeInTheDocument();
    // "No data" appears for Date Range and possibly Projects
    const noDataElements = screen.getAllByText("No data");
    expect(noDataElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'Never' when no maintenance has run", async () => {
    const statsNoMaintenance: DatabaseStats = {
      ...mockStats,
      lastMaintenanceAt: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(statsNoMaintenance),
        } as Response),
      ),
    );

    render(<Dashboard />);

    expect(await screen.findByText("Never")).toBeInTheDocument();
  });

  it("renders 'No data' for empty project distribution", async () => {
    const statsNoProjects: DatabaseStats = {
      ...mockStats,
      projectDistribution: [],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(statsNoProjects),
        } as Response),
      ),
    );

    render(<Dashboard />);

    expect(await screen.findByText("Kizuna Dashboard")).toBeInTheDocument();
    const noDataElements = screen.getAllByText("No data");
    expect(noDataElements.length).toBeGreaterThanOrEqual(1);
  });
});
