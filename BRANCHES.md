# Deployment branches

| GitHub branch | Deployment | Application |
| --- | --- | --- |
| `master` | <https://aaronjs.pythonanywhere.com> | Standalone Django application |
| `develop` | <https://mbab-bible-search.aaronjs99.chatgpt.site> | Latest Sites application and supporting code |

Use `develop` for ongoing Sites development. Publish the complete `sites/` and
`contracts/` directories from a validated `develop` commit, and record that branch
and commit in the Sites publication's source provenance. The native Sites source
repository has its own publishing branch; it is separate from GitHub's branches.

Deploy PythonAnywhere from reviewed `master` commits with a fast-forward pull and
web-app reload. Port selected fixes to `master` individually; do not merge the
Sites application and its Django refactor into the legacy application wholesale.

The PythonAnywhere application baseline is `7d810c24b52c1d7917d13dad08eb7462e96cdc0d`,
the last shared Django commit before Sites development. Its application files
were restored without rewriting Git history. PythonAnywhere returned its hosting
provider's Coming Soon page on October 14, 2026, so the running server's last
deployed commit could not be verified from the public endpoint.

The former `codex/sites-mbab-v2` work was merged in pull request #3 and is retained
in `develop`, including subsequent UI and verse-text fixes. The temporary branch
is retired; its commits remain reachable in Git history.
