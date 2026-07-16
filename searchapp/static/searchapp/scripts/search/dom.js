export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required mBAB element: #${id}`);
  return element;
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character],
  );
}

export function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    localStorage.removeItem(key);
    return [];
  }
}

export function verseText(row) {
  if (typeof row.verse === "string") return row.verse;
  return row.verse.map((part) => part.highlight || part.text || "").join("");
}
