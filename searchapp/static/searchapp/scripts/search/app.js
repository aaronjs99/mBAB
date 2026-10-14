import { BookSelection } from "./book-selection.js";
import { byId, escapeHtml } from "./dom.js";
import { ResultExplorer } from "./result-explorer.js";
import { SavedVerses } from "./saved-verses.js";
import { SearchUi } from "./ui.js";

class SearchApp {
  constructor() {
    this.books = new BookSelection();
    this.saved = new SavedVerses();
    this.ui = new SearchUi();
    this.results = new ResultExplorer({
      saved: this.saved,
      ui: this.ui,
      getVersion: () => byId("versionSelect").value,
    });
  }

  initialize() {
    this.books.initialize();
    this.saved.render();
    this.ui.initialize();
    byId("caseInputToggle").addEventListener("change", (event) => {
      byId("caseInput").value = event.target.checked ? "True" : "False";
    });
    byId("resultsPerPage").addEventListener("change", () => this.results.renderCurrentPage());
    byId("searchInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter") void this.search();
    });
    byId("searchInput").addEventListener("focus", () => this.ui.showHistory());
    byId("searchInput").addEventListener("blur", () => window.setTimeout(() => this.ui.hideHistory(), 200));
    document.addEventListener("click", (event) => this.#handleClick(event));
    document.addEventListener("keydown", (event) => this.#handleKeydown(event));
    this.#restoreFromUrl();
  }

  async search() {
    const input = byId("searchInput");
    const query = input.value.trim();
    if (!query) {
      input.focus();
      this.ui.toast("Enter a word, phrase, or verse reference.", "error");
      return;
    }

    const version = byId("versionSelect").value;
    const caseSensitive = byId("caseInput").value;
    const bookMask = this.books.mask();
    byId("booksField").value = bookMask;
    this.ui.saveHistory(query);
    this.#showLoading();
    try {
      const params = new URLSearchParams({
        search: query,
        version,
        case: caseSensitive,
        books: bookMask,
      });
      const response = await fetch(`/ajax/search/?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Search failed with status ${response.status}.`);
      this.results.setResults(data.results);
      this.#showSearchOutcome(data);

      const url = new URL(window.location.href);
      url.searchParams.set("search", query);
      url.searchParams.set("version", version);
      url.searchParams.set("case", caseSensitive);
      url.searchParams.set("books", bookMask);
      window.history.replaceState({}, "", url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed.";
      byId("loadingSkeleton").classList.add("hidden");
      this.#showEmpty(`<div class="py-10 text-red-500"><p class="text-xl font-bold mb-2">Search unavailable</p><p class="text-sm font-mono bg-red-50 dark:bg-red-900/20 p-2 rounded inline-block">${escapeHtml(message)}</p></div>`);
    }
  }

  #showLoading() {
    byId("verseResults").innerHTML = "";
    byId("resultsHeader").classList.add("hidden");
    byId("loadingSkeleton").classList.remove("hidden");
  }

  #showSearchOutcome(data) {
    byId("loadingSkeleton").classList.add("hidden");
    const expressionEditor = byId("sqlEditorContainer");
    if (data.generated_sql) {
      expressionEditor.classList.remove("hidden");
      byId("sqlInput").value = data.generated_sql;
    } else expressionEditor.classList.add("hidden");

    if (this.results.count) {
      byId("resultsHeader").classList.remove("hidden");
      byId("resultCount").textContent = String(this.results.count);
    } else {
      this.#showEmpty('<div class="py-10"><p class="text-xl text-slate-500">No matches found.</p></div>');
    }
  }

  #showEmpty(html) {
    const empty = document.createElement("div");
    empty.id = "emptyState";
    empty.className = "text-center py-20 opacity-60";
    empty.innerHTML = html;
    const container = byId("verseResults");
    container.innerHTML = "";
    container.appendChild(empty);
  }

  #reset() {
    this.books.reset();
    byId("versionSelect").value = "KJV";
    byId("caseInput").value = "False";
    byId("caseInputToggle").checked = false;
    byId("searchInput").value = "";
    byId("searchInput").focus();
  }

  #restoreFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("search")) return;
    byId("searchInput").value = params.get("search") || "";
    byId("versionSelect").value = params.get("version") || "KJV";
    const caseSensitive = params.get("case") === "True";
    byId("caseInput").value = caseSensitive ? "True" : "False";
    byId("caseInputToggle").checked = caseSensitive;
    this.books.restoreMask(params.get("books"));
    void this.search();
  }

  #handleClick(event) {
    const backdrop = event.target.closest?.("[data-dismiss]");
    if (backdrop && event.target === backdrop) this.#closeModal(backdrop.dataset.dismiss);
    const control = event.target.closest?.("[data-action]");
    if (!control) return;
    const { action } = control.dataset;
    const ids = control.dataset.ids ? JSON.parse(control.dataset.ids) : [];
    const index = Number.parseInt(control.dataset.index, 10);

    if (action === "home") window.location.assign("/");
    else if (action === "toggle-sidebar") this.ui.toggleSidebar();
    else if (action === "font") this.ui.changeFontSize(Number(control.dataset.delta));
    else if (action === "toggle-theme") this.ui.toggleTheme();
    else if (action === "open-demo") this.ui.openDemo();
    else if (action === "close-demo") this.ui.closeDemo();
    else if (action === "close-feature") this.ui.closeFeature();
    else if (action === "reset") this.#reset();
    else if (action === "toggle-book") this.books.toggleBook(Number(control.dataset.bookId));
    else if (action === "toggle-section") this.books.toggleSection(ids);
    else if (action === "only-section") this.books.selectOnly(ids);
    else if (action === "toggle-testament") this.books.toggleTestament(control.dataset.testament);
    else if (action === "search") void this.search();
    else if (action === "run-expression") {
      byId("searchInput").value = byId("sqlInput").value;
      void this.search();
    } else if (action === "clear-history") this.ui.clearHistory();
    else if (action === "select-history") {
      byId("searchInput").value = control.dataset.query;
      this.ui.hideHistory();
      void this.search();
    } else if (action === "remove-saved") {
      this.saved.remove(control.dataset.reference);
      this.results.renderCurrentPage();
    } else if (["copy-result", "save-result", "explain-result", "chapter-result"].includes(action)) {
      void this.results.handleAction(action, index);
    }
  }

  #handleKeydown(event) {
    const input = byId("searchInput");
    if (event.key === "/" && document.activeElement !== input) {
      event.preventDefault();
      input.focus();
    }
    if (event.key === "Escape") {
      this.ui.hideHistory();
      byId("sidebar").classList.add("-translate-x-full");
      this.ui.closeDemo();
      this.ui.closeFeature();
      input.blur();
    }
  }

  #closeModal(id) {
    if (id === "demoModal") this.ui.closeDemo();
    if (id === "featureModal") this.ui.closeFeature();
  }
}

function startSearchApp() {
  new SearchApp().initialize();
  document.documentElement.dataset.mbabReady = "true";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startSearchApp, { once: true });
} else {
  startSearchApp();
}
