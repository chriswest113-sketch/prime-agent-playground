# Test 03 — Routing visibility vs programmatic retrieval

## Question

When harness entries accumulate past what the default system-prompt summary
renders, is the omitted content **absolutely invisible**, or merely **absent
from the default routing summary while remaining retrievable**?

## Hypothesis alternatives

| | Hypothesis |
| --- | --- |
| **H0** | ABSOLUTE INVISIBILITY — displaced state is unreachable by any in-process path. |
| **H1** | DEGRADED DEFAULT SALIENCE / ROUTING — displaced state is absent from the default prompt summary but retrievable through documented APIs. |

Five claims are scored independently, because "invisible" collapses all of them:

1. stored
2. included in the default routing summary
3. programmatically retrievable
4. spontaneously retrieved by an agent
5. successfully used during a task

## Source anchors

| Anchor | What it establishes |
| --- | --- |
| `packages/coding-agent/src/core/refinement/refinement.ts:26` | `DEFAULT_OVERVIEW_ENTRY_LIMIT = 6`. |
| `packages/coding-agent/src/core/refinement/refinement.ts:467-469` | Entries sort by `[path, title, id].join("\0").localeCompare(...)` — lexical. |
| `packages/coding-agent/src/core/refinement/refinement.ts:481,497-500` | `.slice(0, maxEntriesPerKind)` then an explicit `+N more` overflow line. |
| `packages/coding-agent/src/core/system-prompt.ts:106,141` | The system prompt calls `formatHarnessStateForPrompt` **without** `maxEntriesPerKind`, so the 6-entry default applies. |
| `packages/coding-agent/src/core/refinement/refinement.ts:522-546` | `overviewForPrompt` — the *refiner's* view — slices at 40, a different bound. |
| `prime-agent-runtime/src/rlm/harness.py:722` | Python `overview(max_entries_per_kind=20)` — a third bound. |
| `prime-agent-runtime/src/rlm/harness.py:403,426,771` | `get()`, `list()`, `snapshot()` are unbounded. |

## Design

15 global memory entries are seeded through `rlm.harness`. The hidden fact
`HIDDEN_HARNESS_FACT_83D2` is placed in an entry with `path='zzz/late'` and
title `'ZZ late sorting fact'` so it sorts *after* the 6-entry cut under the
documented `[path, title, id]` ordering. The system prompt compared against is
the one **actually sent to the provider**, captured from the faux provider's
`Context`, not a re-derivation.

## Exact command

```bash
npx tsx studies/joint-discriminating-tests/test-03-routing-vs-retrieval/run.ts
```

## Raw output

```
[PASS] T03.1: claim 1 STORED: the hidden fact is persisted in harness state -- id=zz_late_sorting_fact
[PASS] T03.2: the default summary renders only 6 of 15 stored memory entries -- rendered=6 stored=15
[PASS] T03.3: claim 2 NOT IN DEFAULT ROUTING SUMMARY: the hidden fact is absent from the system prompt actually sent
[PASS] T03.4: the omission is signalled, not silent: an explicit overflow count is rendered -- - +9 more memory entries
[PASS] T03.5: claim 3 RETRIEVABLE via TypeScript loadHarnessState()
[PASS] T03.6: claim 3 RETRIEVABLE via the same renderer with a raised entry limit (adjustable overview)
[PASS] T03.7: claim 3 RETRIEVABLE via Python rlm.harness.list()
[PASS] T03.8: claim 3 RETRIEVABLE via Python rlm.harness.get()
[PASS] T03.9: claim 3 RETRIEVABLE via Python rlm.harness.snapshot()
[PASS] T03.10: claim 3 RETRIEVABLE via Python rlm.get_harness_state()
[PASS] T03.11: the Python overview() default (20/kind) DOES surface the fact - the bound differs from the TS prompt renderer's 6/kind
[PASS] T03.12: bounding, not storage, is what hides the fact: the same Python overview at limit 6 also omits it
[PASS] T03.13: claim 3 (end-to-end): a tool call inside the agent loop recovers the hidden fact into the conversation
[PASS] T03.14: the tool turn's own system prompt still omitted the fact (recovery came from the tool, not the prompt)
```

The rendered memory section of the actual system prompt
(`artifacts/default-harness-section.txt`):

```
memory: 15
- [global:aa_filler_00] Routine lesson 00 (aaa/filler, v1): Filler harness memory number 00 ...
- [global:aa_filler_01] ...
- [global:aa_filler_02] ...
- [global:aa_filler_03] ...
- [global:aa_filler_04] ...
- [global:aa_filler_05] ...
- +9 more memory entries
```

## Result

**H1 — DEGRADED DEFAULT SALIENCE / ROUTING.** RUNTIME-CONFIRMED.

Per-claim scoring:

| # | Claim | Verdict | Evidence class |
| --- | --- | --- | --- |
| 1 | stored | **YES** | RUNTIME-CONFIRMED (T03.1) |
| 2 | included in the default routing summary | **NO** | RUNTIME-CONFIRMED (T03.2–T03.4) |
| 3 | programmatically retrievable | **YES**, by six independent paths | RUNTIME-CONFIRMED (T03.5–T03.13) |
| 4 | spontaneously retrieved by an agent | **NOT TESTED** | — requires a real model |
| 5 | successfully used during a task | **NOT TESTED** | — requires a real model and a held-out task |

Two further observations that sharpen the finding:

- **The omission is signalled, not silent.** The prompt states `memory: 15` and
  `+9 more memory entries`. A model reading the prompt is told that displaced
  entries exist and how many.
- **The bound is not one number, it is three.** The system prompt renders 6 per
  kind, the refiner's own overview 40, and the Python `overview()` 20. The same
  accumulation is therefore "hidden" at one boundary and visible at another —
  which is why "bounded rendering", not "invisibility", is the accurate
  description. T03.12 confirms the causal factor is the bound: the *same* Python
  renderer at limit 6 also omits the fact.

## What this result DOES establish

- Displaced harness state is stored, absent from the default prompt summary, and
  retrievable by `loadHarnessState()`, the same renderer at a raised limit,
  `rlm.harness.list/get/snapshot`, `rlm.get_harness_state`, and (end-to-end) a
  tool call inside a live agent loop.
- Bounded rendering — not storage or accessibility — is the mechanism.
- "Invisible" is too strong as an unqualified claim.

## What this result DOES NOT establish

- **Claim 4.** T03.13 scripts the model's decision to call the retrieval tool,
  because the faux provider's outputs are authored by the probe. It measures
  that the retrieval path *works through the agent loop*; it says nothing about
  whether a real model would choose to use it. The probe records
  `scriptedDecision: true` for exactly this reason.
- **Claim 5.** Nothing here measures task outcome.
- That the default bound is adequate or inadequate in practice. Degraded
  salience is demonstrated; its *cost* is unmeasured and is a real-model
  question.
- Behaviour of the retrieval paths from inside a real IPython/RLM kernel — no
  kernel was available in this environment. The Python paths were exercised in a
  plain subprocess against the same store.
