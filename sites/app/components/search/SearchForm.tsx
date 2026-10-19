import type { FormEvent } from "react";
import { BOOK_GROUPS, BOOKS, SEARCH_MODES, VERSIONS, modeDescription } from "@/app/search/catalog";
import type { SearchExample, SearchMode } from "@/app/search/types";

type Props = {
  query: string; mode: SearchMode; version: string; selectedBooks: number[];
  activeGroup: string; showBooks: boolean; caseSensitive: boolean; loading: boolean;
  ready: boolean; hasResults: boolean; examples: SearchExample[];
  onQueryChange: (value: string) => void; onModeChange: (value: SearchMode) => void;
  onVersionChange: (value: string) => void; onCaseChange: (value: boolean) => void;
  onTogglePicker: () => void; onSelectGroup: (ids: readonly number[]) => void;
  onToggleBook: (id: number) => void; onSearch: (event: FormEvent) => void;
  onExample: (example: SearchExample) => void;
  verseSize?: number; onVerseSizeChange?: (value: number) => void;
};

export function SearchForm({ query, mode, version, selectedBooks, activeGroup, showBooks,
  caseSensitive, loading, ready, hasResults, examples, onQueryChange, onModeChange,
  onVersionChange, onCaseChange, onTogglePicker, onSelectGroup, onSearch, onExample,
  verseSize = 19, onVerseSizeChange }: Props) {
  const scope = selectedBooks.length === BOOKS.length ? "Entire Bible"
    : selectedBooks.length === 1 ? BOOKS[selectedBooks[0]].name : `${selectedBooks.length} books`;
  return (
    <section className="search-card" aria-labelledby="search-heading">
      <form onSubmit={onSearch}>
        <div className="query-row">
          <svg className="search-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <label className="sr-only" htmlFor="query">Bible search query</label>
          <input id="query" value={query} onChange={event => onQueryChange(event.target.value)}
            placeholder={mode === "advanced" ? "(faith + works), grace" : "Words or a verse reference"}
            maxLength={120} autoComplete="off" disabled={!ready} aria-describedby="query-help" />
          <button className="search-button" type="submit" disabled={!ready || loading}>
            {loading ? <span className="spinner" aria-label="Searching" /> : <><span>Search</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></>}
          </button>
        </div>
        <p id="query-help" className="sr-only">{modeDescription(mode)}</p>
        <div className="search-toolbar">
          <fieldset className="mode-switcher" disabled={!ready}>
            <legend className="sr-only">Search mode</legend>
            {SEARCH_MODES.map(item => <button key={item.id} type="button" className={mode === item.id ? "active" : ""} onClick={() => onModeChange(item.id)} aria-pressed={mode === item.id}>{item.label}</button>)}
          </fieldset>
          <label className="check-control case-control"><input type="checkbox" disabled={!ready} checked={caseSensitive} onChange={event => onCaseChange(event.target.checked)} /> Match case</label>
          <details className="search-options reading-options">
            <summary aria-label="Reading controls"><span aria-hidden="true">Aa</span><span className="sr-only">Reading controls</span></summary>
            <div className="options-panel reading-panel">
              <span className="reading-label">Verse text</span>
              <div className="verse-size-controls">
                <button type="button" aria-label="Smaller verse text" disabled={!onVerseSizeChange || verseSize <= 16} onClick={() => onVerseSizeChange?.(Math.max(16, verseSize - 2))}>A<span aria-hidden="true">−</span></button>
                <output aria-label="Verse text size">{verseSize}px</output>
                <button type="button" aria-label="Larger verse text" disabled={!onVerseSizeChange || verseSize >= 26} onClick={() => onVerseSizeChange?.(Math.min(26, verseSize + 2))}>A<span aria-hidden="true">+</span></button>
              </div>
            </div>
          </details>
        </div>
        <div className="scope-toolbar">
          <label className="edition-select" htmlFor="version"><span>Edition</span>
            <select id="version" value={version} disabled={!ready} title="Bible edition" onChange={event => onVersionChange(event.target.value)}>
              {VERSIONS.map(item => <option key={item.id} value={item.id}>{item.short} · {item.label}</option>)}
            </select>
          </label>
          <div className="quick-scope" role="group" aria-label="Search scope">
            {(["old", "all", "new"] as const).map(id => {
              const group = BOOK_GROUPS.find(item => item.id === id)!;
              return <button key={id} type="button" disabled={!ready} className={activeGroup === id ? "active" : ""} aria-pressed={activeGroup === id} aria-label={id === "all" ? "Entire Bible" : group.label} onClick={() => onSelectGroup(group.ids)}>{id === "old" ? "OT" : id === "new" ? "NT" : "Entire Bible"}</button>;
            })}
          </div>
          <div className="search-filters">
            <button id="books-toggle" className="filter-toggle" type="button" disabled={!ready} onClick={onTogglePicker} aria-expanded={showBooks} aria-controls="book-picker" aria-label={`Choose books: ${scope} (${selectedBooks.length}/${BOOKS.length})`}>
              <span>Books</span><span className="filter-scope">{scope}</span><span className="sr-only"> {selectedBooks.length}/{BOOKS.length}</span><span className="chevron" aria-hidden="true" />
            </button>
          </div>
        </div>
        {mode === "advanced" && <p className="advanced-hint"><code>+</code> both <span>·</span> <code>,</code> either <span>·</span> <code>( )</code> group</p>}
      </form>
      {!hasResults && <div className="example-row"><span>Try</span>{examples.map(example => <button key={example.label} type="button" disabled={!ready} onClick={() => onExample(example)}>{example.label}</button>)}</div>}
    </section>
  );
}
