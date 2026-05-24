import { useState, useEffect, useRef, type ReactNode } from "react";
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

function highlightMatches(content: string, query: string): ReactNode[] {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return [content];

  // Sort by length descending so longer terms match first (e.g. "JavaScript" before "Java")
  const escaped = terms
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = content.split(pattern);

  return parts.map((part, i) => {
    if (pattern.test(part)) {
      // Reset lastIndex since we're using 'g' flag
      pattern.lastIndex = 0;
      return <mark key={i}>{part}</mark>;
    }
    return part;
  });
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

function truncateContent(content: string, maxLength: number = 500): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "...";
}

function SearchResultCard({ result, query }: { result: SearchResult; query: string }) {
  const chunk: StoredChunk = result.chunk;
  const preview = truncateContent(chunk.content);

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
        setResults(data.results);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
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
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Search</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories..."
            className="flex-1 rounded-lg border border-border bg-bg-surface px-4 py-2 text-text-primary placeholder-text-secondary outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-lg border border-accent bg-accent/20 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30"
          >
            Search
          </button>
        </div>
      </form>

      {loading && <div className="py-4 text-center text-text-secondary">Searching...</div>}

      {error && <div className="py-4 text-center text-red-400">Search failed: {error}</div>}

      {!loading && !error && searched && results.length === 0 && (
        <div className="rounded-lg border border-border bg-bg-surface p-8 text-center">
          <p className="text-lg text-text-secondary">No results found</p>
          <p className="mt-2 text-sm text-text-secondary">
            Try different keywords or a broader query.
          </p>
        </div>
      )}

      {!loading && !error && !searched && (
        <div className="rounded-lg border border-border bg-bg-surface p-8 text-center">
          <p className="text-lg text-text-secondary">Enter a query to search memories</p>
          <p className="mt-2 text-sm text-text-secondary">
            Search supports English and Japanese (CJK) text.
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div>
          <p className="mb-4 text-sm text-text-secondary">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
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
