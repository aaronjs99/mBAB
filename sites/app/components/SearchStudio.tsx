"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BOOK_GROUPS,
  BOOKS,
  VERSIONS,
  modeDescription,
  type SearchMode,
} from "@/app/search-config";

type SearchResult = {
  ref: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  version: string;
};

type SearchResponse = {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  expression: string;
  selectedBookCount: number;
  source: string;
};

const ALL_BOOK_IDS = BOOKS.map((book) => book.id);
const EXAMPLES: Array<{ query: string; mode: SearchMode; label: string }> = [
  { query: "love mercy", mode: "all", label: "love + mercy" },
  { query: "peace hope", mode: "any", label: "peace or hope" },
  { query: "(faith+works),grace", mode: "advanced", label: "faith, works & grace" },
];

function sameIds(left: number[], right: readonly number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function queryTerms(query: string) {
  return [...new Set(query.match(/[A-Za-z0-9_]+/g)?.filter((word) => word.length > 1) ?? [])];
}

function highlightedText(text: string, query: string) {
  const terms = queryTerms(query);
  if (!terms.length) return text;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(pattern).map((part, index) => {
    const isMatch = terms.some((term) => term.toLowerCase() === part.toLowerCase());
    return isMatch ? <mark key={`${part}-${index}`}>{part}</mark> : <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

export function SearchStudio() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("all");
  const [version, setVersion] = useState("KJV");
  const [selectedBooks, setSelectedBooks] = useState<number[]>(ALL_BOOK_IDS);
  const [showBooks, setShowBooks] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SearchResult[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState("");

  const activeGroup = useMemo(
    () => BOOK_GROUPS.find((group) => sameIds(selectedBooks, group.ids))?.id ?? "custom",
    [selectedBooks],
  );

  const selectedVersion = VERSIONS.find((item) => item.id === version) ?? VERSIONS[0];

  useEffect(() => {
    try {
      const savedItems = JSON.parse(localStorage.getItem("mbab:saved-verses") ?? "[]") as SearchResult[];
      const preferredTheme = localStorage.getItem("mbab:theme");
      const shouldUseDark = preferredTheme === "dark" || (!preferredTheme && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = shouldUseDark ? "dark" : "light";

      const params = new URLSearchParams(window.location.search);
      const sharedQuery = params.get("q");
      const sharedMode = params.get("mode") as SearchMode | null;
      const sharedVersion = params.get("version");
      const sharedBooks = params.get("books")?.split(",").map(Number).filter((id) => Number.isInteger(id) && id >= 0 && id < 66);
      queueMicrotask(() => {
        if (Array.isArray(savedItems)) setSaved(savedItems.slice(0, 100));
        setDark(shouldUseDark);
        if (sharedQuery) setQuery(sharedQuery.slice(0, 120));
        if (sharedMode && ["all", "any", "advanced"].includes(sharedMode)) setMode(sharedMode);
        if (sharedVersion && VERSIONS.some((item) => item.id === sharedVersion)) setVersion(sharedVersion);
        if (sharedBooks?.length) setSelectedBooks([...new Set(sharedBooks)].sort((a, b) => a - b));
      });
    } catch {
      localStorage.removeItem("mbab:saved-verses");
    }
  }, []);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA") {
        event.preventDefault();
        document.getElementById("query")?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function persistSaved(items: SearchResult[]) {
    setSaved(items);
    localStorage.setItem("mbab:saved-verses", JSON.stringify(items));
  }

  async function performSearch(page = 1, override?: { query: string; mode: SearchMode }) {
    const effectiveQuery = (override?.query ?? query).trim();
    const effectiveMode = override?.mode ?? mode;
    if (effectiveQuery.length < 2) {
      setError("Enter at least two characters to begin.");
      return;
    }
    if (!selectedBooks.length) {
      setError("Choose at least one book.");
      return;
    }

    setQuery(effectiveQuery);
    setMode(effectiveMode);
    setLoading(true);
    setError("");
    setNotice("");

    const params = new URLSearchParams({
      q: effectiveQuery,
      mode: effectiveMode,
      version,
      books: selectedBooks.join(","),
      case: String(caseSensitive),
      page: String(page),
      pageSize: "20",
    });

    try {
      const result = await fetch(`/api/search?${params.toString()}`, { headers: { Accept: "application/json" } });
      const payload = (await result.json()) as SearchResponse & { error?: string };
      if (!result.ok) throw new Error(payload.error || "Search could not be completed.");
      setResponse(payload);

      const shareParams = new URLSearchParams({
        q: effectiveQuery,
        mode: effectiveMode,
        version,
        books: selectedBooks.join(","),
      });
      window.history.replaceState(null, "", `${window.location.pathname}?${shareParams.toString()}`);
      document.getElementById("search-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (searchError) {
      setResponse(null);
      setError(searchError instanceof Error ? searchError.message : "Search could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void performSearch(1);
  }

  function selectGroup(ids: readonly number[]) {
    setSelectedBooks([...ids].sort((a, b) => a - b));
  }

  function toggleBook(id: number) {
    setSelectedBooks((current) =>
      current.includes(id) ? current.filter((bookId) => bookId !== id) : [...current, id].sort((a, b) => a - b),
    );
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
    persistSaved(next);
    setNotice(exists ? `${result.ref} removed from saved verses.` : `${result.ref} saved on this device.`);
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("mbab:theme", next ? "dark" : "light");
  }

  function returnToSearch(nextMode?: SearchMode) {
    if (nextMode) setMode(nextMode);
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

  const resultRange = response
    ? `${(response.page - 1) * response.pageSize + (response.total ? 1 : 0)}–${Math.min(response.page * response.pageSize, response.total)}`
    : "";

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

      {savedOpen && (
        <section className="saved-tray" aria-label="Saved verses">
          <div className="saved-tray-head">
            <div><p className="eyebrow">Your reading desk</p><h2>Saved on this device</h2></div>
            <button className="text-button" type="button" onClick={() => setSavedOpen(false)}>Close</button>
          </div>
          {saved.length ? (
            <div className="saved-grid">
              {saved.map((item) => (
                <article key={`${item.version}:${item.ref}`} className="saved-card">
                  <p className="result-ref">{item.ref} <span>{item.version}</span></p>
                  <p>{item.text}</p>
                  <button className="text-button danger" type="button" onClick={() => toggleSaved(item)}>Remove</button>
                </article>
              ))}
            </div>
          ) : <p className="empty-copy">Save a verse from any result and it will wait here for you.</p>}
        </section>
      )}

      <main id="main-content">
        <section className="search-intro">
          <p className="eyebrow"><span className="live-dot" aria-hidden="true" /> 11 editions · 66 books · one clear search</p>
          <h1>Search Scripture.<span>See the pattern.</span></h1>
          <p className="intro-copy">Explore a word, connect ideas, or trace a theme across exactly the books you choose.</p>
          <div className="intro-proof" aria-label="Search features">
            <span>Transparent logic</span><span>No account needed</span><span>No ads</span>
          </div>
        </section>

        <section className="search-card" aria-labelledby="search-heading">
          <div className="search-card-top">
            <div><p className="eyebrow">Begin your search</p><h2 id="search-heading">What are you looking for?</h2></div>
            <div className="edition-control">
              <label htmlFor="version">Edition</label>
              <select id="version" value={version} onChange={(event) => setVersion(event.target.value)}>
                {VERSIONS.map((item) => <option key={item.id} value={item.id}>{item.short} · {item.label}</option>)}
              </select>
            </div>
          </div>

          <form onSubmit={submit}>
            <fieldset className="mode-switcher">
              <legend className="sr-only">Search mode</legend>
              {([
                ["all", "All words"], ["any", "Any word"], ["advanced", "Advanced"],
              ] as Array<[SearchMode, string]>).map(([value, label]) => (
                <button key={value} type="button" className={mode === value ? "active" : ""} onClick={() => setMode(value)} aria-pressed={mode === value}>{label}</button>
              ))}
            </fieldset>

            <div className="query-row">
              <label className="sr-only" htmlFor="query">Bible search query</label>
              <input
                id="query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === "advanced" ? "Try: (faith + works), grace" : "Try: love mercy"}
                maxLength={120}
                autoComplete="off"
                aria-describedby="query-help"
              />
              <button className="search-button" type="submit" disabled={loading}>
                {loading ? <><span className="spinner" aria-hidden="true" /> Searching</> : <>Search <span aria-hidden="true">→</span></>}
              </button>
            </div>
            <div className="query-meta">
              <p id="query-help">{modeDescription(mode)}</p>
              <div className="query-options">
                <span className="keyboard-hint"><kbd>/</kbd> Focus search</span>
                <label className="check-control"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} /> Match case</label>
              </div>
            </div>

            <div className="book-filter" id="book-picker">
              <div className="book-filter-bar">
                <div className="group-pills" aria-label="Book collections">
                  {BOOK_GROUPS.map((group) => (
                    <button key={group.id} type="button" className={activeGroup === group.id ? "active" : ""} onClick={() => selectGroup(group.ids)}>{group.label}</button>
                  ))}
                </div>
                <button className="filter-toggle" type="button" onClick={() => setShowBooks((value) => !value)} aria-expanded={showBooks}>
                  Choose books <span>{selectedBooks.length}/66</span> <span aria-hidden="true">{showBooks ? "−" : "+"}</span>
                </button>
              </div>
              {showBooks && (
                <div className="book-grid-wrap">
                  {["Old Testament", "New Testament"].map((testament) => (
                    <div key={testament} className="testament-block">
                      <h3>{testament}</h3>
                      <div className="book-grid">
                        {BOOKS.filter((book) => book.testament === testament).map((book) => (
                          <button key={book.id} type="button" className={selectedBooks.includes(book.id) ? "selected" : ""} onClick={() => toggleBook(book.id)} aria-pressed={selectedBooks.includes(book.id)}>{book.abbreviation}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>

          <div className="example-row">
            <span>Try a search</span>
            {EXAMPLES.map((example) => (
              <button key={example.label} type="button" onClick={() => void performSearch(1, example)}>{example.label} <span aria-hidden="true">↗</span></button>
            ))}
          </div>
        </section>

        <div className="announcer" aria-live="polite">{error || notice || (response ? `${response.total} verses found` : "")}</div>
        {error && <div className="error-banner" role="alert"><strong>Search paused.</strong> {error}</div>}
        {notice && <div className="toast" role="status">{notice}</div>}

        {response && (
          <section className="results-layout" id="search-results" aria-labelledby="results-heading">
            <div className="results-main">
              <div className="results-head">
                <div><p className="eyebrow">{selectedVersion.short} · {response.selectedBookCount} books</p><h2 id="results-heading">{response.total.toLocaleString()} verses found</h2></div>
                <div className="results-actions">
                  <span>{resultRange} of {response.total.toLocaleString()}</span>
                  <button type="button" onClick={() => copy(window.location.href, "Share link copied.")}>Share search</button>
                </div>
              </div>

              {response.results.length ? (
                <div className="result-list">
                  {response.results.map((result) => {
                    const isSaved = saved.some((item) => item.version === result.version && item.ref === result.ref);
                    return (
                      <article className="result-card" key={`${result.version}:${result.ref}`}>
                        <div className="result-number" aria-hidden="true">{String(response.results.indexOf(result) + 1 + (response.page - 1) * response.pageSize).padStart(2, "0")}</div>
                        <div className="result-content">
                          <p className="result-ref">{result.ref} <span>{result.version}</span></p>
                          <blockquote>{highlightedText(result.text, query)}</blockquote>
                          <div className="result-tools">
                            <button type="button" onClick={() => copy(`${result.ref} (${result.version}) — ${result.text}`, `${result.ref} copied.`)}>Copy</button>
                            <button type="button" className={isSaved ? "saved" : ""} onClick={() => toggleSaved(result)} aria-pressed={isSaved}>{isSaved ? "Saved" : "Save"}</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : <div className="empty-state"><p className="eyebrow">No matches yet</p><h3>Try a wider thread.</h3><p>Switch to “Any word,” choose more books, or simplify the advanced expression.</p></div>}

              {response.totalPages > 1 && (
                <nav className="pagination" aria-label="Search result pages">
                  <button type="button" disabled={response.page === 1 || loading} onClick={() => void performSearch(response.page - 1)}>← Previous</button>
                  <span>Page <strong>{response.page}</strong> of {response.totalPages}</span>
                  <button type="button" disabled={response.page === response.totalPages || loading} onClick={() => void performSearch(response.page + 1)}>Next →</button>
                </nav>
              )}
            </div>

            <aside className="query-inspector" aria-label="Query explanation">
              <p className="eyebrow">Query anatomy</p>
              <h3>Your search, made visible.</h3>
              <div className="expression"><span>Expression</span><code>{response.expression}</code></div>
              <dl>
                <div><dt>Logic</dt><dd>{modeDescription(mode)}</dd></div>
                <div><dt>Scope</dt><dd>{response.selectedBookCount === 66 ? "The whole Bible" : `${response.selectedBookCount} selected books`}</dd></div>
                <div><dt>Edition</dt><dd>{selectedVersion.label}</dd></div>
              </dl>
              <p className="inspector-note">mBAB never hides the query behind an algorithm. What you type is what the index evaluates.</p>
            </aside>
          </section>
        )}

        <section className="how-section" id="how-it-works" aria-labelledby="how-heading">
          <div className="section-heading">
            <div><p className="eyebrow">How mBAB works</p><h2 id="how-heading">A better question leads<br />to a clearer thread.</h2></div>
            <p className="section-intro">Start simple, then shape the search until it matches the way you are reading.</p>
          </div>
          <div className="feature-grid">
            <article>
              <span className="feature-index">01</span>
              <h3>Start with an idea</h3>
              <p>Enter a word, a phrase, or two ideas you want to see together in the same verse.</p>
              <button className="how-action" type="button" onClick={() => void performSearch(1, EXAMPLES[0])}>Try “love + mercy” <span aria-hidden="true">→</span></button>
            </article>
            <article>
              <span className="feature-index">02</span>
              <h3>Shape the logic</h3>
              <p>Use every word, any word, or a grouped expression. Then choose an edition and the exact books to search.</p>
              <div className="logic-preview" aria-label="Available search modes"><span>ALL</span><span>ANY</span><span>ADVANCED</span></div>
              <button className="how-action" type="button" onClick={openBookPicker}>Choose books <span aria-hidden="true">→</span></button>
            </article>
            <article>
              <span className="feature-index">03</span>
              <h3>Follow what you find</h3>
              <p>Matches are highlighted and explained. Save meaningful verses on your device or share the complete search.</p>
              <div className="mini-result"><strong>Romans 5:1</strong><span>…being justified by faith…</span></div>
              <button className="how-action" type="button" onClick={() => returnToSearch("advanced")}>Build an advanced search <span aria-hidden="true">→</span></button>
            </article>
          </div>
        </section>

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
