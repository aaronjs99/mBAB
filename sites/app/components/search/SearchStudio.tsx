"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { BOOK_GROUPS, VERSIONS } from "@/app/search/catalog";
import { applyTheme, readInitialBrowserState, storeSavedVerses } from "@/app/search/browser-storage";
import { searchParamsFor } from "@/app/search/search-location";
import { useSearchSession } from "@/app/search/use-search-session";
import type { SearchExample, SearchMode, SearchResult } from "@/app/search/types";
import { HowItWorks } from "./HowItWorks";
import { SavedTray } from "./SavedTray";
import { SearchForm } from "./SearchForm";
import { SearchResults } from "./SearchResults";

const EXAMPLES: SearchExample[] = [
  { query: "love mercy", mode: "all", label: "love + mercy" },
  { query: "peace hope", mode: "any", label: "peace or hope" },
  { query: "(faith+works),grace", mode: "advanced", label: "faith, works & grace" },
];

function sameIds(left: number[], right: readonly number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function SearchStudio() {
  const { draft, setDraft, completed, pending, failure, status, ready, runSearch, cancel, draftChanged } = useSearchSession();
  const { query, mode, version, bookIds: selectedBooks, caseSensitive } = draft;
  const loading = pending !== null;
  const error = failure?.message ?? "";
  const [showBooks, setShowBooks] = useState(false);
  const [saved, setSaved] = useState<SearchResult[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState("");

  const activeGroup = useMemo(
    () => BOOK_GROUPS.find((group) => sameIds(selectedBooks, group.ids))?.id ?? "custom",
    [selectedBooks],
  );
  const selectedVersion = VERSIONS.find((item) => item.id === completed?.settings.version) ?? VERSIONS[0];

  useEffect(() => {
    const initial = readInitialBrowserState();
    applyTheme(initial.dark);
    queueMicrotask(() => {
      setSaved(initial.saved);
      setDark(initial.dark);
    });
  }, []);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key === "/"
        && !event.metaKey
        && !event.ctrlKey
        && target?.tagName !== "INPUT"
        && target?.tagName !== "TEXTAREA"
      ) {
        event.preventDefault();
        document.getElementById("query")?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function performSearch(override?: SearchExample) {
    const settings = {
      ...draft, query: (override?.query ?? query).trim(),
      mode: override?.mode ?? mode, page: 1,
    };
    setDraft(settings);
    setNotice("");
    void runSearch(settings);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void performSearch();
  }

  function toggleBook(id: number) {
    setDraft((current) => ({
      ...current,
      bookIds: current.bookIds.includes(id)
        ? current.bookIds.filter((bookId) => bookId !== id)
        : [...current.bookIds, id].sort((left, right) => left - right),
    }));
  }

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(success);
    } catch {
      setNotice("Copy is unavailable in this browser.");
    }
  }

  function toggleSaved(result: SearchResult) {
    const key = `${result.version}:${result.ref}`;
    const exists = saved.some((item) => `${item.version}:${item.ref}` === key);
    const next = exists
      ? saved.filter((item) => `${item.version}:${item.ref}` !== key)
      : [result, ...saved].slice(0, 100);
    if (!storeSavedVerses(next)) {
      setNotice("This browser could not save your changes. Allow local storage and try again.");
      return;
    }
    setSaved(next);
    setNotice(exists ? `${result.ref} removed from saved verses.` : `${result.ref} saved on this device.`);
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    applyTheme(next);
  }

  function returnToSearch(nextMode?: SearchMode) {
    if (nextMode) setDraft((current) => ({ ...current, mode: nextMode }));
    document.getElementById("search-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("query")?.focus(), 450);
  }

  function openBookPicker() {
    setShowBooks(true);
    window.setTimeout(
      () => document.getElementById("book-picker")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50,
    );
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to search</a>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="mBAB home">
          <span className="brand-mark" aria-hidden="true"><span>m</span>B</span>
          <span className="brand-copy"><strong>mBAB</strong><small>Multi-Book Advanced Bible Search</small></span>
        </Link>
        <nav className="topnav" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <button className="nav-button" type="button" onClick={() => setSavedOpen((value) => !value)} aria-expanded={savedOpen}>
            Saved <span className="count-badge">{saved.length}</span>
          </button>
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label={`Use ${dark ? "light" : "dark"} theme`}>
            <span aria-hidden="true">{dark ? "☀" : "◐"}</span>
          </button>
        </nav>
      </header>

      {savedOpen && <SavedTray items={saved} onClose={() => setSavedOpen(false)} onRemove={toggleSaved} />}

      <main id="main-content">
        <section className="search-intro">
          <p className="eyebrow"><span className="live-dot" aria-hidden="true" /> 11 editions · 66 books · one clear search</p>
          <h1>Search Scripture.<span>See the pattern.</span></h1>
          <p className="intro-copy">Explore a word, connect ideas, or trace a theme across exactly the books you choose.</p>
          <div className="intro-proof" aria-label="Search features"><span>Transparent logic</span><span>No account needed</span><span>No ads</span></div>
        </section>

        <SearchForm
          query={query}
          mode={mode}
          version={version}
          selectedBooks={selectedBooks}
          activeGroup={activeGroup}
          showBooks={showBooks}
          caseSensitive={caseSensitive}
          loading={loading}
          ready={ready}
          examples={EXAMPLES}
          onQueryChange={(value) => setDraft((current) => ({ ...current, query: value }))}
          onModeChange={(value) => setDraft((current) => ({ ...current, mode: value }))}
          onVersionChange={(value) => setDraft((current) => ({ ...current, version: value }))}
          onCaseChange={(value) => setDraft((current) => ({ ...current, caseSensitive: value }))}
          onTogglePicker={() => setShowBooks((value) => !value)}
          onSelectGroup={(ids) => setDraft((current) => ({ ...current, bookIds: [...ids].sort((left, right) => left - right) }))}
          onToggleBook={toggleBook}
          onSearch={submit}
          onExample={performSearch}
        />

        <div className="announcer" aria-live="polite">{notice || status || (pending ? "Searching Scripture." : completed ? `${completed.response.total} ${completed.response.total === 1 ? "verse" : "verses"} found` : "")}</div>
        {pending && (
          <div className="search-status" role="status">
            <span><span className="spinner" aria-hidden="true" /> Searching “{pending.query}” in {pending.version}…</span>
            <button className="text-button" type="button" onClick={cancel}>Cancel search</button>
          </div>
        )}
        {error && <div className="error-banner" role="alert"><span><strong>Search paused.</strong> {error}{completed ? " Previous results are still shown below." : ""}</span>{failure?.retryable && <button type="button" disabled={loading} onClick={() => { setNotice(""); void runSearch(failure.settings); }}>Retry search</button>}</div>}
        {notice && <div className="toast" role="status">{notice}</div>}

        {completed && (
          <SearchResults
            response={completed.response}
            query={completed.settings.query}
            mode={completed.settings.mode}
            caseSensitive={completed.settings.caseSensitive}
            draftChanged={draftChanged}
            edition={selectedVersion}
            saved={saved}
            loading={loading}
            onCopy={(value, success) => void copy(value, success)}
            onToggleSaved={toggleSaved}
            onShare={() => void copy(`${window.location.origin}${window.location.pathname}?${searchParamsFor(completed.settings)}`, "Share link copied.")}
            onPage={(page) => { setNotice(""); void runSearch({ ...completed.settings, page }); }}
          />
        )}

        <HowItWorks
          firstExample={EXAMPLES[0]}
          onExample={performSearch}
          onChooseBooks={openBookPicker}
          onReturnToSearch={returnToSearch}
        />
        <section className="principles-strip" aria-label="mBAB principles">
          <p>11 open editions</p><p>Transparent logic</p><p>Local saved verses</p><p>No ads</p>
        </section>
      </main>

      <footer>
        <div><Link className="brand footer-brand" href="/"><span className="brand-mark" aria-hidden="true"><span>m</span>B</span><span className="brand-copy"><strong>mBAB</strong><small>Search Scripture with intention.</small></span></Link></div>
        <div className="footer-note"><p>Searching public-domain and open-text editions from the mBAB corpus. UKJV credit: I love Jesus (UKJV).</p><p>Saved verses stay on this device · Made with care by Aaron John Sabu · <a href="https://github.com/aaronjs99/mBAB">View the source</a></p></div>
      </footer>
    </div>
  );
}
