"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { BOOK_GROUPS, VERSIONS } from "@/app/search/catalog";
import { applyTheme, readInitialBrowserState, storeSavedVerses } from "@/app/search/browser-storage";
import { DEFAULT_SEARCH, searchParamsFor } from "@/app/search/search-location";
import { useSearchSession } from "@/app/search/use-search-session";
import { useChapterReader } from "@/app/search/use-chapter-reader";
import type { SearchExample, SearchMode, SearchResponse, SearchResult } from "@/app/search/types";
import { SearchHelp } from "./SearchHelp";
import { ChapterReader } from "./ChapterReader";
import { SavedTray } from "./SavedTray";
import { SearchForm } from "./SearchForm";
import { SearchResults } from "./SearchResults";
import { DictionaryPanel } from "./DictionaryPanel";
import { BookPicker } from "./BookPicker";

const EXAMPLES: Record<SearchMode, SearchExample[]> = {
  all: [
    { query: "John 3:16", mode: "all", label: "John 3:16" },
    { query: "love mercy", mode: "all", label: "love + mercy" },
  ],
  any: [
    { query: "peace hope", mode: "any", label: "peace or hope" },
    { query: "wisdom wise", mode: "any", label: "wisdom or wise" },
  ],
  advanced: [
    { query: "(faith + works), grace", mode: "advanced", label: "(faith + works), grace" },
    { query: "love + (mercy, kindness)", mode: "advanced", label: "love + (mercy, kindness)" },
  ],
};

