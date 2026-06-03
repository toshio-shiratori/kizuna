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
      pattern: "long-sessions",
      severity: "critical" as const,
      descriptionKey: "analysis.descriptions.longSessions.chunks",
      descriptionParams: { chunkCount: 80, threshold: 50 },
      sessionIds: ["session-1", "session-2"],
      suggestionKey: "analysis.suggestions.longSessions.chunks",
      count: 5,
    },
    {
      pattern: "repeated-errors",
      severity: "warning" as const,
      descriptionKey: "analysis.descriptions.repeatedErrors",
      descriptionParams: { sessionCount: 3, error: "TypeError: undefined" },
      sessionIds: ["session-3"],
      suggestionKey: "analysis.suggestions.repeatedErrors",
      count: 3,
    },
    {
      pattern: "test-fix-loop",
      severity: "info" as const,
      descriptionKey: "analysis.descriptions.testFixLoop",
      descriptionParams: { cycles: 4 },
      sessionIds: [],
      suggestionKey: "analysis.suggestions.testFixLoop",
      count: 2,
    },
  ],
  summary: {
    totalFindings: 10,
    bySeverity: { critical: 5, warning: 3, info: 2 },
    byPattern: { "long-sessions": 5, "repeated-errors": 3, "test-fix-loop": 2 },
  },
};

interface StubOptions {
  statsResponse?: unknown;
  analysisResponse?: unknown;
  statsOk?: boolean;
  analysisOk?: boolean;
  write?: boolean;
  reportsOk?: boolean;
  reportsError?: string;
}

function stubFetch(options: StubOptions = {}) {
  const {
    statsResponse,
    analysisResponse,
    statsOk = true,
    analysisOk = true,
    write = false,
    reportsOk = true,
    reportsError = "Write mode is not enabled",
  } = options;

  const reportsHandler = vi.fn((init?: RequestInit): Promise<Response> => {
    if (reportsOk) {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 1, status: "unread", init }),
      } as Response);
    }
    return Promise.resolve({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: reportsError }),
    } as Response);
  });

  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;

    if (url.startsWith("/api/config")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ write }),
      } as Response);
    }

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

    if (url.startsWith("/api/reports")) {
      return reportsHandler(init);
    }

    return Promise.reject(new Error(`Unmocked: ${url}`));
  });

  vi.stubGlobal("fetch", fetchMock);

  return { fetchMock, reportsHandler };
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
    expect(screen.getByText("Long Sessions")).toBeInTheDocument();
    expect(screen.getByText("Repeated Errors")).toBeInTheDocument();
    expect(screen.getByText("Test-Fix Loop")).toBeInTheDocument();
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

    expect(await screen.findByText(/Long sessions often indicate difficulty/)).toBeInTheDocument();
    expect(screen.getByText(/This error recurs across sessions/)).toBeInTheDocument();
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
    stubFetch({ statsOk: false });

    render(<Analysis />);

    expect(await screen.findByText("Workflow Analysis")).toBeInTheDocument();
    // When stats fails, the error is set
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });

  it("shows error when analysis fetch fails", async () => {
    stubFetch({ analysisOk: false });

    render(<Analysis />);

    const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
    fireEvent.click(analyzeButton);

    expect(await screen.findByText(/Analysis failed/)).toBeInTheDocument();
  });

  it("shows 'No projects found' when there are no projects", async () => {
    stubFetch({
      statsResponse: {
        ...mockStats,
        projectDistribution: [],
      },
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
    stubFetch({ analysisResponse: emptyReport });

    render(<Analysis />);

    const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
    fireEvent.click(analyzeButton);

    expect(await screen.findByText("No issues found")).toBeInTheDocument();
  });

  describe("save report", () => {
    it("disables save button in read-only mode", async () => {
      stubFetch({ write: false });

      render(<Analysis />);

      const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
      fireEvent.click(analyzeButton);

      const saveButton = await screen.findByRole("button", { name: "Save as Report" });
      expect(saveButton).toBeDisabled();
      expect(screen.getByText("Saving is disabled in read-only mode")).toBeInTheDocument();
    });

    it("enables save button in write mode", async () => {
      stubFetch({ write: true });

      render(<Analysis />);

      const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
      fireEvent.click(analyzeButton);

      const saveButton = await screen.findByRole("button", { name: "Save as Report" });
      expect(saveButton).toBeEnabled();
    });

    it("posts the report and shows success feedback", async () => {
      const { reportsHandler } = stubFetch({ write: true });

      render(<Analysis />);

      const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
      fireEvent.click(analyzeButton);

      const saveButton = await screen.findByRole("button", { name: "Save as Report" });
      fireEvent.click(saveButton);

      expect(await screen.findByText("Saved as report")).toBeInTheDocument();

      expect(reportsHandler).toHaveBeenCalledTimes(1);
      const init = reportsHandler.mock.calls[0]![0]!;
      expect(init.method).toBe("POST");
      const payload = JSON.parse(init.body as string) as {
        type: string;
        source: string;
        title: string;
        content: string;
      };
      expect(payload.type).toBe("analysis");
      expect(payload.source).toBe("webui");
      expect(payload.title).toBe("Workflow Analysis: project-alpha (10 findings)");
      expect(payload.content).toContain("Long Sessions");
      expect(payload.content).toContain("Long sessions often indicate difficulty");
    });

    it("disables the save button after a successful save to prevent duplicates", async () => {
      const { reportsHandler } = stubFetch({ write: true });

      render(<Analysis />);

      const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
      fireEvent.click(analyzeButton);

      const saveButton = await screen.findByRole("button", { name: "Save as Report" });
      fireEvent.click(saveButton);

      expect(await screen.findByText("Saved as report")).toBeInTheDocument();
      expect(saveButton).toBeDisabled();

      // A second click must not trigger another POST.
      fireEvent.click(saveButton);
      expect(reportsHandler).toHaveBeenCalledTimes(1);
    });

    it("shows failure feedback when save returns an error", async () => {
      stubFetch({ write: true, reportsOk: false, reportsError: "Write mode is not enabled" });

      render(<Analysis />);

      const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
      fireEvent.click(analyzeButton);

      const saveButton = await screen.findByRole("button", { name: "Save as Report" });
      fireEvent.click(saveButton);

      expect(await screen.findByText(/Save failed/)).toBeInTheDocument();
    });
  });
});
