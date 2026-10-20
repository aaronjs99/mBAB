import { BOOKS, SEARCH_MODES } from "@/app/search/catalog";
import { parseReference } from "@/app/search/query";
import type { BibleVersion, SearchExample, SearchMode, SearchResponse, SearchResult } from "@/app/search/types";
import { BookOverview } from "./BookOverview";
import { VerseCard } from "./VerseCard";

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
  onRead: (result: SearchResult, expression?: string) => void;
  onPage: (page: number) => void;
  onNarrow: (bookId: number) => void;
  onRelatedSuggestion: (suggestion: SearchExample) => void;
  onSearchRelated: (terms: string[]) => void;
  relatedKey: string;
};

export function SearchResults({ response, query, mode, caseSensitive, draftChanged, edition, saved, loading, onCopy, onShare, onToggleSaved, onRead, onPage, onNarrow, onRelatedSuggestion, onSearchRelated, relatedKey }: Props) {
  const first = (response.page - 1) * response.pageSize + (response.total ? 1 : 0);
  const last = Math.min(response.page * response.pageSize, response.total);
  const resultLabel = response.total === 1 ? "verse" : "verses";
  const reference = parseReference(query);
  const logic = reference ? "Reference" : SEARCH_MODES.find(item => item.id === mode)?.label;
  const related = response.related;
  const relatedExpression = related?.terms.join(",") ?? "";
  const suggestions: SearchExample[] = response.relatedSuggestions ?? (
    related && /^[a-z]+$/i.test(response.expression)
      ? related.terms.map(term => ({ label: term, query: term, mode: "any" as const })) : []
  );
  return (
    <section className="results-layout results-reading" id="search-results" aria-labelledby="results-heading" aria-busy={loading}>
      <div className="results-main">
        {draftChanged && <p className="draft-notice">Settings changed. Search to update these results.</p>}
        <div className="results-head">
          <div className="results-summary">
            <p className="eyebrow" title={edition.label}>{edition.short} · {response.selectedBookCount === BOOKS.length ? "Entire Bible" : `${response.selectedBookCount} ${response.selectedBookCount === 1 ? "book" : "books"}`}</p>
            <h2 id="results-heading" tabIndex={-1}>{response.total.toLocaleString()} {resultLabel} found</h2>
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

        {response.results.length > 0 && <p className="word-meaning-hint">Tap a word for its meaning.</p>}

        {(suggestions.length > 0 || related) && <section className="related-words" aria-labelledby="related-words-heading">
          <h3 className="related-words-heading" id="related-words-heading">Related words</h3>
          {suggestions.length > 0 && <div className="related-terms">
            {suggestions.map(suggestion => <button
              className="related-term" key={`${suggestion.mode}:${suggestion.query}`} type="button" disabled={loading}
              aria-label={`Search related query: ${suggestion.query}${suggestion.label === suggestion.query ? "" : ` (${suggestion.label})`}`} onClick={() => onRelatedSuggestion(suggestion)}
            >{suggestion.label}</button>)}
          </div>}
          {related && <details className="related-preview" key={relatedKey}>
            <summary className="related-preview-summary">
              <span>Preview verses</span>
              <span className="related-words-count">{related.total.toLocaleString()} {related.total === 1 ? "verse" : "verses"}</span>
            </summary>
            <div className="related-words-content">
              <div className="related-verse-list">
                {related.results.map(result => <VerseCard
                  key={`${result.version}:${result.ref}`} result={result} query={relatedExpression} caseSensitive={caseSensitive}
                  isSaved={saved.some(item => item.version === result.version && item.ref === result.ref)}
                  onRead={() => onRead(result, relatedExpression)} onCopy={onCopy} onToggleSaved={onToggleSaved}
                />)}
              </div>
              <button className="related-search" type="button" disabled={loading} onClick={() => onSearchRelated(related.terms)}>Search related words</button>
            </div>
          </details>}
        </section>}

        {!reference && !!response.bookCounts?.length && <BookOverview
          counts={response.bookCounts} total={response.total} loading={loading}
          canNarrow={response.selectedBookCount > 1} onNarrow={onNarrow}
        />}

        {response.results.length ? (
          <div className="result-list reading-list">
            {response.results.map(result => <VerseCard
              key={`${result.version}:${result.ref}`} result={result} query={response.expression} caseSensitive={caseSensitive}
              isSaved={saved.some(item => item.version === result.version && item.ref === result.ref)}
              onRead={() => onRead(result)} onCopy={onCopy} onToggleSaved={onToggleSaved}
            />)}
          </div>
        ) : <div className="empty-state"><p>{reference ? "No verses in this reference and book selection." : related || suggestions.length > 0 ? "No exact matches." : "No matches. Try different words or books."}</p></div>}

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
