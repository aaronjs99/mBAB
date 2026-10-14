"""Decode legacy text while keeping edition-specific editorial notes separate."""

import re


def plain_verse_text(text: str | None, version: str) -> str:
    """Return verse words; WEB braces are notes, while Darby braces are headings."""
    if text is None:
        return ""
    decoded = re.sub(r"\\+([\"'])", r"\1", text)
    if version == "WEB":
        return re.sub(r"\s+", " ", re.sub(r"\{[^{}]*\}", "", decoded)).strip()
    return decoded
