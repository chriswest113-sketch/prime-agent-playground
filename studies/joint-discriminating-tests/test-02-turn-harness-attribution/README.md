# Test 02 — Turn-level harness attribution

## Question

How much of the harness mutation timeline can an independent investigator
reconstruct from the persisted session and harness records?

## Hypothesis alternatives

| | Hypothesis |
| --- | --- |
| **H0** | Full provenance: the complete effective harness state at any turn is recoverable. |
| **H1** | Partial, writer-dependent provenance: `/refine` is attributable, direct CRUD is not, and complete effective state is recoverable under neither. |
| **H2** | No provenance: harness mutations are unattributable regardless of writer. |
| **H3** | Writer-purity-dependent: a `/refine`-only history is fully reconstructible from its ordered edit log; any foreign writer destroys that. |

H3 was added after an independent audit; the first version of this study did not
consider it and asserted the second half of H1 without testing it.

The brief explicitly forbids reducing this to a binary, so the deliverable is a
matrix, not a verdict.

## Design

The same minimal session shape is built twice, once per writer:

```
message A  ->  ONE distinctive harness edit  ->  message B
```

- **Writer A** — TypeScript `/refine`. A setup refinement seeds the entry
  *before* message A, so the between-A-and-B edit is an **update** and therefore
  actually exercises before-state reconstruction. (A `create` legitimately has
  no before value; that is recorded separately as `T02.A0`.)
- **Writer B** — direct Python `rlm.harness.create_memory(...)` in a subprocess,
  addressed through `RLM_HARNESS_STATE_DIR` — the same env var
  `agent-session.ts:8913` sets for the RLM kernel.

A third section, **Writer C**, was added after an independent audit observed
that the first version of this study *asserted* complete-state
unreconstructibility rather than testing it. It builds a three-refinement
history (create ×2 → update + delete → create + update), records ground-truth
harness state at each checkpoint, then reconstructs earlier checkpoints purely
by reverse-replaying the ordered `appliedEdits` read from the session JSONL off
the final state. It runs twice: once `/refine`-only, once with a direct CRUD
write interleaved.

## Source anchors

| Anchor | What it establishes |
| --- | --- |
| `packages/coding-agent/src/core/agent-session.ts:7934` | `/refine` appends a `custom` session entry with `customType: "prime-agent.refinement"`. |
| `packages/coding-agent/src/core/session-manager.ts:96-101` | Every session entry has `id`, `parentId`, `timestamp` — the tree anchor. |
| `packages/coding-agent/src/core/refinement/refinement.ts:85-91` | `AppliedRefinementEdit` carries `before` and `after` full-entry snapshots. |
| `packages/coding-agent/src/core/refinement/refinement.ts:874-877` | Refinement ids are `refine_<UTC digits>`, which sort chronologically. |
| `packages/coding-agent/src/core/refinement/refinement.ts:783-790` | `applyRefinementProposal` also appends an event to `state.refinements`. |
| `prime-agent-runtime/src/rlm/harness.py:345-400` | `_upsert` mutates in place and calls `save()`. No before value is kept, no event is appended, nothing session-side is written. |
| `packages/coding-agent/src/core/session-manager.ts:103-106` | `SessionMessageEntry` stores only the `AgentMessage`; there is no system-prompt or harness field. |

## Exact command

```bash
npx tsx studies/joint-discriminating-tests/test-02-turn-harness-attribution/run.ts
```

## Raw output

