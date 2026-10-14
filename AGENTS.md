# mBAB Repository Conventions

## Architecture

- Keep `contracts/search.json` as the canonical cross-runtime contract for Bible books, editions, search modes, and book groups. Django and Sites must consume it; do not duplicate the catalog in Python or TypeScript.
- Keep Django HTTP handling thin in `searchapp/views.py`.
- Put query parsing and Boolean compilation in `searchapp/query.py`, SQLite access in `searchapp/repository.py`, search orchestration in `searchapp/search.py`, catalog loading in `searchapp/catalog.py`, and optional model-provider behavior in `searchapp/ai.py`.
- Keep Sites domain code in `sites/app/search/` and UI components in `sites/app/components/search/`. Components should receive explicit props instead of importing controller state.
- Prefer one canonical implementation over compatibility wrappers or parallel module names. When a module is renamed, update callers and remove the old module.

## Configuration and data

- Keep runtime configuration injectable through environment variables or explicit constructor/function arguments.
- Keep Bible SQLite databases in `databases/`; they are runtime data and must not be committed.
- Keep generated builds, installed dependencies, caches, collected static files, and local output outside Git.
- Do not add copyrighted editions to a public interface without confirming redistribution terms.

## Tests and release checks

- Organize Django tests by architectural concern under `searchapp/tests/`.
- Test public contracts and end-to-end concepts, not every private helper.
- Before finalizing, run Django checks/tests, JavaScript syntax checks, the Sites build, TypeScript, lint, rendered-site tests, and a live search smoke test.
- Preserve unrelated user files and changes, including untracked media.

## Git and deployment

- `master` retains the standalone PythonAnywhere application; `develop` holds the latest Sites version. Use `develop` for ongoing Sites development. See `BRANCHES.md`.
- Publish Sites only from a validated GitHub `develop` commit and record that branch and commit in publication provenance. The native Sites repository's publishing branch is separate.
- Port selected fixes to `master` individually; do not merge the Sites application and Django refactor into the PythonAnywhere application wholesale.
- Keep commits coherent and report whether they are local, pushed to GitHub, and deployed to Sites or PythonAnywhere.
- Sites publishes the exact validated source and build. PythonAnywhere updates should come from a reviewed Git commit followed by a fast-forward pull and reload, never direct production edits.
