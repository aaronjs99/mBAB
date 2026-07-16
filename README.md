# mBAB — Multi-Book Advanced Bible Search

mBAB is a focused Scripture search engine for combining words, controlling Boolean logic, and searching an exact set of Bible books. It is available through two maintained web surfaces:

- [Public mBAB Sites app](https://mbab-bible-search.aaronjs99.chatgpt.site) — the modern, public search experience
- [mBAB on PythonAnywhere](https://aaronjs.pythonanywhere.com) — the original Django application with optional AI-assisted parsing

## What mBAB does

- Searches all 66 books or any custom book selection
- Supports **all words**, **any word**, and grouped Boolean expressions
- Recognizes direct references such as `John 3:16` and `John 3:16-21`
- Offers 11 public-domain or openly licensed editions
- Highlights matches and preserves canonical Bible order
- Saves verses locally on the visitor's device
- Creates shareable, reproducible searches
- Adds optional natural-language parsing and verse explanations when an LLM provider is configured

## Repository map

```text
mBAB/
├── mBAB/                  # Django project settings and root routes
├── searchapp/             # PythonAnywhere/Django search application
│   ├── static/            # Django images and static assets
│   └── templates/         # Django HTML templates
├── sites/                 # Public Sites application and hosting metadata
│   ├── app/               # Search UI and API route
│   ├── public/            # Social preview assets
│   ├── tests/             # Render and API smoke tests
│   └── worker/            # Cloudflare-compatible worker entrypoint
├── .github/workflows/     # Python and Sites continuous integration
├── setup.sh               # Downloads the external Bible databases
└── Makefile               # Common Django and Sites commands
```

Generated output, local databases, secrets, caches, and installed dependencies are intentionally excluded from Git.

## Bible editions and data

The searchable SQLite files live in the separate [bible-databases repository](https://github.com/aaronjs99/bible-databases). The public mBAB interfaces currently expose:

`AKJV`, `ASV`, `BBE`, `BSB`, `DBY`, `GEN`, `KJV`, `UKJV`, `WBT`, `WEB`, and `YLT`.

Install the databases locally with:

```bash
./setup.sh
```

The `databases/` directory is local runtime data and is not committed to this repository.

## Django development

Requires Python 3.11 or newer.

```bash
python -m venv venv
source venv/bin/activate       # Windows PowerShell: venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
./setup.sh
python manage.py migrate
python manage.py runserver
```

Useful checks:

```bash
python manage.py check
python manage.py test
python -m compileall -q mBAB searchapp
```

## Sites development

Requires Node.js 22.13 or newer.

```bash
cd sites
npm ci
npm run dev
```

Run the full Sites validation suite with:

```bash
npm run build
npx tsc --noEmit
npm run lint
node --test tests/rendered-html.test.mjs
```

## Configuration

Copy `.env.example` to an untracked `.env` file or provide the same values through the host environment.

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Django signing key |
| `DJANGO_DEBUG` | Enables local debug mode when set to `true` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated Django hostnames |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Comma-separated trusted HTTPS origins |
| `GROQ_API_KEY` | Optional Groq natural-language features |
| `DEEPSEEK_API_KEY` | Optional DeepSeek natural-language features |
| `OPENAI_API_KEY` | Optional OpenAI natural-language features |

Without an LLM key or local Ollama server, exact reference and Boolean search still work normally.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the production workflow.

## Credits

mBAB was created by Aaron John Sabu. Formatting and design feedback was provided by Sabu John, Jessy Sabu John, and other early users. Flask development support was provided by [@hbhoyar](https://github.com/hbhoyar). The database corpus builds on work originally published by [@scrollmapper](https://github.com/scrollmapper) and subsequently cleaned and reorganized for mBAB.

## License

Copyright © 2025 Aaron John Sabu.

The project source is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International license](LICENSE). Bible text licensing varies by edition; downstream users are responsible for respecting each edition's terms.
