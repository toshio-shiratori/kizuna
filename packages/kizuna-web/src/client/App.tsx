import { useState, useEffect } from "react";
import { Dashboard } from "./Dashboard.js";
import { SessionBrowser } from "./SessionBrowser.js";
import { Search } from "./Search.js";
import { Analysis } from "./Analysis.js";

type Page = "dashboard" | "sessions" | "search" | "analysis";

function getPageFromHash(): Page {
  const hash = window.location.hash;
  if (hash === "#sessions") return "sessions";
  if (hash === "#search") return "search";
  if (hash === "#analysis") return "analysis";
  return "dashboard";
}

export function App() {
  const [page, setPage] = useState<Page>(getPageFromHash);

  useEffect(() => {
    const onHash = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <nav className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-text-primary">Kizuna</span>
          <a
            href="#dashboard"
            className={`text-sm ${page === "dashboard" ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}
          >
            Dashboard
          </a>
          <a
            href="#sessions"
            className={`text-sm ${page === "sessions" ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}
          >
            Sessions
          </a>
          <a
            href="#search"
            className={`text-sm ${page === "search" ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}
          >
            Search
          </a>
          <a
            href="#analysis"
            className={`text-sm ${page === "analysis" ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}
          >
            Analysis
          </a>
        </div>
      </nav>
      {page === "dashboard" && <Dashboard />}
      {page === "sessions" && <SessionBrowser />}
      {page === "search" && <Search />}
      {page === "analysis" && <Analysis />}
    </div>
  );
}
