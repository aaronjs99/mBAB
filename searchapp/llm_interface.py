import re
import os
import sys
import sqlite3
from django.conf import settings

# Attempt to import clients
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    from groq import Groq
except ImportError:
    Groq = None
# Global cache for local model to avoid reloading
LOCAL_LLM = None

def get_llm_client():
    """
    Get the configured LLM client. 
    Priority:
    1. Ollama (Local Preferred) - only if running
    2. Cloud Fallbacks (DeepSeek, Groq, OpenAI)
    """
    import urllib.request
    import urllib.error
    
    # 1. Ollama (Localhost) - Check if actually running first
    if OpenAI:
        try:
            # Quick ping to Ollama server
            req = urllib.request.Request(
                "http://localhost:11434/api/tags",
                method="GET"
            )
            req.add_header("Connection", "close")
            with urllib.request.urlopen(req, timeout=1) as resp:
                if resp.status == 200:
                    return OpenAI(
                        base_url="http://localhost:11434/v1",
                        api_key="ollama"  # required but unused
                    ), "ollama"
        except (urllib.error.URLError, TimeoutError, OSError):
            # Ollama not running, fall through to cloud providers
            pass

    # 2. Cloud Fallbacks
    # DeepSeek (Preferred Cloud)
    deepseek_key = getattr(settings, 'DEEPSEEK_API_KEY', '')
    if OpenAI and deepseek_key:
        return OpenAI(
            api_key=deepseek_key, 
            base_url="https://api.deepseek.com"
        ), "deepseek"

    if Groq and getattr(settings, 'GROQ_API_KEY', ''):
        return Groq(api_key=settings.GROQ_API_KEY), "groq"
    
    if OpenAI and getattr(settings, 'OPENAI_API_KEY', ''):
        return OpenAI(api_key=settings.OPENAI_API_KEY), "openai"
    
    return None, None


def detect_intent(query):
    """
    Determine if the query is a standard keyword/boolean search or a natural language question.
    """
    query = query.strip()
    
    # 0. explicit prefixes (Differentiation Strategy)
    if query.lower().startswith("sql:") or query.lower().startswith("ask:"):
        return "LLM"
    if query.lower().startswith("key:") or query.lower().startswith("search:"):
        return "STANDARD"

    # 1. Check for standard Boolean operators
    if re.search(r"\+|,\(|\)", query):
        return "STANDARD"
        
    # 2. Check for Verse References
    if re.search(r"^\d*\s*[a-zA-Z]+\s+\d+(:\d+)?(-\d+)?$", query):
        return "STANDARD"
        
    # 3. Default to LLM
    # User wants LLM as the default parser (to strip meta-language like 'verses about')
    # BUT wants to strictly control expansion via prompt engineering.
    return "LLM"


