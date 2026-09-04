import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import { resolveSearchNavigation } from "~/lib/search-navigation";
import type { DashboardMode } from "~/lib/dashboard-mode";

export function TopbarSearch({ mode }: { mode: DashboardMode }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function submitSearch() {
    const query = inputRef.current?.value ?? "";
    navigate(resolveSearchNavigation(mode, query));
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="topbar-search-wrap">
      <label className="topbar-search">
        <span className="topbar-search-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path
              d="M20 20l-3.5-3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          name="q"
          placeholder={
            mode === "pos"
              ? "Search parts, job cards, SKUs..."
              : "Search parts, documents, SKUs..."
          }
          aria-label="Search"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submitSearch();
          }}
        />
        <kbd className="topbar-search-hint" aria-hidden="true">
          ⌘K
        </kbd>
      </label>
      <button
        type="button"
        className="topbar-search-submit"
        aria-label="Search"
        onClick={submitSearch}
      >
        Search
      </button>
    </div>
  );
}