```
[PASS] T02.A0: a create edit records NO before key (correct: nothing existed), so before-state reconstruction must be tested with an update
[PASS] T02.A1: the /refine mutation is recorded in the session JSONL
[PASS] T02.A2: the refinement entry has a tree position (id + parentId) and a timestamp -- id=fa0e40d0 parentId=efdd5ab3 ts=2026-08-16T02:45:16.931Z
[PASS] T02.A3: messages before and after the refinement are separable by tree/append order -- before=2 after=2
[PASS] T02.A4: post-refinement messages descend from the refinement entry in the parent chain
[PASS] T02.A5: the refinement record carries an explicit before state for the edited entry -- before={"id":"t02_distinctive_edit",...,"content":"T02_HARNESS_EDIT_MARKER_V1 seeded before message A.",...,"version":1}
[PASS] T02.A6: the refinement record carries an explicit after state for the edited entry
[PASS] T02.A7: the refinement record does NOT contain a full harness snapshot (only per-edit before/after) -- RefinementResult keys: ["appliedEdits","expectedOutcome","harnessStatePath","id","rationale","scope","summary"]
[PASS] T02.A8: no assistant message entry records the effective system prompt or a harness hash -- assistant message keys: ["api","content","model","provider","role","stopReason","timestamp","usage"]
[PASS] T02.B1: the direct Python CRUD mutation persisted to the session-local harness store -- source=agent version=1
[PASS] T02.B2: the direct CRUD mutation appends NO entry to the session JSONL
[PASS] T02.B3: the direct CRUD mutation records NO refinement event in harness_state.json -- refinements=0
[PASS] T02.B4: the CRUD-written entry retains a wall-clock timestamp but no session-tree anchor -- entry keys: ["arguments","content","created_at","id","kind","metadata","path","reference","scope","source","title","updated_at","version"]
[PASS] T02.B5: the CRUD-written entry carries no before state (prior value is unrecoverable from records)
[PASS] T02.B6: writer identity survives only as the coarse `source` field, not as an actor/turn id -- source=agent
[PASS] T02.C1: a single-scope, single-branch /refine-ONLY history reverse-replays to the EXACT harness entry set at an earlier checkpoint -- checkpointA exact=true checkpointB exact=true over 3 refinements
[PASS] T02.C2: CORRUPTION: one interleaved direct CRUD write makes reverse reconstruction wrong -- checkpointA exact=false; reconstructed A still looked well-formed with 3 memory entries
[PASS] T02.C3: DETECTION: in this fixture the contamination IS detectable from production records alone - all four record-consistency signals fire -- CHAIN-BREAK memory:rc_x / VERSION-GAP before.version=3 prior after.version=2 / SOURCE-MISMATCH before.source=agent / ORPHAN memory:rc_hidden
[PASS] T02.C4: the detector is specific, not merely noisy: the clean /refine-only history produces ZERO signals -- clean signals: []
[PASS] T02.C5: ATTRIBUTION is NOT established: the signals bound which entries were touched, but recover neither the foreign write's content nor its position in the session
[PASS] T02.C6: production records DO carry the store identity needed to filter history -- scopes=["global","local","global","local"] distinct harnessStatePath values=2
[PASS] T02.C7: the NAIVE unfiltered replay is WRONG on a mixed-scope session even though /refine is the only writer -- ground truth=["l_entry"] naive=["g_entry","l_entry"]
[PASS] T02.C8: the SCOPE-AWARE replay reconstructs the same mixed-scope checkpoint exactly -- scope-aware=["l_entry"]
```

Session entry types written by the `/refine` run: `session`, `custom`,
`message`. Entry types appended around the CRUD mutation: `message` only.

## Reconstruction matrix

