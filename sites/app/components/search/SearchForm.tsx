import type { FormEvent } from "react";

import { BOOK_GROUPS, BOOKS, SEARCH_MODES, VERSIONS, modeDescription } from "@/app/search/catalog";
import type { SearchExample, SearchMode } from "@/app/search/types";

type Props = {
  query: string;
  mode: SearchMode;
  version: string;
  selectedBooks: number[];
  activeGroup: string;
  showBooks: boolean;
  caseSensitive: boolean;
  loading: boolean;
  ready: boolean;
  examples: SearchExample[];
  onQueryChange: (value: string) => void;
  onModeChange: (value: SearchMode) => void;
  onVersionChange: (value: string) => void;
  onCaseChange: (value: boolean) => void;
  onTogglePicker: () => void;
  onSelectGroup: (ids: readonly number[]) => void;
  onToggleBook: (id: number) => void;
  onSearch: (event: FormEvent) => void;
  onExample: (example: SearchExample) => void;
};

export function SearchForm({
  query,
  mode,
  version,
  selectedBooks,
  activeGroup,
  showBooks,
  caseSensitive,
  loading,
  ready,
  examples,
  onQueryChange,
  onModeChange,
  onVersionChange,
  onCaseChange,
  onTogglePicker,
  onSelectGroup,
  onToggleBook,
  onSearch,
  onExample,
}: Props) {
  return (
    <section className="search-card" aria-labelledby="search-heading">
      <div className="search-card-top">
        <div><p className="eyebrow">Begin your search</p><h2 id="search-heading">What are you looking for?</h2></div>
        <div className="edition-control">
          <label htmlFor="version">Edition</label>
          <select id="version" value={version} disabled={!ready} onChange={(event) => onVersionChange(event.target.value)}>
            {VERSIONS.map((item) => <option key={item.id} value={item.id}>{item.short} · {item.label}</option>)}
          </select>
        </div>
      </div>

      <form onSubmit={onSearch}>
        <fieldset className="mode-switcher" disabled={!ready}>
          <legend className="sr-only">Search mode</legend>
          {SEARCH_MODES.map((item) => (
            <button key={item.id} type="button" className={mode === item.id ? "active" : ""} onClick={() => onModeChange(item.id)} aria-pressed={mode === item.id}>{item.label}</button>
          ))}
        </fieldset>

        <div className="query-row">
          <label className="sr-only" htmlFor="query">Bible search query</label>
          <input
            id="query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={mode === "advanced" ? "Try: (faith + works), grace" : "Try: love mercy"}
            maxLength={120}
            autoComplete="off"
            disabled={!ready}
            aria-describedby="query-help"
          />
          <button className="search-button" type="submit" disabled={!ready || loading}>
            {loading ? <><span className="spinner" aria-hidden="true" /> Searching</> : <>Search <span aria-hidden="true">→</span></>}
          </button>
        </div>
        <div className="query-meta">
          <p id="query-help">{modeDescription(mode)}</p>
          <div className="query-options">
            <span className="keyboard-hint"><kbd>/</kbd> Focus search</span>
            <label className="check-control"><input type="checkbox" disabled={!ready} checked={caseSensitive} onChange={(event) => onCaseChange(event.target.checked)} /> Match case</label>
          </div>
        </div>

        <div className="book-filter" id="book-picker">
          <div className="book-filter-bar">
            <div className="group-pills" aria-label="Book collections">
              {BOOK_GROUPS.map((group) => (
                <button key={group.id} type="button" disabled={!ready} className={activeGroup === group.id ? "active" : ""} onClick={() => onSelectGroup(group.ids)} aria-pressed={activeGroup === group.id}>{group.label}</button>
              ))}
            </div>
            <button className="filter-toggle" type="button" disabled={!ready} onClick={onTogglePicker} aria-expanded={showBooks}>
              Choose books <span>{selectedBooks.length}/{BOOKS.length}</span> <span aria-hidden="true">{showBooks ? "−" : "+"}</span>
            </button>
          </div>
          {showBooks && (
            <div className="book-grid-wrap">
              {(["Old Testament", "New Testament"] as const).map((testament) => (
                <div key={testament} className="testament-block">
                  <h3>{testament}</h3>
                  <div className="book-grid">
                    {BOOKS.filter((book) => book.testament === testament).map((book) => (
                      <button key={book.id} type="button" disabled={!ready} className={selectedBooks.includes(book.id) ? "selected" : ""} onClick={() => onToggleBook(book.id)} aria-pressed={selectedBooks.includes(book.id)} aria-label={book.name}>{book.abbreviation}</button>
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
        {examples.map((example) => (
          <button key={example.label} type="button" disabled={!ready} onClick={() => onExample(example)}>{example.label} <span aria-hidden="true">↗</span></button>
        ))}
      </div>
    </section>
  );
}
