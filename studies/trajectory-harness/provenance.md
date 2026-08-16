# Baseline Provenance

Recorded before experimentation on 2026-08-15 UTC.

| Field | Recorded value |
|---|---|
| Repository path | `/workspace/prime-agent-playground` |
| Initial branch | `work` |
| Baseline HEAD | `97b994c3d7c45ca1ae635190e91e9e58ddf2577c` |
| Commit subject | `feat(daemon): supervisor-owned rlm spawn ledger as family authority (#1387)` |
| Author date | `2026-08-14 23:03:09 +0200` |
| Commit date | `2026-08-14 14:03:09 -0700` |
| Study branch | `study/trajectory-harness-baseline` |
| Remotes | None configured (`git remote -v` produced no output) |
| Upstream tracking | Unknown; `git branch -vv` exposed no tracking branch |
| Default branch | Unknown; no remote metadata or symbolic remote HEAD exists |
| Baseline provenance | Unknown beyond the local commit metadata; no upstream relationship is inferable |
| Initial worktree | Clean (`git status --short --branch` printed only `## work`) |

The substantive study artifacts were created only after switching from `work` to the named study branch. No upstream push was attempted.

## Recording commands

```text
pwd
git status --short --branch
git remote -v
git rev-parse HEAD
git branch -vv
git log -1 --format=fuller
git switch -c study/trajectory-harness-baseline
```
