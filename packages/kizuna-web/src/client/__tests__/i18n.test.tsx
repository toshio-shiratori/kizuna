import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18n from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.js";
import { Analysis } from "../Analysis.js";

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
              projectDistribution: [{ projectId: "test-project", chunkCount: 10 }],
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

      if (url.startsWith("/api/telepathy/references")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ references: [] }),
        } as Response);
      }

      if (url.startsWith("/api/telepathy/receive")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ messages: [] }),
        } as Response);
      }

      if (url.startsWith("/api/search")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [], query: "" }),
        } as Response);
      }

      if (url.startsWith("/api/analysis")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              project: "test-project",
              analyzedSessions: 5,
              findings: [
                {
                  pattern: "long-sessions",
                  severity: "critical",
                  descriptionKey: "analysis.descriptions.longSessions.chunks",
                  descriptionParams: { chunkCount: 80, threshold: 50 },
                  sessionIds: ["s-1", "s-2"],
                  suggestionKey: "analysis.suggestions.longSessions.chunks",
                  count: 3,
                },
              ],
              summary: {
                totalFindings: 3,
                bySeverity: { critical: 3, warning: 0, info: 0 },
                byPattern: { "long-sessions": 3 },
              },
            }),
        } as Response);
      }

      return Promise.reject(new Error(`Unmocked: ${url}`));
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
  // Reset language to English after each test
  i18n.changeLanguage("en");
});

describe("i18n", () => {
  beforeEach(() => {
    window.location.hash = "";
    stubFetchForAllPages();
  });

  describe("LanguageSwitcher", () => {
    it("renders a language select element with accessible label", async () => {
      render(<App />);

      const select = screen.getByRole("combobox", { name: "Language" });
      expect(select).toBeInTheDocument();
    });

    it("has EN and JA options", async () => {
      render(<App />);

      const select = screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement;
      const options = select.querySelectorAll("option");
      expect(options).toHaveLength(2);
      expect(options[0]!.value).toBe("en");
      expect(options[0]!.textContent).toBe("EN");
      expect(options[1]!.value).toBe("ja");
      expect(options[1]!.textContent).toBe("JA");
    });

    it("defaults to English", async () => {
      render(<App />);

      const select = screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement;
      expect(select.value).toBe("en");
    });

    it("switches to Japanese when JA is selected", async () => {
      render(<App />);

      // Verify English nav items
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Sessions")).toBeInTheDocument();

      // Switch to Japanese
      const select = screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: "ja" } });
      });

      // Nav items should now be in Japanese
      const nav = screen.getByRole("navigation");
      expect(nav).toHaveTextContent("ダッシュボード");
      expect(nav).toHaveTextContent("セッション");
      expect(nav).toHaveTextContent("検索");
      expect(nav).toHaveTextContent("分析");
      expect(nav).toHaveTextContent("テレパシー");
    });

    it("updates aria-label when language changes", async () => {
      render(<App />);

      const select = screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: "ja" } });
      });

      // aria-label should now be Japanese
      expect(screen.getByRole("combobox", { name: "言語" })).toBeInTheDocument();
    });
  });

  describe("Japanese language rendering", () => {
    it("renders dashboard title in Japanese", async () => {
      await act(async () => {
        await i18n.changeLanguage("ja");
      });
      render(<App />);

      expect(await screen.findByText("Kizuna Dashboard")).toBeInTheDocument();
    });

    it("renders search page in Japanese", async () => {
      window.location.hash = "#search";
      await act(async () => {
        await i18n.changeLanguage("ja");
      });
      render(<App />);

      expect(await screen.findByPlaceholderText("メモリを検索...")).toBeInTheDocument();
      expect(screen.getByText("クエリを入力してメモリを検索")).toBeInTheDocument();
    });
  });

  describe("findingSummary pluralization", () => {
    it("uses singular form for 1 session in English", async () => {
      const mockStatsWithProject = {
        databaseSizeBytes: 0,
        sessionCount: 1,
        chunkCount: 5,
        oldestChunkDate: null,
        newestChunkDate: null,
        lastMaintenanceAt: null,
        projectDistribution: [{ projectId: "test-project", chunkCount: 5 }],
      };

      const mockReportSingleSession = {
        project: "test-project",
        analyzedSessions: 1,
        findings: [
          {
            pattern: "test-fix-loop",
            severity: "warning" as const,
            descriptionKey: "analysis.descriptions.testFixLoop",
            descriptionParams: { cycles: 4 },
            sessionIds: ["session-1"],
            suggestionKey: "analysis.suggestions.testFixLoop",
            count: 4,
          },
        ],
        summary: {
          totalFindings: 4,
          bySeverity: { critical: 0, warning: 4, info: 0 },
          byPattern: { "test-fix-loop": 4 },
        },
      };

      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo) => {
          const url = typeof input === "string" ? input : input.url;
          if (url.startsWith("/api/stats")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve(mockStatsWithProject),
            } as Response);
          }
          if (url.startsWith("/api/analysis")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve(mockReportSingleSession),
            } as Response);
          }
          return Promise.reject(new Error(`Unmocked: ${url}`));
        }),
      );

      render(<Analysis />);

      const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
      fireEvent.click(analyzeButton);

      // Should use singular "session" for count=1
      expect(await screen.findByText("4x | 1 session")).toBeInTheDocument();
    });

    it("uses plural form for multiple sessions in English", async () => {
      render(<Analysis />);

      const analyzeButton = await screen.findByRole("button", { name: "Analyze" });
      fireEvent.click(analyzeButton);

      // The mock has count=3, sessionIds.length=2, so "3x | 2 sessions"
      expect(await screen.findByText("3x | 2 sessions")).toBeInTheDocument();
    });

    it("uses Japanese format for finding summary", async () => {
      await act(async () => {
        await i18n.changeLanguage("ja");
      });

      render(<Analysis />);

      const analyzeButton = await screen.findByRole("button", {
        name: "分析",
      });
      fireEvent.click(analyzeButton);

      // Japanese format: "3回 | 2 セッション"
      expect(await screen.findByText("3回 | 2 セッション")).toBeInTheDocument();
    });
  });
});
