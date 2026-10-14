import { useState } from "react";
import { BOOKS } from "@/app/search/catalog";
import type { BookMatchCount } from "@/app/search/types";

type Props = {
  counts: BookMatchCount[];
  total: number;
  loading: boolean;
  canNarrow: boolean;
  onNarrow: (bookId: number) => void;
};

export function BookOverview({ counts, total, loading, canNarrow, onNarrow }: Props) {
  const [expanded, setExpanded] = useState(false);
  const ranked = [...counts].sort((left, right) => right.count - left.count || left.bookId - right.bookId);
  const shown = expanded ? ranked : ranked.slice(0, 8);
  return (
    <details className="book-overview">
      <summary className="book-overview-summary">
        <span>Matches by book</span>
        <span className="book-overview-count">{counts.length} {counts.length === 1 ? "book" : "books"}</span>
      </summary>
      <div className="book-overview-content" role="region" aria-label="Matches by book">
        <p className="book-overview-caption">{total.toLocaleString()} matched {total === 1 ? "verse" : "verses"}</p>
        <div className="book-match-list" id="book-overview-list">
          {shown.map(item => {
            const book = BOOKS[item.bookId];
            const label = `${book.name}: ${item.count} matched ${item.count === 1 ? "verse" : "verses"}`;
            return <button
              className="book-match" key={item.bookId} type="button" disabled={loading || !canNarrow}
              aria-label={canNarrow ? `Narrow to ${label}` : label}
              onClick={() => onNarrow(item.bookId)}
            ><span>{book.name}</span><strong>{item.count.toLocaleString()}</strong></button>;
          })}
        </div>
        {counts.length > 8 && <button className="text-button book-overview-more" type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="book-overview-list">{expanded ? "Show fewer books" : `Show all ${counts.length} books`}</button>}
      </div>
    </details>
  );
}
