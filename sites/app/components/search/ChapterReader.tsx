import { useEffect, useRef } from "react";
import { VERSIONS } from "@/app/search/catalog";
import type { ChapterState, ReaderSelection } from "@/app/search/use-chapter-reader";
import { VerseText } from "./VerseText";

type Props = {
  selection: ReaderSelection;
  chapter: ChapterState;
  comparison: ChapterState;
  comparisonVersion: string;
  expanded: boolean;
  onCompare: (version: string) => void;
  onExpand: (expanded: boolean) => void;
  onClose: () => void;
};

export function ChapterReader({ selection, chapter, comparison, comparisonVersion, expanded, onCompare, onExpand, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { result, query, caseSensitive } = selection;
  const title = `${result.book} ${result.chapter}`;
  const edition = VERSIONS.find(item => item.id === result.version)!;
  const comparedEdition = VERSIONS.find(item => item.id === comparisonVersion);
  const primary = new Map(chapter.data?.verses.map(verse => [verse.verse, verse.text]));
  const secondary = new Map(comparison.data?.verses.map(verse => [verse.verse, verse.text]));
  const verseNumbers = [...new Set([...primary.keys(), ...secondary.keys()])]
    .filter(verse => expanded || Math.abs(verse - result.verse) <= 2)
    .sort((left, right) => left - right);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const body = bodyRef.current;
      const verse = body?.querySelector<HTMLElement>(".reader-verse.current");
      if (body && verse) body.scrollTop = verse.offsetTop - Math.max(12, (body.clientHeight - verse.clientHeight) / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [chapter.data, comparison.data, comparisonVersion, expanded]);

  return (
    <dialog
      className="chapter-reader" ref={dialogRef} aria-labelledby="reader-heading" aria-describedby="reader-description"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), select:not([disabled]), a[href], [tabindex='0']")]
          .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
        const boundary = event.shiftKey ? controls[0] : controls.at(-1);
        if (document.activeElement === boundary) {
          event.preventDefault();
          (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
        }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <header className="reader-header">
        <div><h2 id="reader-heading">{title}<span className="sr-only"> · Read in context</span></h2></div>
        <button className="reader-close" type="button" onClick={onClose} aria-label="Close reader"><span aria-hidden="true">×</span></button>
        <p id="reader-description">{edition.label} · Verse {result.verse}</p>
      </header>
      <div className="reader-controls">
        <div className="reader-scope">
          <button type="button" disabled={!chapter.data} aria-pressed={expanded} onClick={() => onExpand(!expanded)}>{expanded ? "Back to nearby verses" : "Read full chapter"}</button>
        </div>
        <label className="reader-compare-label"><span className="sr-only">Compare edition</span>
          <select value={comparisonVersion} disabled={!chapter.data} onChange={event => onCompare(event.target.value)}>
            <option value="">Compare editions</option>
            {VERSIONS.filter(item => item.id !== result.version).map(item => <option key={item.id} value={item.id}>{item.short} · {item.label}</option>)}
          </select>
        </label>
      </div>
      {comparedEdition && (comparison.loading || comparison.error) && (
        <div className="reader-comparison">
          <strong>{comparedEdition.label}</strong>
          {comparison.loading && <p role="status"><span className="spinner" aria-hidden="true" /> Loading comparison…</p>}
          {comparison.error && <div role="alert"><p>{comparison.error}</p>{comparison.retryable && <button type="button" onClick={comparison.retry}>Retry comparison</button>}</div>}
        </div>
      )}
      <div className="reader-body" ref={bodyRef} tabIndex={0} aria-label="Chapter verses" aria-busy={chapter.loading}>
        {comparison.data && comparedEdition && <div className="reader-column-heads"><span>{edition.label}</span><span>{comparedEdition.label}</span></div>}
        {chapter.loading && <p className="reader-message" role="status"><span className="spinner" aria-hidden="true" /> Loading {title}…</p>}
        {chapter.error && <div className="reader-message" role="alert"><p>{chapter.error}</p>{chapter.retryable && <button type="button" onClick={chapter.retry}>Retry chapter</button>}</div>}
        {chapter.data && !primary.has(result.verse) && <p role="status">The selected verse is not present in this chapter text.</p>}
        {chapter.data && <div className={`reader-verses${comparisonVersion ? " comparing" : ""}`}>
          {verseNumbers.map(verse => (
            <article className={`reader-verse${verse === result.verse ? " current" : ""}`} key={verse} data-verse={verse} aria-current={verse === result.verse ? "location" : undefined}>
              <div className="reader-verse-number"><span>{verse}</span></div>
              <p className="reader-primary"><span className="reader-edition">{result.version}</span>{primary.has(verse)
                ? <VerseText text={primary.get(verse)!} query={query} caseSensitive={caseSensitive} />
                : <em>This verse is not present in this edition.</em>}</p>
              {comparisonVersion && <p className="reader-secondary"><span className="reader-edition">{comparisonVersion}</span>{comparison.data
                ? secondary.has(verse) ? <VerseText text={secondary.get(verse)!} /> : <em>This verse is not present in this edition.</em>
                : <span className="reader-pending">{comparison.loading ? "Loading…" : "Comparison unavailable."}</span>}</p>}
            </article>
          ))}
        </div>}
      </div>
      <p className="reader-footnote">{result.ref} · {result.version}{comparisonVersion ? ` / ${comparisonVersion}` : ""} <span><kbd>Esc</kbd></span></p>
    </dialog>
  );
}
