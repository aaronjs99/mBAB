import type { SearchResult } from "@/app/search/types";
import { HighlightedText } from "./HighlightedText";

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
        <blockquote><HighlightedText text={result.text} query={query} caseSensitive={caseSensitive} /></blockquote>
        <div className="result-tools">
          <button type="button" aria-label="Read in context" onClick={onRead}>Read</button>
          <button type="button" onClick={() => onCopy(`${result.ref} (${result.version}) — ${result.text}`, `${result.ref} copied.`)}>Copy</button>
          <button type="button" className={isSaved ? "saved" : ""} onClick={() => onToggleSaved(result)} aria-pressed={isSaved}>{isSaved ? "Saved" : "Save"}</button>
        </div>
      </div>
    </article>
  );
}
