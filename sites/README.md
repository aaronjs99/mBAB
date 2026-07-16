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
npm run dev
npm run build
npx tsc --noEmit
npm run lint
node --test tests/rendered-html.test.mjs
```

The legacy Django application remains at the repository root. This directory is
the deployable ChatGPT Sites application and contains its own hosting metadata.

