# mBAB Sites

The Sites-native frontend for **mBAB — Multi-Book Advanced Bible Search**.

## Product surface

- transparent all-word, any-word, and grouped Boolean search
- all 66 books plus curated and custom book scopes
- public-domain/open-text editions exposed by default
- server-side validation, safe rendering, pagination, and shareable queries
- accessible responsive interface, dark mode, and device-local saved verses
- guarded server bridge to the existing mBAB search corpus

## Development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run build:legacy-css
npm run dev
npm test
npx tsc --noEmit
npm run lint
npm audit --audit-level=high
```

The legacy Django application remains at the repository root. This directory is
the Sites application and contains its own hosting metadata. Both frontends import
their edition and book metadata from the repository-level `contracts/search.json`.
The same Node toolchain compiles the tracked Django stylesheet, keeping the legacy
host free of browser-time CSS build dependencies.
