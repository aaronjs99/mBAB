import { byId, escapeHtml, verseText } from "./dom.js";

const CHAPTER_ICON = '<svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>';
const INSIGHT_ICON = '<svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>';
const LOADING_HTML = '<div class="animate-pulse space-y-3"><div class="h-4 bg-slate-200 rounded w-3/4"></div><div class="h-4 bg-slate-200 rounded w-full"></div><div class="h-4 bg-slate-200 rounded w-5/6"></div></div>';

export class ResultExplorer {
  #results = [];
  #currentPage = 1;
  #explanationCache = new Map();

  constructor({ saved, ui, getVersion }) {
    this.saved = saved;
    this.ui = ui;
    this.getVersion = getVersion;
  }

  setResults(results) {
    this.#results = Array.isArray(results) ? results : [];
    this.#explanationCache.clear();
    if (this.#results.length) this.renderPage(1);
  }

  get count() {
    return this.#results.length;
  }

  renderCurrentPage() {
    if (this.#results.length) this.renderPage(this.#currentPage);
  }

  renderPage(page) {
    const perPage = this.#resultsPerPage();
    const totalPages = Math.max(1, Math.ceil(this.#results.length / perPage));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * perPage;
    const rows = this.#results.slice(start, start + perPage);
    byId("verseResults").innerHTML = rows.map((row, index) => this.#card(row, start + index)).join("");
    this.#updatePagination(safePage, totalPages);
    this.#currentPage = safePage;
    if (safePage > 1) byId("resultsContainer").scrollTop = 0;
  }

  async handleAction(action, index) {
    if (action === "copy-result") await this.copy(index);
    else if (action === "save-result") this.toggleSaved(index);
    else if (action === "explain-result") await this.openExplanation(index);
    else if (action === "chapter-result") await this.openChapter(index);
  }

  async copy(index) {
    const row = this.#results[index];
    if (!row) return;
    const reference = `${row.Book} ${row.Chapter}:${row.Versecount}`;
    try {
      await navigator.clipboard.writeText(`${reference} - ${verseText(row)}`);
      this.ui.toast("Copied to clipboard!");
    } catch {
      this.ui.toast("Copy is unavailable in this browser.", "error");
    }
  }

  toggleSaved(index) {
    const row = this.#results[index];
    if (!row) return;
    const saved = this.saved.toggle(row);
    this.ui.toast(saved ? "Saved on this device" : "Removed from saved verses");
    this.renderCurrentPage();
  }

  async openExplanation(index) {
    const row = this.#results[index];
    if (!row) return;
    const reference = `${row.Book} ${row.Chapter}:${row.Versecount}`;
    const text = verseText(row);
    this.ui.openFeature("Theological insight", INSIGHT_ICON, LOADING_HTML);
    if (this.#explanationCache.has(reference)) {
      byId("modalContent").innerHTML = `<p class="text-slate-700 dark:text-slate-300 text-lg leading-relaxed">${escapeHtml(this.#explanationCache.get(reference))}</p>`;
      return;
    }
    try {
      const response = await fetch(`/explain/?${new URLSearchParams({ ref: reference, text })}`);
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Explanation unavailable.");
      this.#explanationCache.set(reference, data.explanation);
      byId("modalContent").innerHTML = `<p class="text-slate-700 dark:text-slate-300 text-lg leading-relaxed">${escapeHtml(data.explanation)}</p>`;
    } catch {
      byId("modalContent").innerHTML = '<p class="text-red-500">The explanation service is unavailable right now.</p>';
    }
  }

  async openChapter(index) {
    const row = this.#results[index];
    if (!row) return;
    const book = row.Book;
    const chapter = String(row.Chapter);
    const targetVerse = Number(row.Versecount);
    this.ui.openFeature(`${book} ${chapter}`, CHAPTER_ICON, LOADING_HTML);
    try {
      const params = new URLSearchParams({ book, chapter, version: this.getVersion() });
      const response = await fetch(`/chapter/?${params}`);
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Chapter unavailable.");
      const verses = data.verses.map((verse) => {
        const selected = Number(verse.verse) === targetVerse;
        const selectedClass = selected ? "bg-indigo-50 dark:bg-indigo-900/30 -mx-2 px-2 rounded border-l-4 border-indigo-500" : "";
        return `<div class="mb-2 ${selectedClass}" id="v${escapeHtml(verse.verse)}"><span class="text-xs font-bold text-slate-400 select-none mr-1">${escapeHtml(verse.verse)}</span><span class="text-slate-700 dark:text-slate-300">${escapeHtml(verse.text)}</span></div>`;
      }).join("");
      byId("modalContent").innerHTML = `<div class="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">${verses}</div>`;
      window.setTimeout(() => document.getElementById(`v${targetVerse}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 100);
    } catch {
      byId("modalContent").innerHTML = '<p class="text-red-500">The chapter could not be loaded.</p>';
    }
  }

  #card(row, index) {
    const reference = `${row.Book} ${row.Chapter}:${row.Versecount}`;
    const saved = this.saved.has(reference);
    const parts = typeof row.verse === "string" ? [{ text: row.verse }] : row.verse;
    const verse = parts.map((part) => part.highlight
      ? `<mark class="bg-yellow-200 dark:bg-yellow-900/60 text-yellow-900 dark:text-yellow-100 font-medium px-1 rounded mx-0.5 shadow-sm">${escapeHtml(part.highlight)}</mark>`
      : escapeHtml(part.text || "")).join("");
    return `
      <article class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
        <div class="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex items-baseline justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
          <h3 class="font-bold text-lg text-indigo-700 dark:text-indigo-400 font-sans tracking-tight">${escapeHtml(row.Book)} <span class="text-slate-500 dark:text-slate-500 ml-1">${escapeHtml(row.Chapter)}:${escapeHtml(row.Versecount)}</span></h3>
          <div class="flex gap-2">
            ${this.#tool("chapter-result", index, "Read chapter", "text-slate-400 hover:text-indigo-500", '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>')}
            ${this.#tool("explain-result", index, "Explain with AI", "text-slate-400 hover:text-amber-500", '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>')}
            ${this.#tool("copy-result", index, "Copy", "text-slate-400 hover:text-emerald-500", '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>')}
            <button type="button" data-action="save-result" data-index="${index}" class="${saved ? "text-red-500" : "text-slate-400 hover:text-red-500"} transition-colors" title="Save verse" aria-pressed="${saved}"><svg class="w-4 h-4" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg></button>
          </div>
        </div>
        <p class="verse-text text-lg text-slate-800 dark:text-slate-200 leading-relaxed">${verse}</p>
      </article>`;
  }

  #tool(action, index, title, color, path) {
    return `<button type="button" data-action="${action}" data-index="${index}" class="${color} transition-colors" title="${title}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">${path}</svg></button>`;
  }

  #resultsPerPage() {
    const value = byId("resultsPerPage").value;
    return value === "All" ? Math.max(this.#results.length, 1) : Number.parseInt(value, 10);
  }

  #updatePagination(page, totalPages) {
    byId("pageInfoTop").textContent = `${page} / ${totalPages}`;
    byId("paginationControlsBottom").classList.toggle("hidden", totalPages <= 1);
    for (const id of ["prevPageTop", "prevPageBottom"]) {
      const button = byId(id);
      button.disabled = page === 1;
      button.onclick = () => this.renderPage(page - 1);
    }
    for (const id of ["nextPageTop", "nextPageBottom"]) {
      const button = byId(id);
      button.disabled = page === totalPages;
      button.onclick = () => this.renderPage(page + 1);
    }
  }
}