function sameIds(left: number[], right: readonly number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function SearchStudio() {
  const reader = useChapterReader();
  const { draft, setDraft, completed, pending, failure, status, ready, runSearch, cancel, draftChanged } = useSearchSession();
  const { query, mode, version, bookIds: selectedBooks, caseSensitive } = draft;
  const loading = pending !== null;
  const error = failure?.message ?? "";
  const [showBooks, setShowBooks] = useState(false);
  const [desktopBooks, setDesktopBooks] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [verseSize, setVerseSize] = useState(19);
  const [saved, setSaved] = useState<SearchResult[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState("");
  const relatedFocus = useRef<{ trigger: Element | null; settings: string; response: SearchResponse } | null>(null);

  const activeGroup = useMemo(
    () => BOOK_GROUPS.find((group) => sameIds(selectedBooks, group.ids))?.id ?? "custom",
    [selectedBooks],
  );
  const selectedVersion = VERSIONS.find((item) => item.id === completed?.settings.version) ?? VERSIONS[0];

  useEffect(() => {
    const desktop = matchMedia("(min-width: 1000px)");
    const update = () => setDesktopBooks(desktop.matches);
    queueMicrotask(update);
    desktop.addEventListener("change", update);
    try {
      const stored = Number(localStorage.getItem("mbab:verse-size"));
      if (Number.isFinite(stored) && stored >= 16 && stored <= 26) queueMicrotask(() => setVerseSize(stored));
    } catch { /* Reading remains adjustable without browser storage. */ }
    return () => desktop.removeEventListener("change", update);
  }, []);

  function changeVerseSize(value: number) {
    setVerseSize(value);
    try { localStorage.setItem("mbab:verse-size", String(value)); } catch { /* Keep the current tab usable. */ }
  }

  function resetFilters() {
    setDraft(current => ({ ...current, version: DEFAULT_SEARCH.version, bookIds: [...DEFAULT_SEARCH.bookIds], mode: "all", caseSensitive: false, page: 1 }));
  }

  useEffect(() => {
    const initial = readInitialBrowserState();
    applyTheme(initial.dark);
    queueMicrotask(() => {
      setSaved(initial.saved);
      setDark(initial.dark);
    });
  }, []);

  useEffect(() => {
    const target = relatedFocus.current;
    if (!target || pending) return;
    relatedFocus.current = null;
    if (failure || !completed || completed.response === target.response
      || searchParamsFor({ ...completed.settings, page: 1 }).toString() !== target.settings
      || !target.trigger || target.trigger.isConnected) return;
    if (document.activeElement && document.activeElement !== document.body && document.activeElement !== target.trigger) return;
    document.getElementById("results-heading")?.focus({ preventScroll: true });
  }, [completed, pending, failure]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key === "/"
        && !document.querySelector("dialog[open]")
        && !event.metaKey
        && !event.ctrlKey
        && target?.tagName !== "INPUT"
        && target?.tagName !== "TEXTAREA"
        && target?.tagName !== "SELECT"
        && !target?.isContentEditable
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

  function performRelatedSuggestion(suggestion: SearchExample) {
    if (!completed) return;
    const settings = { ...completed.settings, query: suggestion.query, mode: suggestion.mode, page: 1 };
    relatedFocus.current = { trigger: document.activeElement, settings: searchParamsFor(settings).toString(), response: completed.response };
    setDraft(settings);
    setNotice("");
    void runSearch(settings);
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

  return (
    <div className={`site-shell${completed ? " has-results" : ""}`} style={{ "--verse-size": `${verseSize}px` } as CSSProperties}>
      <a className="skip-link" href="#main-content">Skip to search</a>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="mBAB home">
          <svg className="brand-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z" /></svg>
          <strong>mBAB</strong>
        </Link>
        <nav className="topnav" aria-label="Primary navigation">
          <button className="nav-button" type="button" disabled={!ready} onClick={() => setDictionaryOpen(true)} aria-haspopup="dialog">Dictionary</button>
          <SearchHelp />
          <button className="nav-button" type="button" disabled={!ready} onClick={() => setSavedOpen((value) => !value)} aria-expanded={savedOpen}>
            Saved <span className="count-badge">{saved.length}</span>
          </button>
          <button className="icon-button" type="button" disabled={!ready} onClick={toggleTheme} aria-label={`Use ${dark ? "light" : "dark"} theme`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20 15A8 8 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z" />}</svg>
          </button>
        </nav>
      </header>

      {dictionaryOpen && <DictionaryPanel initialWord={query} onClose={() => setDictionaryOpen(false)} onSearchWord={word => performSearch({ query: word, mode: "all", label: word })} />}

      {savedOpen && <SavedTray items={saved} onClose={() => setSavedOpen(false)} onRemove={toggleSaved} onRead={result => reader.open({ result, query: "", caseSensitive: false })} />}
      {reader.selection && <ChapterReader
        selection={reader.selection} chapter={reader.chapter} comparison={reader.comparison}
        comparisonVersion={reader.comparisonVersion} expanded={reader.expanded}
        onCompare={reader.setComparisonVersion} onExpand={reader.setExpanded} onClose={reader.close}
      />}

      <main id="main-content" className="workspace-main">
        <section className="search-intro">
          <h1 id="search-heading">Search the Bible</h1>
        </section>

        <SearchForm
          query={query}
          mode={mode}
          version={version}
          selectedBooks={selectedBooks}
          activeGroup={activeGroup}
          showBooks={desktopBooks || showBooks}
          caseSensitive={caseSensitive}
          loading={loading}
          ready={ready}
          examples={EXAMPLES[mode]}
          hasResults={completed !== null}
          onQueryChange={(value) => setDraft((current) => ({ ...current, query: value }))}
          onModeChange={(value) => setDraft((current) => ({ ...current, mode: value }))}
          onVersionChange={(value) => setDraft((current) => ({ ...current, version: value }))}
          onCaseChange={(value) => setDraft((current) => ({ ...current, caseSensitive: value }))}
          onTogglePicker={() => {
            if (desktopBooks) document.getElementById("book-picker")?.focus({ preventScroll: true });
            else setShowBooks(value => !value);
          }}
          onSelectGroup={(ids) => setDraft((current) => ({ ...current, bookIds: [...ids].sort((left, right) => left - right) }))}
          onToggleBook={toggleBook}
          onSearch={submit}
          onExample={performSearch}
          verseSize={verseSize} onVerseSizeChange={changeVerseSize}
        />

        <aside id="book-picker" className="books-rail" data-open={showBooks} tabIndex={-1} aria-label="Book selection"
          onKeyDown={event => { if (event.key === "Escape" && !desktopBooks) { setShowBooks(false); document.getElementById("books-toggle")?.focus(); } }}>
          <BookPicker selectedBooks={selectedBooks} activeGroup={activeGroup} ready={ready}
            onSelectGroup={ids => setDraft(current => ({ ...current, bookIds: [...ids].sort((a, b) => a - b) }))}
            onToggleBook={toggleBook} onClose={() => { setShowBooks(false); document.getElementById("books-toggle")?.focus(); }} onReset={resetFilters} />
        </aside>

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
            onRead={(result, expression) => reader.open({ result, query: expression ?? completed.response.expression, caseSensitive: completed.settings.caseSensitive })}
            onShare={() => void copy(`${window.location.origin}${window.location.pathname}?${searchParamsFor(completed.settings)}`, "Share link copied.")}
            onPage={(page) => { setNotice(""); void runSearch({ ...completed.settings, page }); }}
            onNarrow={bookId => {
              const narrowed = { ...completed.settings, bookIds: [bookId], page: 1 };
              setDraft(narrowed);
              setNotice("");
              void runSearch(narrowed);
            }}
            relatedKey={searchParamsFor({ ...completed.settings, page: 1 }).toString()}
            onRelatedSuggestion={performRelatedSuggestion}
            onSearchRelated={terms => {
              const settings = { ...completed.settings, query: terms.join(" "), mode: "any" as const, page: 1 };
              setDraft(settings);
              setNotice("");
              void runSearch(settings);
            }}
          />
        )}

      </main>

      <footer>
        <span>Aaron John Sabu</span>
        <div className="footer-links">
          <a href="https://github.com/aaronjs99/mBAB">Source</a>
          <details className="edition-credits">
            <summary>Text credits</summary>
            <div>
              <p>UKJV: I love Jesus (UKJV).</p>
              {VERSIONS.map(item => <a key={item.id} href={item.infoUrl} target="_blank" rel="noreferrer">{item.short} · {item.label}</a>)}
              <a href="https://wordnet.princeton.edu/" target="_blank" rel="noreferrer">Related words · WordNet 3.0</a>
              <a href="/WORDNET-LICENSE.txt">WordNet license</a>
            </div>
          </details>
        </div>
      </footer>
    </div>
  );
}
