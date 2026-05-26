import { useState, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SearchResult, StoredChunk } from "@kizuna/core";

function isCJKChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return (
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

function extractSearchTerms(query: string): string[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const terms: string[] = [];
  let current = "";
  let currentIsCJK: boolean | null = null;

  for (const char of trimmed) {
    const charIsCJK = isCJKChar(char);
    if (currentIsCJK !== null && charIsCJK !== currentIsCJK) {
      if (!currentIsCJK) {
        // Non-CJK segment: split by whitespace
        for (const word of current.trim().split(/\s+/)) {
          if (word.length > 0) terms.push(word);
        }
      } else {
        // CJK segment: each character is a term
        for (const ch of current) {
          terms.push(ch);
        }
      }
      current = "";
    }
    current += char;
    currentIsCJK = charIsCJK;
  }

  // Flush remaining
  if (current.length > 0 && currentIsCJK !== null) {
    if (!currentIsCJK) {
      for (const word of current.trim().split(/\s+/)) {
        if (word.length > 0) terms.push(word);
      }
    } else {
      for (const ch of current) {
        terms.push(ch);
      }
    }
  }

  return terms;
}

function buildMatchPattern(query: string): RegExp | null {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return null;
  const escaped = terms
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(${escaped.join("|")})`, "gi");
}

function highlightMatches(content: string, query: string): ReactNode[] {
  const pattern = buildMatchPattern(query);
  if (!pattern) return [content];
  const parts = content.split(pattern);

  // split(/(capture)/) places matches at odd indices
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RoleBadge({ role }: { role: "user" | "assistant" }) {
  const cls =
    role === "user"
      ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
      : "bg-green-500/20 text-green-300 border-green-500/30";
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {role}
    </span>
  );
}

function truncateAroundMatch(content: string, query: string, maxLength: number = 500): string {
  if (content.length <= maxLength) return content;

  const pattern = buildMatchPattern(query);
  if (!pattern) return content.slice(0, maxLength) + "...";

  const match = pattern.exec(content);
  if (!match || match.index < maxLength) {
    return content.slice(0, maxLength) + "...";
  }

  const center = match.index;
  const half = Math.floor(maxLength / 2);
  const start = Math.max(0, center - half);
  const end = Math.min(content.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return prefix + content.slice(start, end) + suffix;
}

function SearchResultCard({ result, query }: { result: SearchResult; query: string }) {
  const chunk: StoredChunk = result.chunk;
  const preview = truncateAroundMatch(chunk.content, query);

  return (
    <div className="rounded-lg border border-border bg-bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <span className="rounded bg-accent/20 px-2 py-0.5 font-mono text-accent">
          {result.score.toFixed(2)}
        </span>
        <RoleBadge role={chunk.role} />
        <span className="font-mono">{chunk.sessionId.slice(0, 12)}...</span>
        <span>{formatDate(chunk.createdAt)}</span>
      </div>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-sm text-text-primary">
        {highlightMatches(preview, query)}
      </pre>
    </div>
  );
}

interface SearchApiResponse {
  results: SearchResult[];
  query: string;
}

export function Search() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const { t } = useTranslation();

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setSubmittedQuery("");
      setSearched(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(trimmed);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  function performSearch(q: string) {
    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setSearched(true);
    setSubmittedQuery(q);

    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SearchApiResponse>;
      })
      .then((data) => {
        if (id !== requestIdRef.current) return;
        setResults(data.results);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (id !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : t("common.unknownError"));
        setLoading(false);
      });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    performSearch(trimmed);
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">{t("search.title")}</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1 rounded-lg border border-border bg-bg-surface px-4 py-2 text-text-primary placeholder-text-secondary outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-lg border border-accent bg-accent/20 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30"
          >
            {t("search.searchButton")}
          </button>
        </div>
      </form>

      {loading && (
        <div className="py-4 text-center text-text-secondary">{t("search.searching")}</div>
      )}

      {error && (
        <div className="py-4 text-center text-red-400">{t("search.searchFailed", { error })}</div>
      )}

      {!loading && !error && searched && results.length === 0 && (
        <div className="rounded-lg border border-border bg-bg-surface p-8 text-center">
          <p className="text-lg text-text-secondary">{t("search.noResults")}</p>
          <p className="mt-2 text-sm text-text-secondary">{t("search.noResultsHint")}</p>
        </div>
      )}

      {!loading && !error && !searched && (
        <div className="rounded-lg border border-border bg-bg-surface p-8 text-center">
          <p className="text-lg text-text-secondary">{t("search.initialPrompt")}</p>
          <p className="mt-2 text-sm text-text-secondary">{t("search.initialHint")}</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-text-secondary">
              {t("search.resultCount", { count: results.length })}
            </p>
            <div className="flex items-center gap-2">
              <a
                href={`/api/export/search?q=${encodeURIComponent(submittedQuery)}&format=json`}
                className="rounded border border-border px-3 py-1 text-sm text-text-secondary hover:bg-border hover:text-text-primary"
                download
              >
                {t("common.exportJson")}
              </a>
              <a
                href={`/api/export/search?q=${encodeURIComponent(submittedQuery)}&format=markdown`}
                className="rounded border border-border px-3 py-1 text-sm text-text-secondary hover:bg-border hover:text-text-primary"
                download
              >
                {t("common.exportMd")}
              </a>
            </div>
          </div>
          <div className="space-y-3">
            {results.map((result) => (
              <SearchResultCard key={result.chunk.id} result={result} query={submittedQuery} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
