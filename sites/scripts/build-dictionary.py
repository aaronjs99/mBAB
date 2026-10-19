"""Build free, self-hosted English dictionary shards from official WordNet 3.0.

Only Python's standard library is required. The verified source archive remains
outside Git; the curated, licensed lexical assets are checked into public/.
"""

import argparse
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import tarfile
import urllib.request


SOURCE_URL = "https://wordnetcode.princeton.edu/3.0/WordNet-3.0.tar.gz"
SOURCE_SHA256 = "640db279c949a88f61f851dd54ebbb22d003f8b90b85267042ef85a3781d3a52"
DOCUMENTATION_URL = "https://wordnet.princeton.edu/documentation/wndb5wn"
LICENSE_URL = "https://wordnet.princeton.edu/license-and-commercial-use"
PARTS = (("noun", "n", "noun"), ("verb", "v", "verb"),
         ("adj", "a", "adjective"), ("adv", "r", "adverb"))
ASSET_LIMIT = 25 * 1024 * 1024
ADJECTIVE_MARKER = re.compile(r"\((?:a|p|ip)\)$")


def normalized_lemma(word):
    """Fold index keys while preserving phrases, hyphens, and apostrophes."""
    return ADJECTIVE_MARKER.sub("", word).replace("_", " ").lower()


def display_lemma(word):
    return ADJECTIVE_MARKER.sub("", word).replace("_", " ")


def parse_gloss(gloss):
    """Separate explicit examples without deleting text or repairing the source.

    WordNet examples are quoted clauses following semicolons. Semicolons inside
    examples are literal text. Definition clauses may also contain quotes, so a
    quoted phrase within a definition is not treated as an example. A handful
    of source glosses have unbalanced quotes: retain those whole as definitions.
    Composite examples and author attributions retain their original quotes.
    """
    gloss = gloss.strip()
    if gloss.count('"') % 2:
        return gloss, []
    segments = []
    start = 0
    quoted = False
    for index, character in enumerate(gloss):
        if character == '"':
            quoted = not quoted
        elif character == ";" and not quoted:
            segments.append(gloss[start:index].strip())
            start = index + 1
    segments.append(gloss[start:].strip())
    segments = [segment for segment in segments if segment]
    first_example = next((index for index, segment in enumerate(segments)
                          if segment.startswith('"')), len(segments))
    if first_example == len(segments):
        return gloss, []
    # An unquoted tail can be source prose or malformed example punctuation.
    # Keeping the complete gloss avoids silently assigning it the wrong role.
    if any(not segment.startswith('"') for segment in segments[first_example:]):
        return gloss, []
    definition = "; ".join(segments[:first_example])
    examples = []
    for segment in segments[first_example:]:
        if segment.count('"') == 2 and segment.endswith('"'):
            examples.append(segment[1:-1])
        else:
            examples.append(segment)
    return definition, examples


@dataclass(frozen=True, slots=True)
class Synset:
    words: tuple[str, ...]
    definition: str
    examples: tuple[str, ...]


