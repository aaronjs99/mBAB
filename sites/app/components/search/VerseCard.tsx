import type { SearchResult } from "@/app/search/types";
import { VerseText } from "./VerseText";

type Props = {
  result: SearchResult;
  query: string;
  caseSensitive: boolean;
  isSaved: boolean;
  onRead: () => void;
  onCopy: (value: string, success: string) => void;
  onToggleSaved: (result: SearchResult) => void;
};

export function VerseCard({ result, query, caseSensitive, isSaved, onRead, onCopy, onToggleSaved }: Props) {
  return (
    <article className="result-card">
      <div className="result-content">
        <p className="result-ref">{result.ref} <span>{result.version}</span></p>
        <blockquote><VerseText text={result.text} query={query} caseSensitive={caseSensitive} /></blockquote>
        <div className="result-tools">
          <button type="button" aria-label="Read in context" onClick={onRead}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z" /></svg>Read
          </button>
          <button type="button" onClick={() => onCopy(`${result.ref} (${result.version}) — ${result.text}`, `${result.ref} copied.`)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>Copy
          </button>
          <button type="button" className={isSaved ? "saved" : ""} onClick={() => onToggleSaved(result)} aria-pressed={isSaved}>
            <svg viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4-6 4Z" /></svg>{isSaved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </article>
  );
}