| Dimension | `/refine` (TypeScript writer) | Evidence | Direct `rlm.harness` CRUD (Python writer) | Evidence |
| --- | --- | --- | --- | --- |
| position in the session tree | **RECONSTRUCTIBLE** | custom entry `prime-agent.refinement` carries id + parentId on the message spine | **NOT RECONSTRUCTIBLE** | no session entry is written at all |
| timestamp / ordering | **RECONSTRUCTIBLE** | `entry.timestamp` plus append order plus the `refine_<UTC>` id | **PARTIAL** | `entry.updated_at` is wall-clock only; it cannot be ordered against session entries with certainty |
| before state of the edited entry | **RECONSTRUCTIBLE** | `appliedEdits[].before` (absent for a create, populated for update/delete) | **NOT RECONSTRUCTIBLE** | upsert overwrites in place; no prior value is retained anywhere |
| after state of the edited entry | **RECONSTRUCTIBLE** | `appliedEdits[].after` is a full entry snapshot | **PARTIAL** | current `harness_state.json` shows the latest value only; superseded values are lost |
| which messages preceded the mutation | **RECONSTRUCTIBLE** | message entries appended before the refinement entry | **NOT RECONSTRUCTIBLE** | no anchor exists in the session file to split before/after |
| which messages followed the mutation | **RECONSTRUCTIBLE** | message entries descending from the refinement entry | **NOT RECONSTRUCTIBLE** | same — no anchor |
| harness state applying to message A (edited entry only) | **RECONSTRUCTIBLE** | `appliedEdits[].before` gives the pre-mutation value of every touched entry | **NOT RECONSTRUCTIBLE** | no before value is recorded |
| harness state applying to message B (edited entry only) | **RECONSTRUCTIBLE** | `appliedEdits[].after` plus `harness_state.json` | **PARTIAL** | only if no later writer touched the same entry |
| COMPLETE harness **entry set** — single-scope, single-branch, `/refine` only | **RECONSTRUCTIBLE** | T02.C1: scope-aware reverse-replay of ordered `appliedEdits` off the final state reproduces the checkpoint **exactly**, despite no full-state snapshot. This is the `entries` map only — `HarnessState.refinements[]` and `schema` are not reconstructed | **NOT RECONSTRUCTIBLE** | no ordered edit record exists to replay |
| COMPLETE harness entry set when records span MORE THAN ONE harness store | **RECONSTRUCTIBLE ONLY IF SCOPE-AWARE** | T02.C6–C8: global and local refinements share one session JSONL. Unfiltered replay injects global entries into the local reconstruction and is wrong **even with `/refine` as the only writer**; filtering by the recorded `harnessStatePath` is exact | **NOT RECONSTRUCTIBLE** | no ordered edit record exists to filter or replay |
| COMPLETE harness entry set with a foreign (non-`/refine`) writer present | **NOT RECONSTRUCTIBLE, BUT DETECTABLE** | T02.C2 corruption; T02.C3/C4 the four signals fire on the contaminated fixture and none on the clean one; T02.C5 detection is not attribution | **NOT RECONSTRUCTIBLE** | same, and the foreign writer is the CRUD writer itself |
| effective system prompt actually sent with each request | **NOT RECONSTRUCTIBLE** | assistant message entries record no `systemPrompt` and no prompt hash | **NOT RECONSTRUCTIBLE** | same |

## Result

**H3.** TEST-CONFIRMED / RUNTIME-CONFIRMED. (H1 is rejected in its second half.)

`/refine` produces genuine, tree-positioned, before/after provenance. Direct
Python CRUD produces none of it: no session entry, no refinement event, no
before value, and writer identity degrades to the single coarse string
`source: "agent"`.

**Correction 1 (Codex audit).** The first version of this study marked complete
effective harness state as PARTIAL for `/refine`, reasoning that no full-state
snapshot is persisted. That reasoning was wrong. Writer C shows a `/refine`-only
history reverse-replays to the **exact** earlier entry set: `appliedEdits`
carries both `before` and `after` for every touched entry, so the ordered edit
log is itself a complete differential record. The snapshot is unnecessary.

**Correction 2 (self-audit), two parts.** The correction above then overstated
in two directions of its own.

*It claimed the foreign-writer failure is silent.* It is not. Using only
production records, four **distinct** signals fire on the contaminated fixture
and **zero** on the clean one. They are four distinct checks over the same
records, not statistically or logically independent evidence — one foreign write
can trip several at once:

