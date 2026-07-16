import { BOOKS, modeDescription } from "@/app/search/catalog";
import type { BibleVersion, SearchMode, SearchResponse, SearchResult } from "@/app/search/types";
import { HighlightedText } from "./HighlightedText";

type Props = {
  response: SearchResponse;
  query: string;
  mode: SearchMode;
  edition: BibleVersion;
  saved: SearchResult[];
  loading: boolean;
  onCopy: (value: string, success: string) => void;
  onToggleSaved: (result: SearchResult) => void;
  onPage: (page: number) => void;
};

export function SearchResults({ response, query, mode, edition, saved, loading, onCopy, onToggleSaved, onPage }: Props) {
  const first = (response.page - 1) * response.pageSize + (response.total ? 1 : 0);
  const last = Math.min(response.page * response.pageSize, response.total);
  const resultLabel = response.total === 1 ? "verse" : "verses";
  return (
    <section className="results-layout" id="search-results" aria-labelledby="results-heading">
      <div className="results-main">
        <div className="results-head">
          <div><p className="eyebrow">{edition.short} · {response.selectedBookCount} books</p><h2 id="results-heading">{response.total.toLocaleString()} {resultLabel} found</h2></div>
          <div className="results-actions">
            <span>{first}–{last} of {response.total.toLocaleString()}</span>
            <button type="button" onClick={() => onCopy(window.location.href, "Share link copied.")}>Share search</button>
          </div>
        </div>

        {response.results.length ? (
          <div className="result-list">
            {response.results.map((result, index) => {
              const isSaved = saved.some((item) => item.version === result.version && item.ref === result.ref);
              return (
                <article className="result-card" key={`${result.version}:${result.ref}`}>
                  <div className="result-number" aria-hidden="true">{String(index + 1 + (response.page - 1) * response.pageSize).padStart(2, "0")}</div>
                  <div className="result-content">
                    <p className="result-ref">{result.ref} <span>{result.version}</span></p>
                    <blockquote><HighlightedText text={result.text} query={query} /></blockquote>
                    <div className="result-tools">
                      <button type="button" onClick={() => onCopy(`${result.ref} (${result.version}) — ${result.text}`, `${result.ref} copied.`)}>Copy</button>
                      <button type="button" className={isSaved ? "saved" : ""} onClick={() => onToggleSaved(result)} aria-pressed={isSaved}>{isSaved ? "Saved" : "Save"}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state"><p className="eyebrow">No matches yet</p><h3>Try a wider thread.</h3><p>Switch to “Any word,” choose more books, or simplify the advanced expression.</p></div>}

        {response.totalPages > 1 && (
          <nav className="pagination" aria-label="Search result pages">
            <button type="button" disabled={response.page === 1 || loading} onClick={() => onPage(response.page - 1)}>← Previous</button>
            <span>Page <strong>{response.page}</strong> of {response.totalPages}</span>
            <button type="button" disabled={response.page === response.totalPages || loading} onClick={() => onPage(response.page + 1)}>Next →</button>
          </nav>
        )}
      </div>

      <aside className="query-inspector" aria-label="Query explanation">
        <p className="eyebrow">Query anatomy</p>
        <h3>Your search, made visible.</h3>
        <div className="expression"><span>Expression</span><code>{response.expression}</code></div>
        <dl>
          <div><dt>Logic</dt><dd>{modeDescription(mode)}</dd></div>
          <div><dt>Scope</dt><dd>{response.selectedBookCount === BOOKS.length ? "The whole Bible" : `${response.selectedBookCount} selected books`}</dd></div>
          <div><dt>Edition</dt><dd>{edition.label}</dd></div>
        </dl>
        <p className="inspector-note">mBAB never hides the query behind an algorithm. What you type is what the index evaluates.</p>
      </aside>
    </section>
  );
}
