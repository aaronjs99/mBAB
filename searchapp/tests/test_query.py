from django.test import SimpleTestCase

from searchapp.query import (
    QueryKind,
    classify_query,
    compile_query,
    fallback_expression,
    parse_reference,
    to_postfix,
    tokenize,
)


class ReferenceTests(SimpleTestCase):
    def test_parses_chapter_verse_and_range(self):
        reference = parse_reference("John 3:16")
        self.assertIsNotNone(reference)
        self.assertEqual(reference.book_id, 42)
        self.assertEqual(reference.chapter, 3)
        self.assertEqual(reference.start_verse, 16)
        self.assertEqual(reference.end_verse, 16)

        verse_range = parse_reference("John 3:16-21")
        self.assertEqual(verse_range.start_verse, 16)
        self.assertEqual(verse_range.end_verse, 21)

    def test_parses_chapter_and_rejects_unknown_book(self):
        chapter = parse_reference("John 3")
        self.assertEqual(chapter.chapter, 3)
        self.assertIsNone(chapter.start_verse)
        self.assertIsNone(parse_reference("NotABook 1:1"))


class BooleanQueryTests(SimpleTestCase):
    def test_tokenizes_and_respects_precedence(self):
        self.assertEqual(tokenize("(love AND hope) OR faith"), ["(", "love", "+", "hope", ")", ",", "faith"])
        self.assertEqual(to_postfix(["A", "+", "B", ",", "C"]), ["A", "B", "+", "C", ","])

    def test_compiles_parameterized_and_query(self):
        compiled = compile_query("love + hope")
        self.assertEqual(compiled.where_clause, "(verse REGEXP ? AND verse REGEXP ?)")
        self.assertEqual(compiled.parameters, (r"\blove\b", r"\bhope\b"))
        self.assertEqual(compiled.highlight_terms, ("love", "hope"))

    def test_compiles_reference(self):
        compiled = compile_query("John 3:16")
        self.assertEqual(compiled.where_clause, "Book = ? AND Chapter = ? AND Versecount = ?")
        self.assertEqual(compiled.parameters, (42, 3, 16))

    def test_rejects_malformed_and_raw_sql(self):
        with self.assertRaisesRegex(ValueError, "Unmatched opening parenthesis"):
            compile_query("(love + hope")
        with self.assertRaisesRegex(ValueError, "Add \\+"):
            compile_query("love hope")
        with self.assertRaisesRegex(ValueError, "Raw SQL"):
            compile_query("SELECT * FROM bible")

    def test_classification_and_deterministic_fallback(self):
        self.assertEqual(classify_query("John 3:16"), QueryKind.REFERENCE)
        self.assertEqual(classify_query("hope + love"), QueryKind.STANDARD)
        self.assertEqual(classify_query("show me verses about hope"), QueryKind.NATURAL)
        self.assertEqual(fallback_expression("show me verses about love and mercy"), "love+mercy")
