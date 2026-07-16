import { escapeHtml, readStoredArray, verseText } from "./dom.js";

const STORAGE_KEY = "favorites";

export class SavedVerses {
  #items = readStoredArray(STORAGE_KEY);

  has(reference) {
    return this.#items.some((item) => item.ref === reference);
  }

  toggle(row) {
    const reference = `${row.Book} ${row.Chapter}:${row.Versecount}`;
    const index = this.#items.findIndex((item) => item.ref === reference);
    if (index >= 0) {
      this.#items.splice(index, 1);
      this.#persist();
      return false;
    }
    this.#items.unshift({
      ref: reference,
      text: verseText(row),
      timestamp: Date.now(),
    });
    this.#items = this.#items.slice(0, 100);
    this.#persist();
    return true;
  }

  remove(reference) {
    this.#items = this.#items.filter((item) => item.ref !== reference);
    this.#persist();
  }

  render() {
    const container = document.getElementById("favoritesList");
    const count = document.getElementById("favCount");
    if (count) count.textContent = String(this.#items.length);
    if (!container) return;
    if (!this.#items.length) {
      container.innerHTML = '<div class="text-slate-400 text-sm text-center italic py-4">No saved verses yet</div>';
      return;
    }
    container.innerHTML = this.#items.map((item) => `
      <article class="mb-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 hover:shadow-sm transition-shadow group relative">
        <div class="flex justify-between items-baseline mb-1">
          <span class="font-bold text-indigo-600 dark:text-indigo-400 text-xs">${escapeHtml(item.ref)}</span>
          <button type="button" data-action="remove-saved" data-reference="${escapeHtml(item.ref)}" class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Remove ${escapeHtml(item.ref)}">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</p>
      </article>
    `).join("");
  }

  #persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#items));
    this.render();
  }
}
