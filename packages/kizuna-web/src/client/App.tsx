import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dashboard } from "./Dashboard.js";
import { SessionBrowser } from "./SessionBrowser.js";
import { Search } from "./Search.js";
import { Analysis } from "./Analysis.js";
import { supportedLanguages } from "./i18n.js";

type Page = "dashboard" | "sessions" | "search" | "analysis";

function getPageFromHash(): Page {
  const hash = window.location.hash;
  if (hash === "#sessions") return "sessions";
  if (hash === "#search") return "search";
  if (hash === "#analysis") return "analysis";
  return "dashboard";
}

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      aria-label={t("language.label")}
      className="rounded border border-border bg-bg px-2 py-1 text-xs text-text-secondary outline-none hover:border-accent focus:border-accent"
    >
      {supportedLanguages.map((lng) => (
        <option key={lng} value={lng}>
          {lng.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

export function App() {
  const [page, setPage] = useState<Page>(getPageFromHash);
  const { t } = useTranslation();

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
            {t("nav.dashboard")}
          </a>
          <a
            href="#sessions"
            className={`text-sm ${page === "sessions" ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}
          >
            {t("nav.sessions")}
          </a>
          <a
            href="#search"
            className={`text-sm ${page === "search" ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}
          >
            {t("nav.search")}
          </a>
          <a
            href="#analysis"
            className={`text-sm ${page === "analysis" ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}
          >
            {t("nav.analysis")}
          </a>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </nav>
      {page === "dashboard" && <Dashboard />}
      {page === "sessions" && <SessionBrowser />}
      {page === "search" && <Search />}
      {page === "analysis" && <Analysis />}
    </div>
  );
}
