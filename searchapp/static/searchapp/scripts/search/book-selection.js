const BOOK_COUNT = 66;

export class BookSelection {
  #bits = new Array(BOOK_COUNT).fill(0);
  #buttonById = new Map();

  initialize() {
    document.querySelectorAll(".toggle-book").forEach((button) => {
      const id = Number.parseInt(button.dataset.bookId, 10);
      this.#buttonById.set(id, button);
      this.#bits[id] = button.classList.contains("selected") ? 1 : 0;
    });
    this.refreshSectionLabels();
  }

  mask() {
    return this.#bits.reduce(
      (value, selected, id) => selected ? value | (1n << BigInt(id)) : value,
      0n,
    ).toString();
  }

  toggleBook(id) {
    if (!this.#buttonById.has(id)) return;
    this.#bits[id] ^= 1;
    this.#renderBook(id);
    this.refreshSectionLabels();
  }

  toggleSection(ids) {
    const selected = ids.every((id) => this.#bits[id] === 1);
    this.#setIds(ids, selected ? 0 : 1);
  }

  selectOnly(ids) {
    this.#bits.fill(0);
    for (const id of ids) this.#bits[id] = 1;
    this.#renderAll();
  }

  toggleTestament(testament) {
    const rangeByTestament = { ot: [0, 39], nt: [39, 66], bib: [0, 66] };
    const range = rangeByTestament[testament];
    if (!range) return;
    const [start, end] = range;
    const ids = Array.from({ length: end - start }, (_, index) => start + index);
    const selected = ids.every((id) => this.#bits[id] === 1);
    this.#setIds(ids, selected ? 0 : 1);
  }

  reset() {
    this.#bits.fill(0);
    this.#renderAll();
  }

  restoreMask(value) {
    if (!/^\d+$/.test(value || "")) return false;
    const mask = BigInt(value);
    for (let id = 0; id < BOOK_COUNT; id += 1) {
      this.#bits[id] = Number((mask >> BigInt(id)) & 1n);
    }
    this.#renderAll();
    return true;
  }

  refreshSectionLabels() {
    document.querySelectorAll("[data-section-ids]").forEach((section) => {
      const ids = JSON.parse(section.dataset.sectionIds || "[]");
      const selected = ids.every((id) => this.#bits[id] === 1);
      const label = section.querySelector(".section-toggle-text");
      if (label) label.textContent = selected ? "Deselect All" : "Select All";
    });
  }

  #setIds(ids, value) {
    for (const id of ids) this.#bits[id] = value;
    this.#renderAll();
  }

  #renderAll() {
    for (const id of this.#buttonById.keys()) this.#renderBook(id);
    this.refreshSectionLabels();
  }

  #renderBook(id) {
    const button = this.#buttonById.get(id);
    if (!button) return;
    button.classList.toggle("selected", this.#bits[id] === 1);
    button.classList.toggle("deselected", this.#bits[id] === 0);
    button.setAttribute("aria-pressed", String(this.#bits[id] === 1));
  }
}