def compile_dictionary(files, warnings=None):
    """Keep every indexed sense, ordered by noun, verb, adjective, then adverb."""
    synsets = {}
    warnings = warnings if warnings is not None else []
    for part, expected_pos, _ in PARTS:
        for line in files[f"data.{part}"].splitlines():
            if not line or line[0].isspace():
                continue
            fields_text, separator, gloss = line.partition("|")
            if not separator:
                raise ValueError(f"Missing data.{part} gloss delimiter.")
            fields = fields_text.split()
            if len(fields) < 5:
                raise ValueError(f"Malformed data.{part} synset.")
            offset, pos, count = int(fields[0]), fields[2], int(fields[3], 16)
            pos = "a" if pos == "s" else pos
            if pos != expected_pos or count < 1 or len(fields) < 5 + 2 * count:
                raise ValueError(f"Invalid data.{part} synset at {offset}.")
            words = tuple(display_lemma(fields[4 + 2 * index]) for index in range(count))
            definition, examples = parse_gloss(gloss)
            if not definition:
                raise ValueError(f"Missing data.{part} definition at {offset}.")
            if gloss.count('"') % 2:
                warnings.append({"part": part, "offset": offset,
                                 "reason": "Unbalanced source quotes; complete gloss retained as definition."})
            key = (pos, offset)
            if key in synsets:
                raise ValueError(f"Duplicate synset {key}.")
            synsets[key] = Synset(words, definition, tuple(examples))

    entries = {}
    indexed_senses = {}
    for part, pos, label in PARTS:
        for line in files[f"index.{part}"].splitlines():
            if not line or line[0].isspace():
                continue
            fields = line.split()
            if len(fields) < 6:
                raise ValueError(f"Malformed index.{part} entry.")
            word = normalized_lemma(fields[0])
            count, pointer_count = int(fields[2]), int(fields[3])
            offsets = fields[6 + pointer_count:]
            if (fields[1] != pos or len(offsets) != count
                    or int(fields[4 + pointer_count]) != count or count < 1):
                raise ValueError(f"Malformed index.{part} entry for {word}.")
            for raw_offset in offsets:
                key = (pos, int(raw_offset))
                synset = synsets.get(key)
                if synset is None or word not in [item.lower() for item in synset.words]:
                    raise ValueError(f"Index entry {word} refers to a missing sense {key}.")
                if key in indexed_senses.setdefault(word, set()):
                    continue
                indexed_senses[word].add(key)
                synonyms = []
                seen = {word}
                for item in synset.words:
                    normalized = item.lower()
                    if normalized not in seen:
                        synonyms.append(item)
                        seen.add(normalized)
                entries.setdefault(word, []).append({
                    "pos": label, "definition": synset.definition,
                    "examples": list(synset.examples), "synonyms": synonyms,
                })

    exceptions = {}
    for part, _, label in PARTS:
        exceptions[label] = {}
        for line in files[f"{part}.exc"].splitlines():
            fields = line.split()
            if not fields:
                continue
            if len(fields) < 2:
                raise ValueError(f"Malformed {part}.exc entry.")
            word = normalized_lemma(fields[0])
            bases = exceptions[label].setdefault(word, [])
            for raw_base in fields[1:]:
                base = normalized_lemma(raw_base)
                if base not in bases:
                    bases.append(base)
        exceptions[label] = dict(sorted(exceptions[label].items()))
    return dict(sorted(entries.items())), exceptions


def encode_json(document):
    return (json.dumps(document, ensure_ascii=True, separators=(",", ":")) + "\n").encode("utf-8")


def serialize_dictionary(entries, exceptions, license_bytes):
    license_text = license_bytes.decode("ascii")
    partitions = {}
    for word in sorted(entries):
        letter = word[0] if word and "a" <= word[0] <= "z" else "other"
        partitions.setdefault(letter, {})[word] = entries[word]
    outputs = {}
    letters = {}
    for letter, words in sorted(partitions.items()):
        file_name = f"{letter}.json"
        encoded = encode_json({"schema": 1, "letter": letter,
                               "license": license_text, "entries": words})
        if len(encoded) >= ASSET_LIMIT:
            raise ValueError(f"Dictionary shard exceeds the deployment asset limit: {letter}.")
        outputs[file_name] = encoded
        letters[letter] = {"file": file_name, "sha256": hashlib.sha256(encoded).hexdigest(),
                           "bytes": len(encoded), "entries": len(words)}
    manifest = {
        "schema": 1,
        "source": {"name": "Princeton WordNet", "version": "3.0", "url": SOURCE_URL,
                   "sha256": SOURCE_SHA256, "documentation": DOCUMENTATION_URL,
                   "licenseUrl": LICENSE_URL, "license": license_text,
                   "licenseSha256": hashlib.sha256(license_bytes).hexdigest()},
        "entryCount": len(entries), "senseCount": sum(len(senses) for senses in entries.values()),
        "letters": letters, "exceptions": exceptions,
    }
    outputs["manifest.json"] = encode_json(manifest)
    outputs["LICENSE.txt"] = license_bytes
    return outputs


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
        files = {name: member("dict/" + name).decode("ascii")
                 for part, _, _ in PARTS
                 for name in (f"data.{part}", f"index.{part}", f"{part}.exc")}
    return files, license_bytes


