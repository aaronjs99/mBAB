"""Build an offline WordNet 3.0 lexicon with only attested Bible candidates.

Uses Python's standard library. The raw official archive stays outside Git.
See ../app/search/data/README.md for provenance and regeneration instructions.
"""

import argparse
from dataclasses import dataclass
import gzip
import hashlib
import json
from pathlib import Path
import re
import tarfile
import urllib.request


SOURCE_URL = "https://wordnetcode.princeton.edu/3.0/WordNet-3.0.tar.gz"
SOURCE_SHA256 = "640db279c949a88f61f851dd54ebbb22d003f8b90b85267042ef85a3781d3a52"
PARTS = (("noun", "n"), ("verb", "v"), ("adj", "a"), ("adv", "r"))
POS_FLAGS = {"n": 1, "v": 2, "a": 4, "r": 8}
MAX_SENSES_PER_POS = 2
ALPHABETIC = re.compile(r"[a-z]+\Z")
TOKEN = re.compile(r"[A-Za-z0-9_]+")


@dataclass(frozen=True, slots=True)
class Pointer:
    target: tuple[str, int]
    source_word: int
    target_word: int


@dataclass(frozen=True, slots=True)
class Synset:
    # Preserve every word position, even when a compound cannot be suggested.
    words: tuple[str | None, ...]
    derivations: tuple[Pointer, ...]


def lemma(word):
    cleaned = re.sub(r"\((?:a|p|ip)\)$", "", word).lower()
    return cleaned if ALPHABETIC.fullmatch(cleaned) else None


