import { Fragment } from "react";

import { queryTerms } from "@/app/search/query";

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = queryTerms(query);
  if (!terms.length) return text;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(pattern).map((part, index) => {
    const match = terms.some((term) => term.toLowerCase() === part.toLowerCase());
    return match
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}
