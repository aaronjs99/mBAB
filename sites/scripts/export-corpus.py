"""Export installed, catalog-approved editions as public Sites build assets."""

import hashlib
import json
import re
import sqlite3
from contextlib import closing
from pathlib import Path

root = Path(__file__).resolve().parents[2]
contract = json.loads((root / "contracts/search.json").read_text(encoding="utf-8"))
destination = root / "sites/public/corpus"
destination.mkdir(parents=True, exist_ok=True)
manifest = {}
for edition in contract["versions"]:
    version = edition["id"]
    database_path = root / "databases" / f"{version}Bible_Database.db"
    with closing(sqlite3.connect(database_path.as_uri() + "?mode=ro", uri=True)) as database:
        rows = database.execute("SELECT Book, Chapter, Versecount, verse FROM bible ORDER BY Book, Chapter, Versecount").fetchall()
    if len(rows) < 30000 or {row[0] for row in rows} != set(range(66)):
        raise ValueError(f"{version} is incomplete; publication stopped.")
    seen = set()
    exported = []
    omitted = []
    corrected = 0
    fragments = 0
    positions = {}
    for book, chapter, verse, text in rows:
        # Webster's legacy columns disagree with explicit source markers, and
        # four verses span paragraph rows. Preserve those source identities.
        marker = re.match(r"^\\\\(\d+):(\d+)\\\\", text or "") if version == "WBT" else None
        if marker:
            source_chapter, source_verse = map(int, marker.groups())
            corrected += int((source_chapter, source_verse) != (chapter, verse))
            chapter = source_chapter
            verse = source_verse
            text = text[marker.end():]
        key = (book, chapter, verse)
        if version == "WBT" and marker and key in positions:
            index = positions[key]
            previous = exported[index]
            exported[index] = (*previous[:3], previous[3] + " " + text)
            fragments += 1
            continue
        if key in seen or chapter < 1 or verse < 1:
            raise ValueError(f"{version} contains invalid or duplicate verses; publication stopped.")
        seen.add(key)
        # Some editions omit verses; preserve that absence without borrowing text.
        if text is None or (isinstance(text, str) and not text.strip()):
            omitted.append(key)
            continue
        if not isinstance(text, str):
            raise ValueError(f"{version} contains invalid text; publication stopped.")
        positions[key] = len(exported)
        exported.append((book, chapter, verse, text))
    if len(exported) < 30000:
        raise ValueError(f"{version} is incomplete; publication stopped.")
    exported.sort(key=lambda row: row[:3])
    content = json.dumps({"schema": 1, "version": version, "rows": exported}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    (destination / f"{version}.json").write_bytes(content)
    manifest[version] = {"verses": len(exported), "omitted": omitted, "corrected_references": corrected, "joined_fragments": fragments, "sha256": hashlib.sha256(content).hexdigest()}
(destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Exported {len(manifest)} complete editions for publication.")
