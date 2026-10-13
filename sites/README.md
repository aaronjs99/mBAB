# mBAB Sites

The Sites-native frontend for **mBAB — Multi-Book Advanced Bible Search**.

## Product surface

- transparent all-word, any-word, and grouped Boolean search
- all 66 books plus curated and custom book scopes
- public-domain/open-text editions exposed by default
- server-side query handling, safe rendering, pagination, and shareable queries
- accessible responsive interface, dark mode, and device-local saved verses
- chapter reading and verse-aligned edition comparison from results or saved verses
- guarded server bridge to the existing mBAB search corpus

## Development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run build:legacy-css
npm run dev
```

The legacy Django application remains at the repository root. This directory is
the Sites application and contains its own hosting metadata. Both frontends import
their edition and book metadata from the repository-level `contracts/search.json`.
The same Node toolchain compiles the tracked Django stylesheet, keeping the legacy
host free of browser-time CSS build dependencies.

Set `MBAB_LEGACY_SEARCH_URL` in the Sites environment only when the Django
search endpoint moves from its default PythonAnywhere location.

For a fully local search session, run Django on port 8000, copy this directory's
`.env.example` to `.env.local`, and then start Sites. `MBAB_LEGACY_SEARCH_URL`
routes keyword searches and `MBAB_CHAPTER_URL` routes reference lookups to the
local corpus. The Vite adapter passes these two settings into the Worker runtime;
it does not forward unrelated environment variables. Without overrides, the
existing public endpoints and reference fallback sources are used.

## Search sessions

Results retain the query, edition, book scope, case setting, and page that produced
them. Editing the form leaves those results in place and shows a reminder to search
again. Pagination and sharing use the submitted settings. Shared links run on load,
and browser back/forward restores previous searches. Cancel stops a pending request;
an error keeps previous results visible and offers a retry of the failed search.
Saved verses are only marked saved after the browser confirms storage succeeded.

The URL helpers live in `app/search/search-location.ts`, request and navigation
state in `app/search/use-search-session.ts`, and device persistence in
`app/search/browser-storage.ts`. `app/search/search-response.ts` validates both
incoming results and stored verses. Presentation components continue to receive props.
The interface uses system fonts and a local SVG favicon, so Windows previews do
not depend on generated font file URLs. Social previews retain the existing local
`public/og.png` card.

## Read in context

Each result and saved verse opens a chapter reader without changing the search URL,
form, results, or page. It starts with the selected verse and two verses on either
side. “Read full chapter” expands the text; the selected verse stays marked.
Choose another edition to compare wording by verse number. Missing verses are
identified explicitly. Comparison failures have their own retry and leave the
original text available. Close or Escape returns focus to the original control.

The thin `/api/chapter` route validates the shared catalog and chapter coordinates.
It reuses the reference providers and checks text shape and source identity.
`app/search/use-chapter-reader.ts` owns independent requests, cancellation and retry;
`ChapterReader` receives explicit props. Closing the reader cancels its requests,
and late responses cannot replace a newer edition. Source failures are errors;
an empty chapter receives a distinct response.

Advanced search accepts `AND` and `OR` between operands, including grouped
expressions such as `(love OR mercy)+grace`. Use symbols to search those words
literally: `love+and` requires both “love” and “and”. Single `and` or `or` searches
also remain literal. All-word and any-word modes treat every entered word as text.
Highlighting uses the compiled expression, so textual operators are not highlighted.

## Verification

```bash
npm test                  # Build, domain, storage, chapter, and rendered-page checks
npm run test:unit         # Fast domain checks during development
npm run typecheck
npm run lint
npm run build
npm run test:built        # Rendered production page and built API validation
npm run test:browser      # Browser workflows against the local Django corpus
```

Browser tests require the Django dependencies and the existing KJV and WEB corpus
files in `../databases/`. They start Django on `127.0.0.1:8008` and Sites on
`localhost:3018`, reusing those servers outside CI if they are already running.
Use a Python environment with the root `requirements.txt` installed; set
`MBAB_TEST_PYTHON` to its executable when it is not the shell's `python`.
Use `npx playwright install chromium` once, or set `MBAB_TEST_BROWSER=chrome`
to use an installed Chrome. Traces are kept in the operating system's temporary
directory on failure; `MBAB_TEST_OUTPUT` can select another directory.

Run `python manage.py check` from the repository root alongside frontend validation.
The focused backend regression suites can be run without restoring the previously
removed test files:

```bash
python manage.py test searchapp.tests.test_search_routing searchapp.tests.test_connection_lifecycle
```

The browser suite exercises real keyword, edition, scope, and reference requests;
network failure, malformed-data, and delay scenarios intercept the API.
