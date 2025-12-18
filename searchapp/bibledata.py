testaments = ["Old Testament", "New Testament"]

testament_map = {
    "ot": ["Old Testament"],
    "nt": ["New Testament"],
    "bib": ["Old Testament", "New Testament"],
}

book_sections = {
    "Law": [0, 1, 2, 3, 4],
    "History": [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    "Poetry": [17, 18, 19, 20, 21],
    "Major Prophets": [22, 23, 24, 25, 26],
    "Minor Prophets": [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
    "Gospels": [39, 40, 41, 42],
    "History (Acts)": [43],
    "Pauline Epistles": [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56],
    "General Epistles": [57, 58, 59, 60, 61, 62, 63, 64],
    "Prophecy (Revelation)": [65],
}

versions = [
    {
        "name": "ESV",
        "expansion": "English Standard Version",
        "wiki": "https://en.wikipedia.org/wiki/English_Standard_Version",
    },
    {
        "name": "KJV",
        "expansion": "King James Version",
        "wiki": "https://en.wikipedia.org/wiki/King_James_Version",
    },
    {
        "name": "NKJV",
        "expansion": "New King James Version",
        "wiki": "https://en.wikipedia.org/wiki/New_King_James_Version",
    },
    {
        "name": "NASB",
        "expansion": "New American Standard Bible",
        "wiki": "https://en.wikipedia.org/wiki/New_American_Standard_Bible",
    },
    {
        "name": "AMP",
        "expansion": "Amplified Bible",
        "wiki": "https://en.wikipedia.org/wiki/Amplified_Bible",
    },
    {
        "name": "ASV",
        "expansion": "American Standard Version",
        "wiki": "https://en.wikipedia.org/wiki/American_Standard_Version",
    },
    {
        "name": "YLT",
        "expansion": "Young's Literal Translation",
        "wiki": "https://en.wikipedia.org/wiki/Young%27s_Literal_Translation",
    },
    {
        "name": "BBE",
        "expansion": "Bible in Basic English",
        "wiki": "https://en.wikipedia.org/wiki/Bible_in_Basic_English",
    },
    {
        "name": "DBY",
        "expansion": "Darby Bible",
        "wiki": "https://en.wikipedia.org/wiki/Darby_Bible",
    },
    {
        "name": "WEB",
        "expansion": "World English Bible",
        "wiki": "https://en.wikipedia.org/wiki/World_English_Bible",
    },
    {
        "name": "BSB",
        "expansion": "Berean Study Bible",
        "wiki": "https://www.bereanbible.com/",
    },
    {
        "name": "AKJV",
        "expansion": "Authorized King James Version",
        "wiki": "https://en.wikipedia.org/wiki/King_James_Version",
    },
    {
        "name": "UKJV",
        "expansion": "Updated King James Version",
        "wiki": "https://en.wikipedia.org/wiki/King_James_Version",
    },
    {
        "name": "WBT",
        "expansion": "Webster's Bible Translation",
        "wiki": "https://en.wikipedia.org/wiki/Webster%27s_Revision",
    },
    {
        "name": "GEN",
        "expansion": "Geneva Bible",
        "wiki": "https://en.wikipedia.org/wiki/Geneva_Bible",
    },
]

books = [
    {"id": i, "num": f"{i:02}", "text": name, "testament": test}
    for i, (name, test) in enumerate(
        [
            # Old Testament
            ("Genesis", "Old Testament"),
            ("Exodus", "Old Testament"),
            ("Leviticus", "Old Testament"),
            ("Numbers", "Old Testament"),
            ("Deuteronomy", "Old Testament"),
            ("Joshua", "Old Testament"),
            ("Judges", "Old Testament"),
            ("Ruth", "Old Testament"),
            ("1 Samuel", "Old Testament"),
            ("2 Samuel", "Old Testament"),
            ("1 Kings", "Old Testament"),
            ("2 Kings", "Old Testament"),
            ("1 Chronicles", "Old Testament"),
            ("2 Chronicles", "Old Testament"),
            ("Ezra", "Old Testament"),
            ("Nehemiah", "Old Testament"),
            ("Esther", "Old Testament"),
            ("Job", "Old Testament"),
            ("Psalms", "Old Testament"),
            ("Proverbs", "Old Testament"),
            ("Ecclesiastes", "Old Testament"),
            ("Song of Solomon", "Old Testament"),
            ("Isaiah", "Old Testament"),
            ("Jeremiah", "Old Testament"),
            ("Lamentations", "Old Testament"),
            ("Ezekiel", "Old Testament"),
            ("Daniel", "Old Testament"),
            ("Hosea", "Old Testament"),
            ("Joel", "Old Testament"),
            ("Amos", "Old Testament"),
            ("Obadiah", "Old Testament"),
            ("Jonah", "Old Testament"),
            ("Micah", "Old Testament"),
            ("Nahum", "Old Testament"),
            ("Habakkuk", "Old Testament"),
            ("Zephaniah", "Old Testament"),
            ("Haggai", "Old Testament"),
            ("Zechariah", "Old Testament"),
            ("Malachi", "Old Testament"),
            # New Testament
            ("Matthew", "New Testament"),
            ("Mark", "New Testament"),
            ("Luke", "New Testament"),
            ("John", "New Testament"),
            ("Acts", "New Testament"),
            ("Romans", "New Testament"),
            ("1 Corinthians", "New Testament"),
            ("2 Corinthians", "New Testament"),
            ("Galatians", "New Testament"),
            ("Ephesians", "New Testament"),
            ("Philippians", "New Testament"),
            ("Colossians", "New Testament"),
            ("1 Thessalonians", "New Testament"),
            ("2 Thessalonians", "New Testament"),
            ("1 Timothy", "New Testament"),
            ("2 Timothy", "New Testament"),
            ("Titus", "New Testament"),
            ("Philemon", "New Testament"),
            ("Hebrews", "New Testament"),
            ("James", "New Testament"),
            ("1 Peter", "New Testament"),
            ("2 Peter", "New Testament"),
            ("1 John", "New Testament"),
            ("2 John", "New Testament"),
            ("3 John", "New Testament"),
            ("Jude", "New Testament"),
            ("Revelation", "New Testament"),
        ]
    )
]

sql_select = "SELECT * FROM bible WHERE "
sql_order = "ORDER BY Book, Chapter, Versecount"

import re

def parse_verse_reference(query):
    """
    Parse a query string to see if it matches a verse reference pattern.
    Supports:
      - Book Chapter:Verse (e.g., "John 3:16")
      - Book Chapter:Verse-Verse (e.g., "John 3:16-21")
      - Book Chapter (e.g., "John 3") -> Returns all verses in chapter
    
    Returns:
        None if no match.
        Dict with keys: book_id, chapter, start_verse, end_verse (optional)
    """
    # Normalize query: remove extra spaces
    query = query.strip()
    
    # Regex for "Book Chapter:Verse[-Verse]" or "Book Chapter"
    # We need to handle book names with spaces (e.g. "1 John")
    # Strategy: Try to match the end of the string first for the numbers
    
    # Pattern 1: Chapter:Verse-Verse or Chapter:Verse
    # Group 1: Book Name
    # Group 2: Chapter
    # Group 3: Start Verse
    # Group 4: End Verse (optional)
    match = re.search(r"^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$", query)
    
    if match:
        book_name = match.group(1).strip()
        chapter = int(match.group(2))
        start_verse = int(match.group(3))
        end_verse = int(match.group(4)) if match.group(4) else start_verse
        
        book_id = get_book_id(book_name)
        if book_id is not None:
            return {
                "book_id": book_id,
                "chapter": chapter,
                "start_verse": start_verse,
                "end_verse": end_verse
            }

    # Pattern 2: Chapter only (e.g. "John 3")
    match = re.search(r"^(.+?)\s+(\d+)$", query)
    if match:
        book_name = match.group(1).strip()
        chapter = int(match.group(2))
        
        book_id = get_book_id(book_name)
        if book_id is not None:
             return {
                "book_id": book_id,
                "chapter": chapter,
                "start_verse": None, # Indicates whole chapter
                "end_verse": None
            }
            
    return None

def get_book_id(name):
    """Case-insensitive lookup for book ID."""
    name_lower = name.lower()
    # Handle common abbreviations if needed, for now just exact match or standard abbreviations could be added
    # Let's try to match against the 'text' field in books list
    for book in books:
        if book["text"].lower() == name_lower:
            return book["id"]
    
    # Optional: Add simple abbreviation mapping here if desired
    # For now, we rely on full name or exact match from the books list
    return None
