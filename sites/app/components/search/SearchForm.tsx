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
};

export function SearchForm({ query, mode, version, selectedBooks, activeGroup, showBooks,
  caseSensitive, loading, ready, hasResults, examples, onQueryChange, onModeChange,
  onVersionChange, onCaseChange, onTogglePicker, onSelectGroup, onToggleBook, onSearch, onExample }: Props) {
  const scope = selectedBooks.length === BOOKS.length ? "All books"
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
          <div className="edition-control">
            <label className="sr-only" htmlFor="version">Edition</label>
            <span className="edition-short" aria-hidden="true">{VERSIONS.find(item => item.id === version)?.short}</span>
            <select id="version" value={version} disabled={!ready} title="Bible edition" onChange={event => onVersionChange(event.target.value)}>
              {VERSIONS.map(item => <option key={item.id} value={item.id}>{item.short} · {item.label}</option>)}
            </select>
          </div>
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
          <div className="search-filters">
            <button className="filter-toggle" type="button" disabled={!ready} onClick={onTogglePicker} aria-expanded={showBooks} aria-controls="book-picker" aria-label={`Choose books ${selectedBooks.length}/${BOOKS.length}`}>
              {scope}<span className="sr-only"> {selectedBooks.length}/{BOOKS.length}</span><span className="chevron" aria-hidden="true" />
            </button>
            <details className="search-options">
              <summary aria-label="Search options">Options{caseSensitive && <span className="case-indicator" aria-hidden="true">Aa</span>}</summary>
              <div className="options-panel"><label className="check-control"><input type="checkbox" disabled={!ready} checked={caseSensitive} onChange={event => onCaseChange(event.target.checked)} /> Match case</label></div>
            </details>
          </div>
        </div>
        {mode === "advanced" && <p className="advanced-hint"><code>+</code> both <span>·</span> <code>,</code> either <span>·</span> <code>( )</code> group</p>}
        {showBooks && <div className="book-filter" id="book-picker">
          <div className="book-filter-bar"><span>{selectedBooks.length} selected</span><button className="text-button" type="button" onClick={onTogglePicker}>Done</button></div>
          <div className="group-pills" aria-label="Book collections">{BOOK_GROUPS.map(group => <button key={group.id} type="button" disabled={!ready} className={activeGroup === group.id ? "active" : ""} onClick={() => onSelectGroup(group.ids)} aria-pressed={activeGroup === group.id}>{group.label}</button>)}</div>
          {(["Old Testament", "New Testament"] as const).map(testament => <div className="testament-block" key={testament}>
            <h3>{testament}</h3><div className="book-grid">{BOOKS.filter(book => book.testament === testament).map(book => <button key={book.id} type="button" disabled={!ready} className={selectedBooks.includes(book.id) ? "selected" : ""} onClick={() => onToggleBook(book.id)} aria-pressed={selectedBooks.includes(book.id)} aria-label={book.name}>{book.name}</button>)}</div>
          </div>)}
        </div>}
      </form>
      {!hasResults && <div className="example-row"><span>Try</span>{examples.map(example => <button key={example.label} type="button" disabled={!ready} onClick={() => onExample(example)}>{example.label}</button>)}</div>}
    </section>
  );
}
