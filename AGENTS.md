# mBAB PythonAnywhere application

- `master` retains the standalone Django application for `aaronjs.pythonanywhere.com`.
- The latest Sites application and supporting refactor are on `develop`. See `BRANCHES.md`.
- Port selected fixes to this branch individually; do not merge the Sites application and Django refactor wholesale.
- Deploy reviewed `master` commits through a fast-forward pull and PythonAnywhere web-app reload.
- Keep installed Bible databases, runtime configuration, credentials and generated output outside Git.
- Preserve unrelated local edits and media.
- Check Django configuration, relevant search behavior and JavaScript syntax before releases.
