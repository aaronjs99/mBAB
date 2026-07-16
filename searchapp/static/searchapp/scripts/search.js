let allResults = [];
let currentPage = 1;
let explanationCache = Object.create(null);
const bookBits = new Array(66).fill(0);
const bookIdToIndex = Object.create(null);

const searchInput = document.getElementById("searchInput");
const booksField = document.getElementById("booksField");
const verseResults = document.getElementById("verseResults");
const loadingSkeleton = document.getElementById("loadingSkeleton");
const resultsHeader = document.getElementById("resultsHeader");
const emptyState = document.getElementById("emptyState");
const caseInput = document.getElementById("caseInput");
const caseInputToggle = document.getElementById("caseInputToggle");

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "dark";
  setTheme(savedTheme);
  renderFavoritesList();

  document.querySelectorAll(".toggle-book").forEach((btn, idx) => {
    const bookId = Number.parseInt(btn.dataset.bookId, 10);
    bookIdToIndex[bookId] = idx;
    if (btn.classList.contains("selected")) bookBits[idx] = 1;
  });

  refreshSectionTexts();
  restoreFromURL();

  caseInputToggle.addEventListener("change", (e) => {
    caseInput.value = e.target.checked ? "True" : "False";
  });
});

async function triggerSearch() {
  const keyword = searchInput.value.trim();
  const version = document.getElementById("versionSelect").value;
  const caseSensitive = caseInput.value;

  if (!keyword) {
    searchInput.focus();
    showToast("Enter a word, phrase, or verse reference.", "error");
    return;
  }

  const bits = [...bookBits].reverse().join("");
  booksField.value = BigInt("0b" + bits).toString();

  saveToHistory(keyword);
  verseResults.innerHTML = "";
  emptyState.classList.add("hidden");
  resultsHeader.classList.add("hidden");
  loadingSkeleton.classList.remove("hidden");

  explanationCache = Object.create(null);

  try {
    const params = new URLSearchParams({
      search: keyword,
      version,
      case: caseSensitive,
      books: booksField.value,
    });
    const response = await fetch(`/ajax/search/?${params}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data.error || `Search failed with status ${response.status}.`,
      );
    }

    allResults = Array.isArray(data.results) ? data.results : [];

    const sqlContainer = document.getElementById("sqlEditorContainer");
    if (data.generated_sql) {
      sqlContainer.classList.remove("hidden");
      document.getElementById("sqlInput").value = data.generated_sql;
    } else {
      sqlContainer.classList.add("hidden");
    }

    loadingSkeleton.classList.add("hidden");
    if (allResults.length > 0) {
      resultsHeader.classList.remove("hidden");
      document.getElementById("resultCount").textContent = allResults.length;
      renderPage(1);
    } else {
      emptyState.classList.remove("hidden");
      emptyState.innerHTML = `<div class="py-10"><p class="text-xl text-slate-500">No matches found.</p></div>`;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("search", keyword);
    url.searchParams.set("version", version);
    url.searchParams.set("case", caseSensitive);
    url.searchParams.set("books", booksField.value);
    window.history.pushState({}, "", url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    loadingSkeleton.classList.add("hidden");
    emptyState.classList.remove("hidden");
    emptyState.innerHTML = `<div class="py-10 text-red-500"><p class="text-xl font-bold mb-2">Search unavailable</p><p class="text-sm font-mono bg-red-50 dark:bg-red-900/20 p-2 rounded inline-block">${escapeHtml(message)}</p></div>`;
  }
}

function runCustomSQL() {
  const sql = document.getElementById("sqlInput").value;
  if (sql) {
    searchInput.value = sql;
    triggerSearch();
  }
}

function renderPage(page) {
  const container = document.getElementById("verseResults");
  container.innerHTML = "";
  const resultsPerPage = getResultsPerPage();
  const totalPages = Math.max(1, Math.ceil(allResults.length / resultsPerPage));

  const start = (page - 1) * resultsPerPage;
  const end = start + resultsPerPage;
  const slice = allResults.slice(start, end);

  slice.forEach((row, index) => {
    const card = document.createElement("div");
    card.className =
      "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group";

    const fullRef = `${row.Book} ${row.Chapter}:${row.Versecount}`;
    const safeBook = escapeHtml(row.Book);
    const safeChapter = escapeHtml(row.Chapter);
    const safeVerse = escapeHtml(row.Versecount);
    const isFav = isFavorite(fullRef);
    const favColorClass = isFav
      ? "text-red-500"
      : "text-slate-400 hover:text-red-500";
    const favFill = isFav ? "currentColor" : "none";

    card.innerHTML = `
         <div class="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
         <div class="flex items-baseline justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 class="font-bold text-lg text-indigo-700 dark:text-indigo-400 font-sans tracking-tight">
               ${safeBook} <span class="text-slate-500 dark:text-slate-500 ml-1">${safeChapter}:${safeVerse}</span>
            </h3>
            <div class="flex gap-2">
                <button class="text-slate-400 hover:text-indigo-500 transition-colors" title="Read Chapter" onclick="openChapter(${start + index})">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                </button>
                <button class="text-slate-400 hover:text-amber-500 transition-colors" title="Explain with AI" onclick="openExplain(${start + index})">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </button>
                <button class="text-slate-400 hover:text-emerald-500 transition-colors" title="Copy" onclick="copyVerse(${start + index})">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                </button>
                <button class="${favColorClass} transition-colors" title="Save Verse" onclick="toggleFavorite(${start + index})">
                   <svg class="w-4 h-4" fill="${favFill}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                </button>
            </div>
         </div>
         <p class="verse-text text-lg text-slate-800 dark:text-slate-200 leading-relaxed">
            ${row.verse
              .map((part) =>
                part.highlight
                  ? `<span class="bg-yellow-200 dark:bg-yellow-900/60 text-yellow-900 dark:text-yellow-100 font-medium px-1 rounded mx-0.5 shadow-sm">${escapeHtml(part.highlight)}</span>`
                  : escapeHtml(part.text),
              )
              .join("")}
         </p>
      `;
    container.appendChild(card);
  });

  updatePaginationHandlers(page, totalPages);

  currentPage = page;
  // Scroll to top of results
  if (page > 1) document.getElementById("resultsContainer").scrollTop = 0;
}

function updatePaginationHandlers(page, totalPages) {
  const pageStr = `${page} / ${totalPages}`;
  const tops = document.getElementById("pageInfoTop");
  if (tops) tops.textContent = pageStr;

  const prevBtns = [
    document.getElementById("prevPageTop"),
    document.getElementById("prevPageBottom"),
  ];
  const nextBtns = [
    document.getElementById("nextPageTop"),
    document.getElementById("nextPageBottom"),
  ];

  const bottomControls = document.getElementById("paginationControlsBottom");
  if (bottomControls)
    bottomControls.classList.toggle("hidden", totalPages <= 1);

  prevBtns.forEach((b) => {
    if (b) {
      b.disabled = page === 1;
      b.onclick = () => renderPage(page - 1);
    }
  });
  nextBtns.forEach((b) => {
    if (b) {
      b.disabled = page === totalPages;
      b.onclick = () => renderPage(page + 1);
    }
  });
}

function copyVerse(index) {
  const row = allResults[index];
  if (!row) return;

  const ref = `${row.Book} ${row.Chapter}:${row.Versecount}`;
  const text = row.verse.map((p) => p.highlight || p.text).join("");

  navigator.clipboard.writeText(`${ref} - ${text}`);
  showToast("Copied to clipboard!");
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (window.innerWidth >= 768) {
    sidebar.classList.toggle("md:translate-x-0");
  } else {
    sidebar.classList.toggle("-translate-x-full");
  }
}

let currentFontSize = 100;
function changeFontSize(delta) {
  currentFontSize = Math.max(80, Math.min(150, currentFontSize + delta));
  document.documentElement.style.fontSize = (currentFontSize / 100) * 16 + "px";
  document.getElementById("fontDisplay").textContent = currentFontSize + "%";
}

function setTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);

  const btn = document.getElementById("themeToggleBtn");
  btn.onclick = () => setTheme(theme === "dark" ? "" : "dark");
}

function resetFilters() {
  bookBits.fill(0);
  document.querySelectorAll(".toggle-book").forEach((b) => {
    b.classList.remove("selected");
    b.classList.add("deselected");
  });
  document.getElementById("versionSelect").value = "KJV";
  caseInput.value = "False";
  caseInputToggle.checked = false;
  searchInput.value = "";
  searchInput.focus();
}

function getResultsPerPage() {
  const val = document.getElementById("resultsPerPage").value;
  return val === "All"
    ? Math.max(allResults.length, 1)
    : Number.parseInt(val, 10);
}

window.toggleBook = function (id) {
  const idx = bookIdToIndex[id];
  if (idx === undefined) return;
  bookBits[idx] ^= 1;
  updateBookBtn(id, bookBits[idx]);
  refreshSectionTexts();
};

window.toggleSection = function (ids) {
  const allSelected = ids.every((id) => bookBits[bookIdToIndex[id]] === 1);
  const expected = allSelected ? 0 : 1;
  ids.forEach((id) => {
    bookBits[bookIdToIndex[id]] = expected;
    updateBookBtn(id, expected);
  });
  refreshSectionTexts();
};

window.selectOnlySection = function (ids) {
  bookBits.fill(0);
  document.querySelectorAll(".toggle-book").forEach((btn, idx) => {
    bookBits[idx] = 0;
    updateBookBtn(Number.parseInt(btn.dataset.bookId, 10), 0);
  });
  ids.forEach((id) => {
    bookBits[bookIdToIndex[id]] = 1;
    updateBookBtn(id, 1);
  });
  refreshSectionTexts();
};

window.refreshSectionTexts = function () {
  document.querySelectorAll("[data-section-ids]").forEach((el) => {
    const idsStr = el.dataset.sectionIds;
    const ids = JSON.parse(idsStr);
    const allSelected = ids.every((id) => bookBits[bookIdToIndex[id]] === 1);
    const textSpan = el.querySelector(".section-toggle-text");
    if (textSpan) {
      textSpan.textContent = allSelected ? "Deselect All" : "Select All";
    }
  });
};

window.toggleTestament = function (type) {
  const ranges = { ot: [0, 39], nt: [39, 66], bib: [0, 66] };
  const [start, end] = ranges[type];

  let allSelected = true;
  for (let i = start; i < end; i++) {
    if (bookBits[i] === 0) {
      allSelected = false;
      break;
    }
  }
  const expected = allSelected ? 0 : 1;

  for (let i = start; i < end; i++) {
    bookBits[i] = expected;
  }
  const buttons = document.querySelectorAll(".toggle-book");
  buttons.forEach((btn, idx) => {
    if (idx >= start && idx < end)
      updateBookBtn(Number.parseInt(btn.dataset.bookId, 10), expected);
  });
  refreshSectionTexts();
};

function updateBookBtn(id, status) {
  const btn = document.querySelector(`.toggle-book[data-book-id="${id}"]`);
  if (btn) {
    btn.classList.toggle("selected", status === 1);
    btn.classList.toggle("deselected", status === 0);
  }
}

function restoreFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("search")) {
    searchInput.value = params.get("search");
    document.getElementById("versionSelect").value =
      params.get("version") || "KJV";

    const caseSens = params.get("case") === "True";
    caseInput.value = caseSens ? "True" : "False";
    caseInputToggle.checked = caseSens;

    const booksVal = params.get("books");
    if (booksVal && /^\d+$/.test(booksVal)) {
      const bits = BigInt(booksVal)
        .toString(2)
        .padStart(66, "0")
        .split("")
        .reverse();
      bits.forEach((b, i) => {
        bookBits[i] = b === "1" ? 1 : 0;
      });
      document.querySelectorAll(".toggle-book").forEach((btn, idx) => {
        updateBookBtn(Number.parseInt(btn.dataset.bookId, 10), bookBits[idx]);
      });
    }
    void triggerSearch();
  }
}

let favorites = readStoredArray("favorites");

function toggleFavorite(index) {
  const row = allResults[index];
  if (!row) return;

  const ref = `${row.Book} ${row.Chapter}:${row.Versecount}`;
  const text = row.verse.map((p) => p.highlight || p.text).join("");

  const existingIdx = favorites.findIndex((f) => f.ref === ref);

  if (existingIdx > -1) {
    favorites.splice(existingIdx, 1);
    showToast("Removed from Favorites", "success");
  } else {
    favorites.unshift({ ref, text, timestamp: Date.now() });
    showToast("Added to Favorites", "success");
  }

  localStorage.setItem("favorites", JSON.stringify(favorites));
  renderPage(currentPage);
  renderFavoritesList();
}

function isFavorite(ref) {
  return favorites.some((f) => f.ref === ref);
}

function renderFavoritesList() {
  const container = document.getElementById("favoritesList");
  if (!container) return;

  if (favorites.length === 0) {
    container.innerHTML = `<div class="text-slate-400 text-sm text-center italic py-4">No favorites yet</div>`;
    return;
  }

  container.innerHTML = favorites
    .map(
      (f) => `
        <div class="mb-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 hover:shadow-sm transition-shadow group relative">
            <div class="flex justify-between items-baseline mb-1">
                <span class="font-bold text-indigo-600 dark:text-indigo-400 text-xs">${escapeHtml(f.ref)}</span>
                <button data-ref="${escapeHtml(f.ref)}" onclick="removeFavorite(this.dataset.ref)" class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2" title="${escapeHtml(f.text)}">${escapeHtml(f.text)}</p>
        </div>
    `,
    )
    .join("");
}

function removeFavorite(ref) {
  favorites = favorites.filter((f) => f.ref !== ref);
  localStorage.setItem("favorites", JSON.stringify(favorites));
  renderPage(currentPage);
  renderFavoritesList();
}

function saveToHistory(query) {
  if (!query.trim()) return;
  let history = readStoredArray("searchHistory");
  history = history.filter((h) => h.toLowerCase() !== query.toLowerCase());
  history.unshift(query);
  if (history.length > 10) history = history.slice(0, 10);
  localStorage.setItem("searchHistory", JSON.stringify(history));
}

function showHistory() {
  const history = readStoredArray("searchHistory");
  const list = document.getElementById("historyList");
  const dropdown = document.getElementById("historyDropdown");

  if (history.length === 0) {
    dropdown.classList.add("hidden");
    return;
  }

  list.innerHTML = history
    .map(
      (q) => `
      <div data-query="${escapeHtml(q)}" onmousedown="selectHistory(this.dataset.query)" class="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between text-slate-600 dark:text-slate-300 transition-colors">
         <span>${escapeHtml(q)}</span>
         <svg class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
      </div>
   `,
    )
    .join("");

  dropdown.classList.remove("hidden");
}

function hideHistory() {
  document.getElementById("historyDropdown").classList.add("hidden");
}

function selectHistory(q) {
  searchInput.value = q;
  triggerSearch();
  hideHistory();
}

function clearHistory() {
  localStorage.removeItem("searchHistory");
  hideHistory();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === "Escape") {
    hideHistory();
    document.getElementById("sidebar").classList.add("-translate-x-full");
    closeDemoModal();
    searchInput.blur();
  }
});

function openDemoModal() {
  document.getElementById("demoModal").classList.remove("hidden");
}
function closeDemoModal() {
  document.getElementById("demoModal").classList.add("hidden");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  const bg = type === "error" ? "bg-red-500" : "bg-slate-800";

  toast.className = `${bg} text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-auto`;
  toast.innerHTML = `
       <svg class="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    `;
  const label = document.createElement("span");
  label.className = "font-medium text-sm";
  label.textContent = message;
  toast.appendChild(label);

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-10", "opacity-0");
  });

  setTimeout(() => {
    toast.classList.add("translate-y-10", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const featureModal = document.getElementById("featureModal");
const modalTitle = document.getElementById("modalTitle");
const modalContent = document.getElementById("modalContent");
const modalIcon = document.getElementById("modalIcon");

function openFeatureModal(title, iconHtml, contentHtml) {
  modalTitle.textContent = title;
  modalIcon.innerHTML = iconHtml;
  modalContent.innerHTML = contentHtml;
  featureModal.classList.remove("hidden");
}

function closeFeatureModal() {
  featureModal.classList.add("hidden");
}

async function openExplain(index) {
  const row = allResults[index];
  if (!row) return;

  const ref = `${row.Book} ${row.Chapter}:${row.Versecount}`;
  const text = row.verse.map((p) => p.highlight || p.text).join("");

  const loadingHtml = `<div class="animate-pulse space-y-3"><div class="h-4 bg-slate-200 rounded w-3/4"></div><div class="h-4 bg-slate-200 rounded w-full"></div><div class="h-4 bg-slate-200 rounded w-5/6"></div></div>`;
  openFeatureModal(
    "Theological Insight",
    `<svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`,
    loadingHtml,
  );

  if (explanationCache[ref]) {
    modalContent.innerHTML = `<p class="text-slate-700 dark:text-slate-300 text-lg leading-relaxed">${escapeHtml(explanationCache[ref])}</p>`;
    return;
  }

  try {
    const params = new URLSearchParams({ ref, text });
    const response = await fetch(`/explain/?${params}`);
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || "Explanation unavailable.");
    }
    explanationCache[ref] = data.explanation;
    modalContent.innerHTML = `<p class="text-slate-700 dark:text-slate-300 text-lg leading-relaxed">${escapeHtml(data.explanation)}</p>`;
  } catch {
    modalContent.innerHTML = `<p class="text-red-500">The explanation service is unavailable right now.</p>`;
  }
}

async function openChapter(index) {
  const row = allResults[index];
  if (!row) return;

  const book = row.Book;
  const chapter = row.Chapter;
  const targetVerse = row.Versecount;

  const loadingHtml = `<div class="animate-pulse space-y-3"><div class="h-4 bg-slate-200 rounded w-full"></div><div class="h-4 bg-slate-200 rounded w-full"></div><div class="h-4 bg-slate-200 rounded w-full"></div></div>`;
  openFeatureModal(
    `${book} ${chapter}`,
    `<svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>`,
    loadingHtml,
  );

  const version = document.getElementById("versionSelect").value;
  try {
    const params = new URLSearchParams({ book, chapter, version });
    const response = await fetch(`/chapter/?${params}`);
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || "Chapter unavailable.");
    }

    const versesHtml = data.verses
      .map((verse) => {
        const isTarget = Number(verse.verse) === Number(targetVerse);
        const outputClass = isTarget
          ? "bg-indigo-50 dark:bg-indigo-900/30 -mx-2 px-2 rounded border-l-4 border-indigo-500"
          : "";
        return `<div class="mb-2 ${outputClass}" id="v${escapeHtml(verse.verse)}">
                    <span class="text-xs font-bold text-slate-400 select-none mr-1">${escapeHtml(verse.verse)}</span>
                    <span class="text-slate-700 dark:text-slate-300">${escapeHtml(verse.text)}</span>
                </div>`;
      })
      .join("");

    modalContent.innerHTML = `<div class="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">${versesHtml}</div>`;
    setTimeout(() => {
      const el = document.getElementById(`v${targetVerse}`);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 100);
  } catch {
    modalContent.innerHTML = `<p class="text-red-500">The chapter could not be loaded.</p>`;
  }
}
