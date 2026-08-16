# Joint Prime Agent discriminating tests

**Evidence artifact. Not a product change. Nothing here is production code.**

This is the joint discriminating-test phase of the Prime Agent reference study.
Two independent investigations (Claude and Codex) reached largely convergent
conclusions from the same baseline; their reciprocal cross-reviews left a small
number of genuine factual and architectural disagreements. This phase resolves
those, and only those, with the smallest runtime tests capable of discriminating
between the competing readings.

It is deliberately **not** another broad study, not a generalized evaluation
framework, and not the start of real-model self-improvement experiments.

## Scope

| In scope | Out of scope |
| --- | --- |
| Five discriminating tests + one bounded secondary question | Any broad re-survey of Prime Agent |
| Credential-free probes against the in-repo faux provider | Real-model or real-provider experiments |
| Preserving negative results and environment limits | Product improvements or refactors |
| A synthesis that accepts/rejects/revises specific prior claims | Concluding beyond what each test establishes |

## Layout

```
studies/joint-discriminating-tests/
├── README.md                        <- you are here
├── execution-envelope.md            HEAD, branch, versions, credentials, isolation, env deltas
├── convergence-context.md           why each test exists (the disagreement it settles)
├── results-matrix.md                the master matrix + preserved negative results
├── synthesis.md                     adjudication of the five candidate statements; SETTLED/… classification
├── unresolved.md                    everything still open, and why
├── audit-response.md                independent Codex audit of 91ce174 + adjudication
├── tsconfig.json                    so the probes are actually type-checked
├── run-all.sh                       re-run every probe
├── _lib/probe.ts                    shared helpers (isolation, artifacts, assertion log)
├── test-01-gate-refinement-coupling/    README.md · run.ts · artifacts/
├── test-02-turn-harness-attribution/    README.md · run.ts · artifacts/
├── test-03-routing-vs-retrieval/        README.md · run.ts · artifacts/
├── test-04-normalized-reproducibility/  README.md · run.ts · artifacts/
├── test-05-model-config-record/         README.md · run.ts · artifacts/
└── external-evaluator/                  README.md · run.ts · artifacts/
```

Each probe's `README.md` carries the full record required by the evidence
standard: question, hypothesis alternatives, source anchors, exact command,
environment, raw output, result, interpretation, and explicit
**DOES / DOES NOT establish** sections.

## Running

```bash
npm install --no-audit --no-fund     # then: git checkout -- package-lock.json
bash studies/joint-discriminating-tests/run-all.sh
```

Probes are standalone `tsx` scripts, not vitest tests, so the repository's own
test boundary is untouched. Each exits non-zero if any assertion fails; console
output is captured to `<probe>/artifacts/console-output.txt`.

Type-check them with:

```bash
npx tsgo --noEmit -p studies/joint-discriminating-tests/tsconfig.json
```

This is **not** covered by the repository's `npm run check`: `studies/` sits
outside its `tsconfig` include and biome globs. Skipping it the first time hid a
real defect — see `audit-response.md`.

## Headline results

| # | Question | Result |
| --- | --- | --- |
| 1 | Gate → refinement coupling | **UNTYPED TRANSCRIPT-MEDIATED TRANSPORT** — gate text reaches a subsequently invoked refinement; no typed linkage, no post-refinement gate validation. Transport, not causation |
| 2 | Turn-level harness attribution | Writer-purity-dependent. A `/refine`-only history reconstructs complete state exactly by reverse-replay; one foreign CRUD write breaks it **silently** |
| 3 | Routing visibility vs retrieval | **DEGRADED DEFAULT SALIENCE**, not absolute invisibility — displaced state is signalled and retrievable through six API surfaces over one store |
| 4 | Faux reproducibility | Non-canonical at byte/identifier/segmentation level; **semantically reproducible** after principled normalization, with input-token accounting a diagnosed environment-dependent exception |
| 5 | Model / configuration record | Nominal configuration recorded; effective configuration not. A clamped request records the post-clamp value and loses the request; a no-op records nothing |
| — | External evaluator loop | No typed, internally closed score → refinement protocol here. `DEFERRED — EXTERNAL REFERENCE STUDY REQUIRED` for the external side |

Latest full run: **6/6 probes PASS**, 93 assertions.

An independent Codex audit reproduced the suite in a different environment and
raised six scope corrections, all accepted — two of which required new tests
because this study had asserted claims it never tested. See
`audit-response.md`.

## Guarantees

- **No production source was modified, instrumented, or patched.** The only
  change in the working tree is this `studies/` directory.
- **Credential-free.** No provider keys are present; every probe records its own
  view of the credential surface in its `raw-result.json`.
- **Isolated.** Every probe redirects `PRIME_AGENT_CODING_AGENT_DIR` to a
  throwaway temp directory before any production module resolves it, so the
  operator's real `~/.prime/agent` is never touched.
- **Negative results preserved.** Failed initial designs, environment limits,
  untestable claims, and one claim this study got wrong are recorded in
  `results-matrix.md`, `unresolved.md` and `audit-response.md` rather than
  removed.

## Boundary

This phase stops after the five discriminating tests and the synthesis. It does
**not** proceed into real-model experiments. See the final section of
`synthesis.md` for the three findings that constrain the design of the next
phase.