def compile_dictionary(files, vocabulary, max_candidates=25):
    """Compile ordered entries/exceptions from the twelve WordNet text files.

    Query keys need not occur in the Bible. Only returned candidates are
    vocabulary-filtered. Only the first two indexed senses per part of speech
    contribute semantic candidates, stopping at a synset or one indexed '+'
    edge. Separate morphology support may use one source-synset peer plus one
    indexed '+' edge across all senses, with no further graph traversal.
    """
    if not isinstance(max_candidates, int) or max_candidates < 1:
        raise ValueError("The candidate cap must be a positive integer.")
    synsets = {}
    for part, expected_pos in PARTS:
        for line in files[f"data.{part}"].splitlines():
            if not line or line[0].isspace():
                continue
            fields = line.split("|", 1)[0].split()
            offset, pos, count = int(fields[0]), fields[2], int(fields[3], 16)
            pos = "a" if pos == "s" else pos
            if pos != expected_pos or count < 1:
                raise ValueError(f"Invalid data.{part} synset at {offset}.")
            words = tuple(lemma(fields[4 + 2 * index]) for index in range(count))
            pointer_start = 4 + 2 * count
            pointer_count = int(fields[pointer_start])
            derivations = []
            for index in range(pointer_count):
                start = pointer_start + 1 + 4 * index
                symbol, target_offset, target_pos, word_indexes = fields[start:start + 4]
                if symbol != "+":
                    continue
                if len(word_indexes) != 4:
                    raise ValueError(f"Malformed lexical pointer at {offset}.")
                source_word = int(word_indexes[:2], 16)
                target_word = int(word_indexes[2:], 16)
                # 0000 is a semantic pointer, not a word-specific derivation.
                if not source_word or not target_word:
                    continue
                if source_word > count:
                    raise ValueError(f"Invalid source word index at {offset}.")
                target_pos = "a" if target_pos == "s" else target_pos
                derivations.append(Pointer((target_pos, int(target_offset)), source_word, target_word))
            key = (pos, offset)
            if key in synsets:
                raise ValueError(f"Duplicate synset {key}.")
            synsets[key] = Synset(words, tuple(derivations))

    for synset in synsets.values():
        for pointer in synset.derivations:
            target = synsets.get(pointer.target)
            if target is None or pointer.target_word > len(target.words):
                raise ValueError(f"Invalid derivational target {pointer.target}.")

    senses = {}
    parts = {}
    for part, pos in PARTS:
        for line in files[f"index.{part}"].splitlines():
            if not line or line[0].isspace():
                continue
            fields = line.split()
            word = lemma(fields[0])
            if word is None:
                continue
            count, pointer_count = int(fields[2]), int(fields[3])
            offsets = fields[6 + pointer_count:]
            if fields[1] != pos or len(offsets) != count or int(fields[4 + pointer_count]) != count:
                raise ValueError(f"Malformed index.{part} entry for {word}.")
            parts[word] = parts.get(word, 0) | POS_FLAGS[pos]
            for sense_index, raw_offset in enumerate(offsets):
                key = (pos, int(raw_offset))
                if key not in synsets or word not in synsets[key].words:
                    raise ValueError(f"Index entry {word} refers to a missing sense {key}.")
                if sense_index < MAX_SENSES_PER_POS:
                    senses.setdefault(word, []).append(key)

    # Morphology is support for an independently generated suffix candidate,
    # not a second semantic expansion. A source-synset peer may share a word's
    # indexed '+' link, and the supported pair can be used in either direction.
    # Only the lexical target word is read; its synset peers are not followed.
    derivations = {}

    def support(source, target):
        if source is not None and target is not None and source != target and target in vocabulary:
            derivations.setdefault(source, set()).add(target)

    for synset in synsets.values():
        for pointer in synset.derivations:
            target = synsets[pointer.target].words[pointer.target_word - 1]
            for peer in synset.words:
                support(peer, target)
                support(target, peer)

    entries = {}
    for word, ordered_senses in senses.items():
        candidates = []
        seen = {word}

        def add(candidate):
            if candidate is not None and candidate in vocabulary and candidate not in seen and len(candidates) < max_candidates:
                seen.add(candidate)
                candidates.append(candidate)

        for key in ordered_senses:
            synset = synsets[key]
            for candidate in synset.words:
                add(candidate)
            source_words = {index + 1 for index, candidate in enumerate(synset.words) if candidate == word}
            for pointer in synset.derivations:
                if pointer.source_word in source_words:
                    add(synsets[pointer.target].words[pointer.target_word - 1])
            if len(candidates) >= max_candidates:
                break
        if candidates:
            entries[word] = candidates

    exceptions = {}
    for part, _ in PARTS:
        for line in files[f"{part}.exc"].splitlines():
            fields = line.split()
            if len(fields) < 2:
                if fields:
                    raise ValueError(f"Malformed {part}.exc entry.")
                continue
            word = lemma(fields[0])
            if word is None:
                continue
            for base in fields[1:]:
                base = lemma(base)
                if base is not None and base not in exceptions.get(word, []):
                    exceptions.setdefault(word, []).append(base)
    return {
        "entries": dict(sorted(entries.items())),
        "exceptions": dict(sorted(exceptions.items())),
        "derivations": {word: sorted(targets) for word, targets in sorted(derivations.items())},
        "parts": dict(sorted(parts.items())),
        "vocabulary": sorted(vocabulary),
    }


