"""Optional language-model helpers for natural-language Bible searches."""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from functools import lru_cache

from django.conf import settings

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - depends on optional runtime packages
    OpenAI = None

try:
    from groq import Groq
except ImportError:  # pragma: no cover - depends on optional runtime packages
    Groq = None


MODEL_BY_PROVIDER = {
    "ollama": "llama3.2",
    "groq": "llama-3.3-70b-versatile",
    "deepseek": "deepseek-chat",
    "openai": "gpt-3.5-turbo",
}


@lru_cache(maxsize=1)
def get_llm_client():
    """Return the first available local or hosted language-model client."""
    if OpenAI:
        try:
            request = urllib.request.Request(
                "http://localhost:11434/api/tags",
                headers={"Connection": "close"},
                method="GET",
            )
            with urllib.request.urlopen(request, timeout=1) as response:
                if response.status == 200:
                    return (
                        OpenAI(
                            base_url="http://localhost:11434/v1",
                            api_key="ollama",
                        ),
                        "ollama",
                    )
        except (urllib.error.URLError, TimeoutError, OSError):
            pass

    if Groq and settings.GROQ_API_KEY:
        return Groq(api_key=settings.GROQ_API_KEY), "groq"
    if OpenAI and settings.DEEPSEEK_API_KEY:
        return (
            OpenAI(
                api_key=settings.DEEPSEEK_API_KEY,
                base_url="https://api.deepseek.com",
            ),
            "deepseek",
        )
    if OpenAI and settings.OPENAI_API_KEY:
        return OpenAI(api_key=settings.OPENAI_API_KEY), "openai"
    return None, None


def detect_intent(query: str) -> str:
    """Classify a query as explicit Boolean syntax or natural language."""
    normalized = query.strip()
    lowered = normalized.casefold()

    if lowered.startswith(("sql:", "ask:")):
        return "LLM"
    if lowered.startswith(("key:", "search:")):
        return "STANDARD"
    if re.search(r"[+,()]", normalized):
        return "STANDARD"
    if re.search(r"^\d*\s*[a-zA-Z]+\s+\d+(?::\d+)?(?:-\d+)?$", normalized):
        return "STANDARD"
    return "LLM"


def _completion(client, provider, messages, *, temperature: float, max_tokens: int):
    return client.chat.completions.create(
        model=MODEL_BY_PROVIDER[provider],
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def _clean_expression(value: str) -> str:
    """Remove markdown and conversational preambles from a model response."""
    lines = [line.strip() for line in value.replace("```", "").splitlines()]
    candidates = [
        line
        for line in lines
        if line
        and not line.endswith(":")
        and not line.casefold().startswith(("to ", "here"))
    ]
    return candidates[-1] if candidates else ""


def generate_search_expression(query: str, version_name: str = "KJV"):
    """Convert natural language into mBAB's compact Boolean syntax."""
    del version_name  # Reserved for future edition-aware parsing.
    client, provider = get_llm_client()
    if not client or not provider:
        return None, "No LLM available."

    clean_query = re.sub(r"^(sql:|ask:)\s*", "", query, flags=re.IGNORECASE).strip()
    system_prompt = (
        "Convert Bible-search questions into precise Boolean search expressions. "
        "Return only the expression, with no markdown or explanation. "
        "Use + for AND, comma for OR, and parentheses for grouping. "
        "Remove conversational phrases and stop words. Do not add synonyms unless "
        "the user explicitly asks to expand, include related words, or find synonyms. "
        "Examples: 'verses about faith and works' -> faith + works; "
        "'synonyms for love' -> (love, affection, charity, devotion); "
        "'show me scriptures on light' -> light."
    )

    try:
        response = _completion(
            client,
            provider,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"User question: {clean_query}"},
            ],
            temperature=0,
            max_tokens=60,
        )
        expression = _clean_expression(response.choices[0].message.content or "")
    except Exception as error:  # External SDKs expose provider-specific exceptions.
        return None, f"LLM error ({provider}): {error}"

    if not expression:
        return None, "The LLM returned an empty expression."
    return expression, None


def validate_and_sanitize_sql(sql: str) -> bool:
    """Retain a conservative guard for legacy read-only SQL integrations."""
    if not sql or not sql.lstrip().upper().startswith("SELECT "):
        return False
    return not re.search(
        r"\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE)\b|;", sql, re.IGNORECASE
    )


def explain_verse(reference: str, text: str):
    """Generate a concise explanation of one verse when an LLM is configured."""
    client, provider = get_llm_client()
    if not client or not provider:
        return None, "No LLM available."

    try:
        response = _completion(
            client,
            provider,
            [
                {
                    "role": "system",
                    "content": (
                        "Explain the verse in two or three concise sentences. Focus on "
                        "its main theological point and a careful practical application."
                    ),
                },
                {"role": "user", "content": f"Verse: {reference}\nText: {text}"},
            ],
            temperature=0.3,
            max_tokens=150,
        )
        return response.choices[0].message.content.strip(), None
    except Exception as error:  # External SDKs expose provider-specific exceptions.
        return None, f"LLM error ({provider}): {error}"
