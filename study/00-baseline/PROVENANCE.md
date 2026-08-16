# Provenance Record — Prime Agent Reference Study

Recorded at study start. Facts only; unverifiable items marked UNKNOWN.

## Working copy
- Path: `/home/user/prime-agent-playground`
- Baseline commit: `97b994c3d7c45ca1ae635190e91e9e58ddf2577c`
- Commit date: Fri Aug 14 2026 23:03:09 +0200
- Commit subject: `feat(daemon): supervisor-owned rlm spawn ledger as family authority (#1387)`
- Declared version (`package.json`): `0.7.2`

## Remotes
- `origin` = `https://github.com/chriswest113-sketch/prime-agent-playground` (fetch + push)
- Upstream remote (`PrimeIntellect-ai/prime-agent`): **NOT CONFIGURED** in this clone.

## History completeness
- `git rev-parse --is-shallow-repository` => **true**
- `.git/shallow` present, 1 grafted boundary.
- Local history depth: 50 commits, earliest visible `cea90f8` (Wed Aug 5 2026).
- **Consequence:** the local history is a truncated window (~10 days). Any claim about
  the project's long-run evolution, feature introduction dates, or authorship history
  CANNOT be established from this clone. Marked UNKNOWN unless corroborated by
  in-tree evidence (CHANGELOGs, docs) or explicit upstream lookup.

## Fork/upstream correspondence
- Whether this fork's tree is identical to upstream `PrimeIntellect-ai/prime-agent`
  at any commit: **UNKNOWN**. No upstream remote, no merge-base available locally.
- Branch `main` and study branch `claude/prime-agent-reference-study-96e84w` are
  identical at study start (`git rev-list --count main..HEAD` = 0).

## Baseline invariants to preserve
- `main` is the baseline. All study mutations land on the study branch only.
- Any experiment that mutates source is recorded in `study/02-experiments/` with the
  exact diff and is reverted before the next measurement unless stated otherwise.
