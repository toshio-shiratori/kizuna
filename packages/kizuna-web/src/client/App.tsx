import { useState, useEffect } from "react";
import { Dashboard } from "./Dashboard.js";
import { SessionBrowser } from "./SessionBrowser.js";

type Page = "dashboard" | "sessions";

function getPageFromHash(): Page {
  return window.location.hash === "#sessions" ? "sessions" : "dashboard";
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
        </div>
      </nav>
      {page === "dashboard" ? <Dashboard /> : <SessionBrowser />}
    </div>
  );
}
