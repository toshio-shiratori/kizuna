import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analysis } from "../Analysis.js";

const mockStats = {
  databaseSizeBytes: 1024,
  sessionCount: 10,
  chunkCount: 100,
  oldestChunkDate: null,
  newestChunkDate: null,
  lastMaintenanceAt: null,
  projectDistribution: [
    { projectId: "project-alpha", chunkCount: 60 },
    { projectId: "project-beta", chunkCount: 40 },
  ],
};

const mockReport = {
  project: "project-alpha",
  analyzedSessions: 10,
  findings: [
    {
      pattern: "large-turns",
      patternLabel: "Large Turns",
      severity: "critical" as const,
      description: "Some sessions have very large turns",
      sessionIds: ["session-1", "session-2"],
      suggestion: "Break large turns into smaller chunks",
      count: 5,
    },
    {
      pattern: "repeated-errors",
      patternLabel: "Repeated Errors",
      severity: "warning" as const,
      description: "Repeated error patterns detected",
      sessionIds: ["session-3"],
      suggestion: "Fix the underlying issues",
      count: 3,
    },
    {
      pattern: "short-sessions",
      patternLabel: "Short Sessions",
      severity: "info" as const,
      description: "Several very short sessions",
      sessionIds: [],
      suggestion: "Consider batching related tasks",
      count: 2,
    },
  ],
  summary: {
    totalFindings: 10,
    bySeverity: { critical: 5, warning: 3, info: 2 },
    byPattern: { "large-turns": 5, "repeated-errors": 3, "short-sessions": 2 },
  },
};

function stubFetch(
  statsResponse?: unknown,
  analysisResponse?: unknown,
  statsOk = true,
  analysisOk = true,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.startsWith("/api/stats")) {
        return Promise.resolve({
          ok: statsOk,
          status: statsOk ? 200 : 500,
          json: () => Promise.resolve(statsResponse ?? mockStats),
        } as Response);
      }

      if (url.startsWith("/api/analysis")) {
        return Promise.resolve({
          ok: analysisOk,
          status: analysisOk ? 200 : 500,
          json: () => Promise.resolve(analysisResponse ?? mockReport),
        } as Response);
      }

      return Promise.reject(new Error(`Unmocked: ${url}`));
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Analysis", () => {
  beforeEach(() => {
    stubFetch();
  });

  it("shows loading state initially", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<Analysis />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders project selector with projects from stats", async () => {
    render(<Analysis />);

    expect(await screen.findByText("Workflow Analysis")).toBeInTheDocument();
    const select = screen.getByLabelText("Project") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe("project-alpha");
  });

  it("shows initial prompt before analysis", async () => {
    render(<Analysis />);

    expect(await screen.findByText("Select a project and click Analyze")).toBeInTheDocument();
  });

  it("shows analyze button", async () => {
    render(<Analysis />);

    expect(await screen.findByRole("button", { name: "Analyze" })).toBeInTheDocument();
  });

  it("performs analysis and shows findings", async () => {
    render(<Analysis />);

    const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
    fireEvent.click(analyzeButton);

    expect(await screen.findByText("Sessions Analyzed")).toBeInTheDocument();
    expect(screen.getByText("Total Findings")).toBeInTheDocument();
    expect(screen.getByText("Large Turns")).toBeInTheDocument();
    expect(screen.getByText("Repeated Errors")).toBeInTheDocument();
    expect(screen.getByText("Short Sessions")).toBeInTheDocument();
  });

  it("shows severity badges", async () => {
    render(<Analysis />);

    const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
    fireEvent.click(analyzeButton);

    // "Critical" appears in both the SummaryCard heading and the SeverityBadge
    expect(await screen.findAllByText("Critical")).toHaveLength(2);
    // "Warning" appears as SeverityBadge; "Warnings" in SummaryCard title
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Info")).toBeInTheDocument();
  });

  it("shows finding suggestions", async () => {
    render(<Analysis />);

    const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
    fireEvent.click(analyzeButton);

    expect(await screen.findByText("Break large turns into smaller chunks")).toBeInTheDocument();
    expect(screen.getByText("Fix the underlying issues")).toBeInTheDocument();
  });

  it("expands affected sessions on click", async () => {
    render(<Analysis />);

    const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
    fireEvent.click(analyzeButton);

    const showButton = await screen.findByText("Show affected sessions (2)");
    fireEvent.click(showButton);

    expect(screen.getByText("session-1")).toBeInTheDocument();
    expect(screen.getByText("session-2")).toBeInTheDocument();
  });

  it("shows error when stats fetch fails", async () => {
    stubFetch(undefined, undefined, false);

    render(<Analysis />);

    expect(await screen.findByText("Workflow Analysis")).toBeInTheDocument();
    // When stats fails, the error is set
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });

  it("shows error when analysis fetch fails", async () => {
    stubFetch(mockStats, undefined, true, false);

    render(<Analysis />);

    const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
    fireEvent.click(analyzeButton);

    expect(await screen.findByText(/Analysis failed/)).toBeInTheDocument();
  });

  it("shows 'No projects found' when there are no projects", async () => {
    stubFetch({
      ...mockStats,
      projectDistribution: [],
    });

    render(<Analysis />);

    expect(await screen.findByText("No projects found")).toBeInTheDocument();
  });

  it("shows 'No issues found' when analysis returns empty findings", async () => {
    const emptyReport = {
      ...mockReport,
      findings: [],
      summary: {
        totalFindings: 0,
        bySeverity: { critical: 0, warning: 0, info: 0 },
        byPattern: {},
      },
    };
    stubFetch(mockStats, emptyReport);

    render(<Analysis />);

    const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
    fireEvent.click(analyzeButton);

    expect(await screen.findByText("No issues found")).toBeInTheDocument();
  });
});
