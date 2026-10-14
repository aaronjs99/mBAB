import { Fragment } from "react";

import { parseReference, queryTerms } from "@/app/search/query";

export function HighlightedText({ text, query, caseSensitive = false }: { text: string; query: string; caseSensitive?: boolean }) {
  const terms = parseReference(query) ? [] : queryTerms(query);
  if (!terms.length) return text;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(\\b(?:${escaped.join("|")})\\b)`, caseSensitive ? "g" : "gi");
  return text.split(pattern).map((part, index) => {
    return index % 2 === 1
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}