def generate_search_expression(query, version_name="ESV"):
    """
    Use an LLM to convert a natural language query into a Boolean search expression.
    Now defaults to PRECISE mapping unless expansion is requested.
    """
    client, provider = get_llm_client()
    if not client:
        return None, "No LLM available."

    # Remove prefixes if present
    clean_query = re.sub(r"^(sql:|ask:)\s*", "", query, flags=re.IGNORECASE).strip()

    system_prompt = (
        "You are a Biblical Search AI. Your task is to convert natural language queries into PRECISE Boolean search expressions.\n"
        "Your goal is to extract the core search terms and apply boolean logic.\n\n"
        "STRICTEST RULE: Output ONLY the final boolean string. NO explanations. NO preamble (e.g., 'To generate...', 'Here is...'). NO markdown.\n\n"
        "VALID SYNTAX:\n"
        "  - Words: Keywords from the query (e.g., peace, love)\n"
        "  - Operator '+': AND logic (combinations). E.g., 'faith + works'\n"
        "  - Operator ',': OR logic (synonyms/variants). E.g., 'sin, transgression'\n"
        "  - Grouping '( )': Combine logic. E.g., '(grace, mercy) + (truth, law)'\n\n"
        "LOGIC RULES:\n"
        "1. PRIORITY - EXPAND IF ASKED: If the user uses words like 'expand', 'synonyms', 'related', OR 'including', you MUST define the core terms with OR logic.\n"
        "   - User: 'synonyms for love' -> Output: '(love, affection, charity, devotion)'\n"
        "   - User: 'related to faith' -> Output: '(faith, belief, trust, confidence)'\n"
        "2. DEFAULT - PRECISION: If Rule 1 does not apply, do NOT expand. Use the user's exact keywords.\n"
        "   - User: 'verses about hope' -> Output: 'hope'\n"
        "   - User: 'Jesus and Peter' -> Output: 'Jesus + Peter'\n"
        "3. STRIP NOISE: Remove conversational phrases like 'show me', 'verses about', 'find scripture on'.\n"
        "4. IGNORE STOPWORDS: Remove common words like 'the', 'of', 'to', 'in', 'a', 'an'.\n"
        "5. TOPIC MATCHING: Output MUST match the user's subject.\n\n"
        "EXAMPLES:\n"
        "Input: 'synonyms for love including love'\n"
        "Output: (love, affection, charity, devotion)\n\n"
        "Input: 'verses about faith and works'\n"
        "Output: faith + works\n\n"
        "Input: 'expand on grace'\n"
        "Output: (grace, favor, blessing, mercy)\n\n"
        "Input: 'show me scriptures on light'\n"
        "Output: light\n"
    )

    user_prompt = f"User Question: {clean_query}"
    
    try:
        # Determine model name
        if provider == "ollama":
            model = "llama3.2"
        elif provider == "groq":
            model = "llama-3.3-70b-versatile"
        elif provider == "deepseek":
            model = "deepseek-chat"
        else:
            model = "gpt-3.5-turbo"
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0,
            max_tokens=60
        )
        expression = response.choices[0].message.content.strip()
    except Exception as e:
        return None, f"LLM Error ({provider}): {str(e)}"
    
    # Post-processing cleanup for chatty models
    # If explicitly contains code blocks, strip them
    expression = expression.replace("```", "").strip()
    
    # If multiple lines, take the last one that looks like a boolean expression?
    # Or just strip lines ending in ':' (e.g. "Here is the logic:")
    lines = expression.split('\n')
    valid_lines = [line.strip() for line in lines if line.strip() and not line.strip().endswith(':') and not line.strip().lower().startswith("to ") and not line.strip().lower().startswith("here")]
    if valid_lines:
        # Heuristic: the line with the most boolean chars is likely the expression
        # or just the last non-empty line if it doesn't end in ':'
        expression = valid_lines[-1]
        
    return expression, None

def validate_and_sanitize_sql(sql):
    """
    Basic safety check to prevent destructive queries.
    """
    if not sql:
        return False
    
    forbidden = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", ";"]
    sql_upper = sql.upper()
    
    for word in forbidden:
        if word in sql_upper:
            return False
            
    return True

def explain_verse(reference, text):
    """
    Generate a short theological explanation for a verse.
    """
    client, provider = get_llm_client()
    if not client:
        return None, "No LLM available."

    system_prompt = (
        "You are a helpful biblical assistant. Explain this verse in 2-3 sentences. "
        "Focus on the main theological point and practical application. "
        "Be concise and encouraging."
    )
    
    user_prompt = f"Verse: {reference}\nText: {text}"

    try:
        # Determine model name
        if provider == "ollama":
            model = "llama3.2"
        elif provider == "groq":
            model = "llama-3.3-70b-versatile"
        elif provider == "deepseek":
            model = "deepseek-chat"
        else:
            model = "gpt-3.5-turbo"
            
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=150
        )
        explanation = response.choices[0].message.content.strip()
        return explanation, None
    except Exception as e:
        return None, f"LLM Error: {str(e)}"
