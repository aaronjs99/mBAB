"""Pure parsing and compilation for mBAB search expressions."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

from .catalog import BOOKS


WORD_PATTERN = re.compile(r"[A-Za-z0-9_]+")
TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_]+|[(),+]")
REFERENCE_PATTERN = re.compile(
    r"^(?P<book>.+?)\s+(?P<chapter>\d+)(?::(?P<start>\d+)(?:-(?P<end>\d+))?)?$",
    re.IGNORECASE,
)
NATURAL_PREFIX_PATTERN = re.compile(r"^(?:sql:|ask:)\s*", re.IGNORECASE)
STANDARD_PREFIX_PATTERN = re.compile(r"^(?:key:|search:)\s*", re.IGNORECASE)
STOP_WORDS = frozenset(
    {
        "about",
        "and",
        "bible",
        "does",
        "find",
        "give",
        "me",
        "on",
        "say",
        "scripture",
        "scriptures",
        "show",
        "the",
        "verses",
        "what",
    }
)


class QueryKind(str, Enum):
    REFERENCE = "reference"
    STANDARD = "standard"
    NATURAL = "natural"


@dataclass(frozen=True, slots=True)
class VerseReference:
    book_id: int
    chapter: int
    start_verse: int | None = None
    end_verse: int | None = None


@dataclass(frozen=True, slots=True)
class CompiledQuery:
    where_clause: str
    parameters: tuple[object, ...]
    highlight_terms: tuple[str, ...] = ()


def parse_reference(expression: str) -> VerseReference | None:
    """Parse a full-name Bible reference such as ``John 3:16-18``."""
    match = REFERENCE_PATTERN.fullmatch(expression.strip())
    if not match:
        return None

    book_name = match.group("book").casefold()
    book = next((item for item in BOOKS if item.name.casefold() == book_name), None)
    if book is None:
        return None

    chapter = int(match.group("chapter"))
    start = int(match.group("start")) if match.group("start") else None
    end = int(match.group("end")) if match.group("end") else start
    if chapter < 1 or (start is not None and start < 1):
        raise ValueError("Chapter and verse numbers must be positive.")
    if start is not None and end is not None and end < start:
        raise ValueError("The ending verse cannot come before the starting verse.")
    return VerseReference(book.id, chapter, start, end)


def classify_query(expression: str) -> QueryKind:
    """Classify a reference, explicit expression, or natural-language request."""
    normalized = expression.strip()
    lowered = normalized.casefold()
    if NATURAL_PREFIX_PATTERN.match(normalized):
        return QueryKind.NATURAL
    if parse_reference(normalized):
        return QueryKind.REFERENCE
    if (
        lowered.startswith(("key:", "search:"))
        or WORD_PATTERN.fullmatch(normalized)
        or re.search(r"[+,()]", normalized)
    ):
        return QueryKind.STANDARD
    if re.search(r"\b(?:AND|OR)\b", normalized, flags=re.IGNORECASE):
        try:
            compile_query(normalized)
        except ValueError:
            pass
        else:
            return QueryKind.STANDARD
    return QueryKind.NATURAL


def fallback_expression(expression: str) -> str:
    """Create a deterministic all-words expression when optional AI is absent."""
    clean = NATURAL_PREFIX_PATTERN.sub("", expression.strip())
    terms = [
        word
        for word in WORD_PATTERN.findall(clean)
        if word.casefold() not in STOP_WORDS
    ]
    return "+".join(terms or WORD_PATTERN.findall(clean))


def tokenize(expression: str) -> list[str]:
    """Split a Boolean expression into words, operators, and parentheses."""
    if re.search(r"[^A-Za-z0-9_(),+\s]", expression):
        raise ValueError("Use words, parentheses, +, commas, AND, or OR in a Boolean search.")
    tokens = TOKEN_PATTERN.findall(expression)
    normalized: list[str] = []
    for index, token in enumerate(tokens):
        previous = tokens[index - 1] if index > 0 else ""
        following = tokens[index + 1] if index + 1 < len(tokens) else ""
        between_operands = (
            (WORD_PATTERN.fullmatch(previous) or previous == ")")
            and (WORD_PATTERN.fullmatch(following) or following == "(")
        )
        if between_operands and token.casefold() in {"and", "or"}:
            normalized.append("+" if token.casefold() == "and" else ",")
        else:
            normalized.append(token)
    return normalized


def to_postfix(tokens: list[str]) -> list[str]:
    """Convert validated infix Boolean tokens to postfix notation."""
    precedence = {"+": 2, ",": 1}
    output: list[str] = []
    operators: list[str] = []
    expects_word = True

    for token in tokens:
        if WORD_PATTERN.fullmatch(token):
            if not expects_word:
                raise ValueError("Add + or a comma between adjacent search words.")
            output.append(token)
            expects_word = False
        elif token in precedence:
            if expects_word:
                raise ValueError("An operator needs a word on both sides.")
            while (
                operators
                and operators[-1] in precedence
                and precedence[operators[-1]] >= precedence[token]
            ):
                output.append(operators.pop())
            operators.append(token)
            expects_word = True
        elif token == "(":
            if not expects_word:
                raise ValueError("Add an operator before an opening parenthesis.")
            operators.append(token)
        elif token == ")":
            if expects_word:
                raise ValueError("A closing parenthesis must follow a word or group.")
            while operators and operators[-1] != "(":
                output.append(operators.pop())
            if not operators:
                raise ValueError("Unmatched closing parenthesis.")
            operators.pop()
        else:
            raise ValueError("Unknown Boolean search token.")

    if expects_word:
        raise ValueError("Finish the search with a word, not an operator.")
    if "(" in operators:
        raise ValueError("Unmatched opening parenthesis.")
    output.extend(reversed(operators))
    return output


def _boolean_query(tokens: list[str]) -> CompiledQuery:
    stack: list[tuple[str, list[object]]] = []
    for token in to_postfix(tokens):
        if WORD_PATTERN.fullmatch(token):
            stack.append(("verse REGEXP ?", [rf"\b{re.escape(token)}\b"]))
            continue
        if token not in {"+", ","} or len(stack) < 2:
            raise ValueError("The Boolean search expression is incomplete.")
        right_clause, right_values = stack.pop()
        left_clause, left_values = stack.pop()
        operator = "AND" if token == "+" else "OR"
        stack.append(
            (
                f"({left_clause} {operator} {right_clause})",
                left_values + right_values,
            )
        )
    if len(stack) != 1:
        raise ValueError("Add + or a comma between adjacent search words.")
    where_clause, parameters = stack[0]
    return CompiledQuery(
        where_clause,
        tuple(parameters),
        tuple(token for token in tokens if WORD_PATTERN.fullmatch(token)),
    )


def _reference_query(reference: VerseReference) -> CompiledQuery:
    if reference.start_verse is None:
        return CompiledQuery(
            "Book = ? AND Chapter = ?", (reference.book_id, reference.chapter)
        )
    if reference.start_verse == reference.end_verse:
        return CompiledQuery(
            "Book = ? AND Chapter = ? AND Versecount = ?",
            (reference.book_id, reference.chapter, reference.start_verse),
        )
    return CompiledQuery(
        "Book = ? AND Chapter = ? AND Versecount BETWEEN ? AND ?",
        (
            reference.book_id,
            reference.chapter,
            reference.start_verse,
            reference.end_verse,
        ),
    )


def compile_query(expression: str) -> CompiledQuery:
    """Compile a safe mBAB expression into a parameterized SQL fragment."""
    normalized = expression.strip()
    if not normalized:
        raise ValueError("Enter a search query.")
    if normalized.upper().startswith("SELECT "):
        raise ValueError("Raw SQL is not accepted. Use mBAB Boolean syntax instead.")
    reference = parse_reference(normalized)
    if reference:
        return _reference_query(reference)

    clean = STANDARD_PREFIX_PATTERN.sub("", normalized)
    tokens = tokenize(clean)
    if not tokens:
        raise ValueError("Enter at least one searchable word.")
    return _boolean_query(tokens)