def build_provenance(outputs, warnings):
    manifest = json.loads(outputs["manifest.json"])
    return {
        "schema": 1, "source": manifest["source"],
        "generator": {"file": "sites/scripts/build-dictionary.py",
                      "sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                      "runtime": "Python standard library"},
        "entryCount": manifest["entryCount"], "senseCount": manifest["senseCount"],
        "exceptionCounts": {pos: len(forms) for pos, forms in manifest["exceptions"].items()},
        "files": {name: {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
                  for name, content in sorted(outputs.items())},
        "sourceWarnings": warnings,
    }


def readme(provenance):
    return "\n".join([
        "# Free English dictionary data", "",
        "Generated by `sites/scripts/build-dictionary.py` from Princeton WordNet 3.0 using Python's standard library.", "",
        f"Source: [{SOURCE_URL}]({SOURCE_URL})", "",
        f"Official archive SHA-256: `{SOURCE_SHA256}`", "",
        f"The assets contain {provenance['entryCount']:,} indexed English words and phrases and {provenance['senseCount']:,} senses across nouns, verbs, adjectives, and adverbs. They are a general English dictionary, not a Hebrew or Greek lexicon or a source of Bible interpretation.", "",
        "Every index sense is retained in its source order within each part of speech. Parts of speech are ordered noun, verb, adjective, then adverb. Adjective satellites share the adjective category; a synset is included once per indexed lemma. Source underscores become spaces, adjective syntactic markers are removed, and lowercase keys preserve hyphens, apostrophes, numbers, and other original punctuation. Synonyms retain the source display capitalization and order, excluding the lookup lemma and case-insensitive duplicates.", "",
        "Definitions and examples reproduce source gloss text. Only explicitly quoted, balanced trailing example clauses are separated from a definition. Semicolons inside quoted examples and quotes inside definition prose are preserved. Outer quotes are removed from a simple example; composite examples and author attributions retain their exact quote punctuation. Malformed source quotes are not repaired: the complete gloss stays in the definition. The exact 20 affected synsets are listed in `provenance.json`.", "",
        "The manifest contains all four source morphology exception maps, preserving each base-form order. Some official exception bases do not have dictionary entries; runtime lookup must check that an entry exists and that its part of speech matches. The maps are grammatical lookup aids and do not assert a synonym relationship.", "",
        "`sites/public/dictionary/manifest.json` maps first-letter partitions to their SHA-256 hashes and byte sizes. Each of the 27 shards is fetched only when needed. The `other` shard covers lemmas starting with punctuation or digits. Every shard and the manifest carry the full official license; `LICENSE.txt` is also preserved byte-for-byte.", "",
        "WordNet permits use, copying, modification, and distribution without fee or royalty when its full copyright notice and disclaimer are preserved. See the [official terms](https://wordnet.princeton.edu/license-and-commercial-use) and [file-format documentation](https://wordnet.princeton.edu/documentation/wndb5wn).", "",
        "The curated dictionary assets are tracked with their generator and provenance, like the existing offline related-word lexicon. The raw source archive stays outside Git. No API key, payment, hosted dictionary service, model, or query-data transfer is required.", "",
        "From `sites/`, regenerate or verify exact bytes:", "", "```text",
        "python scripts/build-dictionary.py --archive /path/to/WordNet-3.0.tar.gz --download",
        "python scripts/build-dictionary.py --archive /path/to/WordNet-3.0.tar.gz --check",
        "python -m unittest discover -s tests -p test_dictionary_builder.py", "```", "",
        "`--download` fetches a missing archive only from the pinned official URL. A hash mismatch stops generation. `--check` compares every public asset, the retained source license, and provenance without rewriting them. It also fails if an unexpected file has appeared in the dictionary asset directory. JSON uses deterministic compact ASCII encoding with LF newlines. See `provenance.json` for all asset hashes, generator hash, source warnings, and counts.", "",
    ]).encode("utf-8")


def main():
    sites_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=sites_root / "public/dictionary")
    parser.add_argument("--provenance-dir", type=Path, default=sites_root / "app/search/data/dictionary")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    files, license_bytes = read_archive(args.archive, args.download)
    warnings = []
    entries, exceptions = compile_dictionary(files, warnings)
    assets = serialize_dictionary(entries, exceptions, license_bytes)
    provenance = build_provenance(assets, warnings)
    outputs = {args.output_dir / name: content for name, content in assets.items()}
    outputs[args.provenance_dir / "provenance.json"] = encode_json(provenance)
    outputs[args.provenance_dir / "README.md"] = readme(provenance)
    if args.check and args.output_dir.is_dir():
        unexpected = {path.name for path in args.output_dir.iterdir()} - set(assets)
        if unexpected:
            raise ValueError(f"Unexpected dictionary assets: {sorted(unexpected)}")
    for path, content in outputs.items():
        if args.check:
            if not path.is_file() or path.read_bytes() != content:
                raise ValueError(f"Generated data drift: {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    print(json.dumps({"checked" if args.check else "generated": str(args.output_dir),
                      "entries": len(entries), "senses": provenance["senseCount"],
                      "shards": len(assets) - 2, "bytes": sum(map(len, assets.values())),
                      "largest_shard_bytes": max(info["bytes"] for info in provenance["files"].values()),
                      "source_warnings": len(warnings),
                      "manifest_sha256": hashlib.sha256(assets["manifest.json"]).hexdigest()}))


if __name__ == "__main__":
    main()
