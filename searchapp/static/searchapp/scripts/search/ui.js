import { byId, escapeHtml, readStoredArray } from "./dom.js";

export class SearchUi {
  #fontSize = 100;

  initialize() {
    this.setTheme(localStorage.getItem("theme") || "dark");
  }

  toggleSidebar() {
    const sidebar = byId("sidebar");
    if (window.innerWidth >= 768) sidebar.classList.toggle("md:translate-x-0");
    else sidebar.classList.toggle("-translate-x-full");
  }

  changeFontSize(delta) {
    this.#fontSize = Math.max(80, Math.min(150, this.#fontSize + delta));
    document.documentElement.style.fontSize = `${(this.#fontSize / 100) * 16}px`;
    byId("fontDisplay").textContent = `${this.#fontSize}%`;
  }

  setTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }

  toggleTheme() {
    this.setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }

  openDemo() {
    byId("demoModal").classList.remove("hidden");
  }

  closeDemo() {
    byId("demoModal").classList.add("hidden");
  }

  openFeature(title, iconHtml, contentHtml) {
    byId("modalTitle").textContent = title;
    byId("modalIcon").innerHTML = iconHtml;
    byId("modalContent").innerHTML = contentHtml;
    byId("featureModal").classList.remove("hidden");
  }

  closeFeature() {
    byId("featureModal").classList.add("hidden");
  }

  toast(message, type = "success") {
    const toast = document.createElement("div");
    const background = type === "error" ? "bg-red-500" : "bg-slate-800";
    toast.className = `${background} text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-auto`;
    toast.innerHTML = '<svg class="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
    const label = document.createElement("span");
    label.className = "font-medium text-sm";
    label.textContent = message;
    toast.appendChild(label);
    byId("toastContainer").appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove("translate-y-10", "opacity-0"));
    window.setTimeout(() => {
      toast.classList.add("translate-y-10", "opacity-0");
      window.setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  saveHistory(query) {
    if (!query.trim()) return;
    let history = readStoredArray("searchHistory");
    history = history.filter((item) => item.toLowerCase() !== query.toLowerCase());
    localStorage.setItem("searchHistory", JSON.stringify([query, ...history].slice(0, 10)));
  }

  showHistory() {
    const history = readStoredArray("searchHistory");
    const dropdown = byId("historyDropdown");
    if (!history.length) {
      dropdown.classList.add("hidden");
      return;
    }
    byId("historyList").innerHTML = history.map((query) => `
      <button type="button" data-action="select-history" data-query="${escapeHtml(query)}" class="w-full px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between text-slate-600 dark:text-slate-300 transition-colors">
        <span>${escapeHtml(query)}</span>
        <svg class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
      </button>
    `).join("");
    dropdown.classList.remove("hidden");
  }

  hideHistory() {
    byId("historyDropdown").classList.add("hidden");
  }

  clearHistory() {
    localStorage.removeItem("searchHistory");
    this.hideHistory();
  }
}
