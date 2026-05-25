import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Search } from "../Search.js";
import type { SearchResult } from "@kizuna/core";

function makeSearchResult(overrides: Partial<SearchResult["chunk"]> = {}): SearchResult {
  return {
    score: 0.85,
    chunk: {
      id: 1,
      sessionId: "session-abc123def456",
      projectId: "test-project",
      role: "assistant",
      turnIndex: 0,
      content: "This is a test chunk with some searchable content",
      importance: 5,
      tokenCount: 20,
      createdAt: "2025-03-15T10:00:00Z",
      ...overrides,
    },
  };
}

function stubSearchFetch(results: SearchResult[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results,
            query: "test",
          }),
      } as Response),
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Search", () => {
  beforeEach(() => {
    stubSearchFetch();
  });

  it("shows initial prompt when no search has been performed", () => {
    render(<Search />);

    expect(screen.getByText("Enter a query to search memories")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search memories...")).toBeInTheDocument();
  });

  it("shows search button", () => {
    render(<Search />);

    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("performs search on form submit", async () => {
    const results = [makeSearchResult()];
    stubSearchFetch(results);

    render(<Search />);

    const input = screen.getByPlaceholderText("Search memories...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);

    expect(await screen.findByText("1 result")).toBeInTheDocument();
  });

  it("shows search results with score and content", async () => {
    const results = [
      makeSearchResult({ content: "Found relevant content here" }),
      makeSearchResult({
        id: 2,
        content: "Another result with different content",
        role: "user",
      }),
    ];
    stubSearchFetch(results);

    render(<Search />);

    const input = screen.getByPlaceholderText("Search memories...");
    fireEvent.change(input, { target: { value: "content" } });
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);

    expect(await screen.findByText("2 results")).toBeInTheDocument();
    expect(screen.getAllByText("0.85")).toHaveLength(2);
  });

  it("shows no results message when search returns empty", async () => {
    stubSearchFetch([]);

    render(<Search />);

    const input = screen.getByPlaceholderText("Search memories...");
    fireEvent.change(input, { target: { value: "nonexistent" } });
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);

    expect(await screen.findByText("No results found")).toBeInTheDocument();
  });

  it("shows error on search failure", async () => {
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

    render(<Search />);

    const input = screen.getByPlaceholderText("Search memories...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);

    expect(await screen.findByText(/Search failed/)).toBeInTheDocument();
  });

  it("shows export buttons when results exist", async () => {
    const results = [makeSearchResult()];
    stubSearchFetch(results);

    render(<Search />);

    const input = screen.getByPlaceholderText("Search memories...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);

    expect(await screen.findByText("Export JSON")).toBeInTheDocument();
    expect(screen.getByText("Export MD")).toBeInTheDocument();
  });

  it("triggers search with debounce on typing", async () => {
    const results = [makeSearchResult()];
    stubSearchFetch(results);

    render(<Search />);

    const input = screen.getByPlaceholderText("Search memories...");
    fireEvent.change(input, { target: { value: "debounced query" } });

    // After debounce, results should appear
    expect(await screen.findByText("1 result", {}, { timeout: 1000 })).toBeInTheDocument();
  });

  it("clears results when query is emptied", async () => {
    const results = [makeSearchResult()];
    stubSearchFetch(results);

    render(<Search />);

    const input = screen.getByPlaceholderText("Search memories...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);

    expect(await screen.findByText("1 result")).toBeInTheDocument();

    // Clear input
    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByText("Enter a query to search memories")).toBeInTheDocument();
    });
  });

  it("shows loading state during search", async () => {
    // Fetch that never resolves for the search
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    render(<Search />);

    const input = screen.getByPlaceholderText("Search memories...");
    fireEvent.change(input, { target: { value: "loading test" } });
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);

    expect(await screen.findByText("Searching...")).toBeInTheDocument();
  });
});
