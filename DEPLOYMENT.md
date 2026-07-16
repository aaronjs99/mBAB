# mBAB deployment

mBAB has two production targets. The Django application runs on PythonAnywhere, while the modern public interface is deployed from `sites/` through OpenAI Sites.

## 1. PythonAnywhere

### Recommended Git workflow

Keep one long-lived checkout in the PythonAnywhere home directory and deploy only from the repository's protected production branch.

```bash
cd ~
git clone https://github.com/aaronjs99/mBAB.git
cd mBAB
python3.11 -m venv ~/.virtualenvs/mbab
source ~/.virtualenvs/mbab/bin/activate
pip install -r requirements.txt
./setup.sh
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py check --deploy
```

Configure the PythonAnywhere web app with:

- Source directory: `/home/aaronjs/mBAB`
- Working directory: `/home/aaronjs/mBAB`
- Virtual environment: `/home/aaronjs/.virtualenvs/mbab`
- WSGI application: `mBAB.wsgi.application`
- Hostname: `aaronjs.pythonanywhere.com`

For each later release:

```bash
cd ~/mBAB
git fetch origin
git checkout master
git pull --ff-only origin master
source ~/.virtualenvs/mbab/bin/activate
pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py check --deploy
```

Reload the PythonAnywhere web app only after every command succeeds. Avoid editing production files directly; make changes in Git, review them, then fast-forward the production checkout.

### PythonAnywhere environment

Provide these values through the host environment or a private `.env` file in the production checkout:

```dotenv
DJANGO_SECRET_KEY=replace-with-a-long-random-secret
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=aaronjs.pythonanywhere.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://aaronjs.pythonanywhere.com
```

Add one optional provider key for natural-language search and explanations:

```dotenv
GROQ_API_KEY=
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
```

Never commit this file or paste secrets into the WSGI source.

### Bible databases

The edition databases are runtime data, not Git source. `./setup.sh` downloads them from [aaronjs99/bible-databases](https://github.com/aaronjs99/bible-databases) into `databases/`.

Run the setup script on first deployment and whenever the database repository changes. The application returns a clear service error if a selected edition is missing.

## 2. OpenAI Sites

The Sites application lives in `sites/` and imports the canonical catalog from `contracts/search.json`. Its persistent project identifier is stored in `sites/.openai/hosting.json`; hosted access policy and deployment versions are managed by Sites. Publish from the full repository so the exact validated contract and frontend source stay together.

Validate locally before publishing:

```bash
cd sites
npm ci
npm run build:legacy-css
npm test
npx tsc --noEmit
npm run lint
npm audit --audit-level=high
```

The public production URL is:

<https://mbab-bible-search.aaronjs99.chatgpt.site>

## Release checklist

1. Confirm the intended Git diff and preserve local-only data.
2. Run the Django and Sites checks.
3. Commit one coherent release.
4. Publish the Sites version from the exact validated commit.
5. Merge or fast-forward the production branch.
6. Pull that branch on PythonAnywhere and run the deployment commands above.
7. Reload PythonAnywhere and verify both public URLs anonymously.

## Troubleshooting

- **Django cannot find an edition:** rerun `./setup.sh` and verify the corresponding file in `databases/`.
- **Static assets are stale:** rerun `collectstatic --noinput`, then reload the web app.
- **AI actions are unavailable:** verify one provider key is configured; exact and Boolean search do not require AI.
- **A deployment has local changes:** stop and reconcile them in Git instead of forcing a pull or resetting production.
