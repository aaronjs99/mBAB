import { BOOK_GROUPS, BOOKS } from "@/app/search/catalog";

type Props = {
  selectedBooks: number[];
  activeGroup: string;
  ready: boolean;
  onSelectGroup: (ids: readonly number[]) => void;
  onToggleBook: (id: number) => void;
  onClose?: () => void;
  onReset?: () => void;
};

export function BookPicker({ selectedBooks, activeGroup, ready, onSelectGroup, onToggleBook, onClose, onReset }: Props) {
  return (
    <div className="book-filter">
      <div className="book-filter-bar">
        <h2>Books <span>{selectedBooks.length}/{BOOKS.length}</span></h2>
        {onReset && <button className="text-button book-reset" type="button" disabled={!ready} onClick={onReset}>Reset filters</button>}
        {onClose && <button className="text-button book-picker-close" type="button" onClick={onClose}>Done</button>}
      </div>
      <div className="group-pills" aria-label="Book collections">
        {BOOK_GROUPS.map(group => <button key={group.id} type="button" disabled={!ready} className={activeGroup === group.id ? "active" : ""} onClick={() => onSelectGroup(group.ids)} aria-pressed={activeGroup === group.id}>{group.label}</button>)}
      </div>
      {(["Old Testament", "New Testament"] as const).map(testament => (
        <div className="testament-block" key={testament}>
          <h3>{testament}</h3>
          <div className="book-grid">
            {BOOKS.filter(book => book.testament === testament).map(book => (
              <button key={book.id} type="button" disabled={!ready} className={selectedBooks.includes(book.id) ? "selected" : ""} onClick={() => onToggleBook(book.id)} aria-pressed={selectedBooks.includes(book.id)} aria-label={book.name}>{book.name}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
