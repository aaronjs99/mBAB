import type { SearchResult } from "@/app/search/types";
import { VerseText } from "./VerseText";

type Props = {
  items: SearchResult[];
  onClose: () => void;
  onRemove: (item: SearchResult) => void;
  onRead: (item: SearchResult) => void;
};

export function SavedTray({ items, onClose, onRemove, onRead }: Props) {
  return (
    <section className="saved-tray" aria-label="Saved verses">
      <div className="saved-tray-head">
        <div><h2>Saved verses</h2><p>On this device</p></div>
        <button className="text-button" type="button" onClick={onClose}>Close</button>
      </div>
      {items.length ? (
        <div className="saved-grid">
          {items.map((item) => (
            <article key={`${item.version}:${item.ref}`} className="saved-card">
              <p className="result-ref">{item.ref} <span>{item.version}</span></p>
              <p><VerseText text={item.text} /></p>
              <div className="saved-tools"><button className="text-button" type="button" onClick={() => onRead(item)}>Read in context</button><button className="text-button danger" type="button" onClick={() => onRemove(item)}>Remove</button></div>
            </article>
          ))}
        </div>
      ) : <p className="empty-copy">No saved verses yet.</p>}
    </section>
  );
}