def read_archive(path, download=False):
    if not path.exists() and download:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".part")
        try:
            with urllib.request.urlopen(SOURCE_URL, timeout=60) as response, temporary.open("wb") as target:
                while chunk := response.read(1024 * 1024):
                    target.write(chunk)
            if hashlib.sha256(temporary.read_bytes()).hexdigest() != SOURCE_SHA256:
                raise ValueError("The official WordNet archive failed its pinned SHA-256 check.")
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
    if hashlib.sha256(path.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("The WordNet archive does not match the pinned official 3.0 source.")
    with tarfile.open(path, "r:gz") as archive:
        def member(name):
            item = archive.getmember("WordNet-3.0/" + name)
            if not item.isfile():
                raise ValueError(f"Expected an ordinary archive file: {name}.")
            with archive.extractfile(item) as source:
                return source.read()
        license_bytes = member("LICENSE")
        files = {
            name: member("dict/" + name).decode("ascii")
            for part, _ in PARTS
            for name in (f"data.{part}", f"index.{part}", f"{part}.exc")
        }
    return files, license_bytes


def corpus_vocabulary(corpus_dir, contract_path):
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    editions = sorted(item["id"] for item in contract["versions"])
    if not editions or len(set(editions)) != len(editions):
        raise ValueError("The canonical edition catalog is invalid.")
    manifest = json.loads((corpus_dir / "manifest.json").read_text(encoding="utf-8"))
    if set(manifest) != set(editions):
        raise ValueError("Corpus assets must match the canonical edition catalog.")
    vocabulary = set()
    hashes = {}
    for edition in editions:
        raw = (corpus_dir / f"{edition}.json").read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        data = json.loads(raw)
        if digest != manifest[edition]["sha256"] or data["schema"] != 1 or data["version"] != edition:
            raise ValueError(f"Corpus source metadata does not match {edition}.")
        rows = data["rows"]
        if len(rows) != manifest[edition]["verses"]:
            raise ValueError(f"Corpus verse count does not match {edition}.")
        for row in rows:
            text = re.sub(r"\\+([\"'])", r"\1", row[3])
            # Match the published WEB note handling in verse-text.ts. Other
            # editions retain their braces (e.g. Darby's Psalm headings).
            if edition == "WEB":
                text = re.sub(r"\{[^{}]*\}", "", text)
            vocabulary.update(word for word in TOKEN.findall(text.lower()) if ALPHABETIC.fullmatch(word))
        hashes[edition] = digest
    return vocabulary, hashes


def provenance(document, encoded, license_bytes, hashes, max_candidates):
    return "\n".join([
        "# Offline WordNet related-word data", "",
        "Generated by `sites/scripts/build-related-lexicon.py` using Python's standard library.", "",
        f"Source: [{SOURCE_URL}]({SOURCE_URL})", "",
        f"Archive SHA-256: `{SOURCE_SHA256}`", "",
        f"JSON SHA-256: `{hashlib.sha256(encoded).hexdigest()}`", "",
        f"Official LICENSE SHA-256: `{hashlib.sha256(license_bytes).hexdigest()}`", "",
        f"The JSON has {len(document['entries']):,} query keys, {len(document['exceptions']):,} morphology exceptions, and {len(document['vocabulary']):,} Bible vocabulary tokens.", "",
        f"Each query keeps at most {max_candidates} unique candidate words attested in the union of the catalog-approved corpus assets. Query keys themselves are not restricted to Bible vocabulary.", "",
        "Candidates follow the first two WordNet index senses per part of speech, ordered within noun, verb, adjective, then adverb. Later senses never contribute candidates, even when earlier senses have no qualifying Bible words. For each retained sense, same-synset words precede one-hop derivational (`+`) targets. Lexical source and target word indexes are respected even when compound words are excluded. Adjective syntactic markers are removed without changing word positions.", "",
        "Only single ASCII alphabetic words are included. Hypernyms, hyponyms, antonyms, similar-to links, gloss text, and other pointer types are not traversed. Exception lists preserve base-form order and merge duplicates across parts of speech. Runtime morphology and ranking are separate from this offline file.", "",
        f"The separate `derivations` map has {len(document['derivations']):,} source keys. It supports productive morphology only: one same-synset source peer may carry a word-index-correct lexical `+` derivation to its exact target word. These supported pairs are added in both directions across all senses, retaining only corpus-attested targets in each direction. No target-synset peers or further graph links are followed. For example, `wisdom` shares a source synset with `wiseness`, whose indexed `+` link targets `wise`; this is not mislabeled as a direct pointer from `wisdom`. Values are sorted support sets, not semantic rankings. Runtime must intersect this map with independently generated suffix/root candidates, rather than exposing it as unrestricted semantic suggestions. The first-two-sense `entries` are unchanged by this morphology support.", "",
        f"The separate `parts` map contains all {len(document['parts']):,} single ASCII alphabetic WordNet index lemmas, including words absent from the Bible and words with no qualifying semantic candidate. Values are bit flags merged across parts of speech: noun `1`, verb `2`, adjective `4`, adverb `8`. Runtime may use these grammatical facts to validate productive suffix/root candidates; they are not additional semantic relationships. The `parts` map does not change the first-two-sense `entries` or the bounded lexical-support `derivations` map.", "",
        "These are dictionary sense associations, not claims that every candidate is interchangeable in every Bible context. Only the first two source senses in each part of speech are eligible, and the candidate cap may shorten that ordered list further.", "",
        "The official license is copied byte-for-byte to `sites/public/WORDNET-LICENSE.txt` and its full text is also embedded in `source.license`. Preserve the copyright notice and disclaimer with redistributed copies.", "",
        "To regenerate from the `sites` directory (the archive remains outside Git):", "",
        "```text",
        "python scripts/build-related-lexicon.py --archive /path/to/WordNet-3.0.tar.gz --download",
        "python scripts/build-related-lexicon.py --archive /path/to/WordNet-3.0.tar.gz --check",
        "```", "",
        "The download flag only fetches a missing archive from the pinned official URL. Hash mismatches stop generation. `--check` compares the JSON, license, and provenance bytes without rewriting them. The raw archive and full WordNet database are not included in this repository.", "",
        "## Corpus inputs", "",
        "Vocabulary uses `[A-Za-z0-9_]+` token extraction after the same quote decoding and WEB editorial-note removal used by published verse text. Tokens are lowercased and retained only when the entire token is alphabetic; `love2` and `_love` do not contribute `love`. This matches runtime ASCII whole-word boundaries. Each input hash is checked against its ignored corpus manifest before generation.", "",
        "| Edition | Corpus JSON SHA-256 |", "| --- | --- |",
        *[f"| {edition} | `{digest}` |" for edition, digest in hashes.items()], "",
    ]).encode("utf-8")


def main():
    sites_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True, help="Official WordNet-3.0.tar.gz stored outside Git.")
    parser.add_argument("--download", action="store_true", help="Download the pinned official archive if it is missing.")
    parser.add_argument("--corpus-dir", type=Path, default=sites_root / "public/corpus")
    parser.add_argument("--contract", type=Path, default=sites_root.parent / "contracts/search.json")
    parser.add_argument("--output", type=Path, default=sites_root / "app/search/data/wordnet-related.json")
    parser.add_argument("--license-output", type=Path, default=sites_root / "public/WORDNET-LICENSE.txt")
    parser.add_argument("--provenance", type=Path, default=sites_root / "app/search/data/README.md")
    parser.add_argument("--max-candidates", type=int, choices=range(20, 31), default=25)
    parser.add_argument("--check", action="store_true", help="Verify exact output bytes without rewriting generated files.")
    args = parser.parse_args()
    files, license_bytes = read_archive(args.archive, args.download)
    vocabulary, hashes = corpus_vocabulary(args.corpus_dir, args.contract)
    document = {
        "schema": 1,
        "source": {"url": SOURCE_URL, "sha256": SOURCE_SHA256, "version": "3.0", "license": license_bytes.decode("ascii")},
        **compile_dictionary(files, vocabulary, args.max_candidates),
    }
    encoded = (json.dumps(document, ensure_ascii=True, separators=(",", ":")) + "\n").encode("utf-8")
    outputs = {
        args.output: encoded,
        args.license_output: license_bytes,
        args.provenance: provenance(document, encoded, license_bytes, hashes, args.max_candidates),
    }
    for path, content in outputs.items():
        if args.check:
            if not path.is_file() or path.read_bytes() != content:
                raise ValueError(f"Generated data drift: {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    print(json.dumps({
        "checked" if args.check else "generated": str(args.output),
        "entries": len(document["entries"]), "exceptions": len(document["exceptions"]),
        "derivations": len(document["derivations"]),
        "parts": len(document["parts"]),
        "vocabulary": len(vocabulary), "editions": len(hashes), "bytes": len(encoded),
        "gzip_bytes": len(gzip.compress(encoded, mtime=0)), "sha256": hashlib.sha256(encoded).hexdigest(),
    }))


if __name__ == "__main__":
    main()