| Signal | Meaning |
| --- | --- |
| `CHAIN-BREAK` | a recorded `before` ≠ the prior recorded `after` for that entry |
| `VERSION-GAP` | entry version advanced outside the `/refine` edit chain (3 vs prior 2) |
| `SOURCE-MISMATCH` | `before.source` became `agent` after a prior `refine` |
| `ORPHAN` | a final-state entry with no refinement edit history at all |

Three claims must stay separate: **corruption** (established), **detection**
(established for this fixture, and specific), and **attribution** (not
established — the signals bound which entries were touched but recover neither
the write's content nor its position). The four signals are not generalized to
every possible CRUD mutation; a write preserving the version chain and `source`
and touching only already-tracked entries was not tested.

*It framed writer purity as sufficient.* It is not. `_applyRefine` appends a
refinement session entry for **global** scope too, so one JSONL can hold records
for two stores. Replaying them all against the local store is wrong with
`/refine` as the only writer (T02.C7). The records already carry
`harnessStatePath` and `scope` (T02.C6); the replay helper now filters on it, and
the filtered replay is exact (T02.C8).

**What disappears specifically under direct CRUD:** the session-tree anchor
(hence the before/after message split), the ordering guarantee relative to
session entries, the before state, and any per-mutation event record. What
survives: the entry's current value, its `created_at`/`updated_at` wall clock,
its `version` counter, and `source`.

Note the two writers are also distinguishable after the fact by `source`:
`/refine` writes `source: "refine"`, the Python default is `source: "agent"`.
That is a writer *class* label, not an identity.

## What this result DOES establish

- The full reconstruction profile for both writers, from real persisted files.
- That "provenance / no provenance" is the wrong frame: the answer is
  writer-dependent and dimension-dependent.
- **The exact object shown to be reconstructible is `HarnessState.entries`**, for
  a tested linear, scope-filtered `/refine` history — recovered by reverse-replay
  of the ordered edit log, with no full-state snapshot or hash needed. Everything
  below is outside that object and is *not* covered by T02.C1:

  | Not the supported object | Status |
  | --- | --- |
  | the full `HarnessState` object | not reconstructed |
  | historical `refinements[]` | not reconstructed — it grows monotonically and is never truncated by replay |
  | `schema` history | not reconstructed |
  | the effective system prompt actually sent | not recoverable from any record (T02.A8) |
  | arbitrary branch / compaction / concurrency histories | not exercised; replay was tested on a linear history only |

## What this result DOES NOT establish

- The cross-session global refinement **log** (`appendGlobalRefinement` →
  `refinements.jsonl`), which global edits get and local edits do not. The
  *mixed global/local session* case **was** exercised (T02.C6–C8): both scopes
  write `prime-agent.refinement` entries into one session JSONL, and the replay
  helper uses the recorded `harnessStatePath` as store identity to filter them.
  What remains unexercised is the separate `refinements.jsonl` log itself.
- Anything about reconstruction across compaction, branching, or session forks.
- That direct CRUD is *unobservable in principle* — an external observer
  watching file mtimes could order it. The claim is only that the **records**
  do not carry it.
- That reverse-replay is robust beyond the tested shape. Writer C exercised
  create, update and delete across three refinements on a linear branch, plus one
  mixed-scope sequence. **Untested:** compaction, forks and branch divergence,
  concurrent sessions, global-history interactions beyond the exercised case,
  crash / torn-write conditions, rollback chains, and writer classes other than
  `/refine` and `rlm.harness` CRUD.
- That the four contamination signals detect *every* foreign mutation. They
  detect the one tested. A mutation preserving the version chain and `source`,
  confined to entries the refinement history also touches, might evade all four.
- That reconstruction recovers the whole `HarnessState`. Only `entries` is
  reconstructed and compared; `refinements[]` and `schema` are not.
- Whether the RLM kernel, in a real IPython session, adds any provenance the
  bare Python API does not. No kernel was available in this environment.
