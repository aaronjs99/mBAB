import { SEARCH_MODES } from "@/app/search/catalog";
import { parseReference } from "@/app/search/query";
import type { BibleVersion, SearchMode, SearchResponse, SearchResult } from "@/app/search/types";
import { HighlightedText } from "./HighlightedText";
import { BookOverview } from "./BookOverview";

type Props = {
  response: SearchResponse;
  query: string;
  mode: SearchMode;
  caseSensitive: boolean;
  draftChanged: boolean;
  edition: BibleVersion;
  saved: SearchResult[];
  loading: boolean;
  onCopy: (value: string, success: string) => void;
  onShare: () => void;
  onToggleSaved: (result: SearchResult) => void;
  onRead: (result: SearchResult) => void;
  onPage: (page: number) => void;
  onNarrow: (bookId: number) => void;
};

export function SearchResults({ response, query, mode, caseSensitive, draftChanged, edition, saved, loading, onCopy, onShare, onToggleSaved, onRead, onPage, onNarrow }: Props) {
  const first = (response.page - 1) * response.pageSize + (response.total ? 1 : 0);
  const last = Math.min(response.page * response.pageSize, response.total);
  const resultLabel = response.total === 1 ? "verse" : "verses";
  const reference = parseReference(query);
  const logic = reference ? "Reference" : SEARCH_MODES.find(item => item.id === mode)?.label;
  return (
    <section className="results-layout results-reading" id="search-results" aria-labelledby="results-heading" aria-busy={loading}>
      <div className="results-main">
        {draftChanged && <p className="draft-notice">Settings changed. Search to update these results.</p>}
        <div className="results-head">
          <div className="results-summary">
            <p className="eyebrow" title={edition.label}>{edition.short} · {response.selectedBookCount} {response.selectedBookCount === 1 ? "book" : "books"}</p>
            <h2 id="results-heading">{response.total.toLocaleString()} {resultLabel} found</h2>
            <p className="results-query expression">
              <code className="submitted-query">{response.expression}</code>
              <span className="results-logic">{logic}</span>
              {caseSensitive && !reference && <span className="results-case">Match case</span>}
            </p>
          </div>
          <div className="results-actions">
            <span>{first}–{last} of {response.total.toLocaleString()}</span>
            <button type="button" aria-label="Share search" onClick={onShare}>Share</button>
          </div>
        </div>

        {!reference && !!response.bookCounts?.length && <BookOverview
          counts={response.bookCounts} total={response.total} loading={loading}
          canNarrow={response.selectedBookCount > 1} onNarrow={onNarrow}
        />}

        {response.results.length ? (
          <div className="result-list reading-list">
            {response.results.map(result => {
              const isSaved = saved.some((item) => item.version === result.version && item.ref === result.ref);
              return (
                <article className="result-card" key={`${result.version}:${result.ref}`}>
                  <div className="result-content">
                    <p className="result-ref">{result.ref} <span>{result.version}</span></p>
                    <blockquote><HighlightedText text={result.text} query={response.expression} caseSensitive={caseSensitive} /></blockquote>
                    <div className="result-tools">
                      <button type="button" aria-label="Read in context" onClick={() => onRead(result)}>Read</button>
                      <button type="button" onClick={() => onCopy(`${result.ref} (${result.version}) — ${result.text}`, `${result.ref} copied.`)}>Copy</button>
                      <button type="button" className={isSaved ? "saved" : ""} onClick={() => onToggleSaved(result)} aria-pressed={isSaved}>{isSaved ? "Saved" : "Save"}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state"><p>{reference ? "No verses in this reference and book selection." : "No matches. Try different words or books."}</p></div>}

        {response.totalPages > 1 && (
          <nav className="pagination" aria-label="Search result pages">
            <button type="button" disabled={response.page === 1 || loading} onClick={() => onPage(response.page - 1)}>Previous</button>
            <span>Page <strong>{response.page}</strong> of {response.totalPages}</span>
            <button type="button" disabled={response.page === response.totalPages || loading} onClick={() => onPage(response.page + 1)}>Next</button>
          </nav>
        )}
      </div>

    </section>
  );
}
