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
| COMPLETE effective harness state at message A / message B | **PARTIAL** | per-edit before/after only; no full-state snapshot or hash is persisted per turn, and a concurrent CRUD writer is invisible | **NOT RECONSTRUCTIBLE** | no snapshot, no event, no anchor |
| effective system prompt actually sent with each request | **NOT RECONSTRUCTIBLE** | assistant message entries record no `systemPrompt` and no prompt hash | **NOT RECONSTRUCTIBLE** | same |

## Result

**H1.** TEST-CONFIRMED / RUNTIME-CONFIRMED.

`/refine` produces genuine, tree-positioned, before/after provenance. Direct
Python CRUD produces none of it: no session entry, no refinement event, no
before value, and writer identity degrades to the single coarse string
`source: "agent"`.

**What disappears specifically under direct CRUD:** the session-tree anchor
(hence the before/after message split), the ordering guarantee relative to
session entries, the before state, and any per-mutation event record. What
survives: the entry's current value, its `created_at`/`updated_at` wall clock,
its `version` counter, and `source`.

Note the two writers are also distinguishable after the fact by `source`:
`/refine` writes `source: "refine"`, the Python default is `source: "agent"`.
That is a writer *class* label, not an identity.

## What this result DOES establish

- The full eight-dimension reconstruction profile for both writers, from real
  persisted files.
- That "provenance / no provenance" is the wrong frame: the answer is
  writer-dependent and dimension-dependent.
- That **neither** writer supports reconstruction of the complete effective
  harness state at a given turn, because no full-state snapshot or hash is
  persisted per turn by either path.

## What this result DOES NOT establish

- Anything about global-scope refinement history
  (`appendGlobalRefinement` → `refinements.jsonl`), which adds a cross-session
  log for global edits only. This probe exercised local scope.
- Anything about reconstruction across compaction, branching, or session forks.
- That direct CRUD is *unobservable in principle* — an external observer
  watching file mtimes could order it. The claim is only that the **records**
  do not carry it.
- Whether the RLM kernel, in a real IPython session, adds any provenance the
  bare Python API does not. No kernel was available in this environment.
