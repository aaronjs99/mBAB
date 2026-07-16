import type { SearchResult } from "@/app/search/types";

type Props = {
  items: SearchResult[];
  onClose: () => void;
  onRemove: (item: SearchResult) => void;
};

export function SavedTray({ items, onClose, onRemove }: Props) {
  return (
    <section className="saved-tray" aria-label="Saved verses">
      <div className="saved-tray-head">
        <div><p className="eyebrow">Your reading desk</p><h2>Saved on this device</h2></div>
        <button className="text-button" type="button" onClick={onClose}>Close</button>
      </div>
      {items.length ? (
        <div className="saved-grid">
          {items.map((item) => (
            <article key={`${item.version}:${item.ref}`} className="saved-card">
              <p className="result-ref">{item.ref} <span>{item.version}</span></p>
              <p>{item.text}</p>
              <button className="text-button danger" type="button" onClick={() => onRemove(item)}>Remove</button>
            </article>
          ))}
        </div>
      ) : <p className="empty-copy">Save a verse from any result and it will wait here for you.</p>}
    </section>
  );
}
