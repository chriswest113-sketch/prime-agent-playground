# Unresolved

Everything this phase could not settle, and why. Nothing here is a finding
awaiting write-up; each item is genuinely open.

---

## Blocked on a real model (no provider credentials)

### U1 — Does an agent spontaneously retrieve displaced harness state?
Claim 4 of Test 03. A faux provider cannot answer this: the probe authors the
model's decisions, so any "the agent retrieved it" result would be manufactured.
`test-03` therefore scripts a retrieval tool call, records
`scriptedDecision: true`, and claims only that the path works end-to-end.

*To resolve:* a real model, a task whose completion requires a fact placed
outside the default rendered subset, and a control where the same fact is inside
it.

### U2 — Does displaced harness state cost task performance?
Claim 5 of Test 03. Untested and unclaimed. Requires U1 plus a held-out task set
and an outcome measure.

### U3 — Would a real refiner act on gate-failure text?
Test 01 establishes that the text is present in the refiner's request. Whether a
real model conditions its proposal on it is a behavioural question. The probe's
refiner reply was authored by the probe.

### U4 — Do real providers populate `responseModel` and `responseId`?
Test 05 establishes that Prime Agent *records* both when supplied. Whether any
given provider supplies them — and how faithfully `responseModel` reflects the
concrete routed model — is untested. The faux provider cannot answer it: it
overwrites `message.model` with the requested id, so the routed case had to be
represented through `responseModel` directly.

---

## Blocked on environment

### U5 — In-kernel RLM behaviour
`prime-agent-runtime` is not pip-installed and `ipykernel`, `nest-asyncio`, and
`tyro` are absent. All Python harness paths were exercised in a plain subprocess
against the same state file. Untested: whether a live IPython/RLM kernel adds
provenance the bare API does not; whether `rlm.harness`'s in-process cache and
`_sync_from_disk` behave differently under concurrent kernel and `/refine`
writes; and whether the `_HarnessProxy` degraded/in-memory fallback paths
(`rlm/__init__.py:240-280`) change what is retrievable.
**ENVIRONMENT-DEPENDENT.**

### U6 — Usage reproducibility as a general property
**Partly resolved, and the resolution is negative.** Test 04 now observes that
input-token accounting is *not* reproducible across processes: it varies by ±1,
tracking the length of the temp session path embedded in the system prompt
(2479 chars → 676 tokens; 2481/2483 → 677). Output tokens were identical in
every run. The probe asserts a necessary condition of the causal diagnosis
rather than the equality: runs with equal system-prompt lengths report equal
input tokens, which is consistent with framing being the mechanism. Sole
causation is NOT established — no intervention pinning the path length was
performed.

Still open: whether the same framing account holds under longer or differently
shaped paths, deeper sessions, or prompt-cache retention (`withUsageEstimate`
splits input across `cacheRead`/`cacheWrite` when a `sessionId` is present, a
path this script did not exercise). **ENVIRONMENT-DEPENDENT.**

### U7 — Packaged build vs source
Probes import TypeScript source through `tsx`; no `dist/` was built. Divergence
between source and packaged build behaviour is untested.

---

## Out of scope for this phase, by instruction

### U8 — Does the external Verifiers / prime-rl side close the loop?
`DEFERRED — EXTERNAL REFERENCE STUDY REQUIRED`. Established here: no typed,
internally closed score/reward → refinement protocol was found in this
repository. The examined typed refinement input accepts untyped instructions;
other untyped information routes also exist. No adapter and no environment
module are present, and the outbound ACP `_meta` surface reports gate state and
refinement completion as two separate unlinked payloads. What the external
repositories do cannot be determined from here, and the brief forbids inferring
intent from comments.

### U9 — Does continual harness refinement improve future task outcomes?
Explicitly the *next* phase. Not begun.

---

## Reachable without credentials, simply not done here

These were bounded out to keep the phase to the smallest discriminating tests.
Each is a concrete, credential-free experiment.

### U10 — Gate text beyond the trajectory window
`planRefinement` uses `slice(-80_000)` of the serialized conversation. A gate
failure pushed past that boundary presumably does *not* reach the refiner, which
would make the Q1 coupling window-bounded. Untested.

### U11 — Coupling across compaction
Compaction rewrites the trajectory. Whether a gate-failure continuation survives
into the post-compaction conversation the refiner sees is untested, and bears
directly on how durable the Q1 path is.

### U12 — The second continuation route
`test-01` exercised the route through `_getAutonomousContinuationMessages`
(agent-session.ts:3224). The threshold-compaction route
(`_queueAutonomousContinuationForThresholdCompaction`, agent-session.ts:2735)
was not exercised.

### U13 — Auto-`/refine`
`reviewAutoRefine` gates automatic refinement and serializes its own 40 000-char
conversation slice. Its coupling and provenance characteristics were not
measured; only explicit `refine()` was.

### U14 — The separate global refinement log
Global refinements also append to `refinements.jsonl` via
`appendGlobalRefinement`, a cross-session log local refinements do not have.
Test 02 **did** exercise a mixed global/local session (T02.C6–C8) — both scopes
write refinement entries into one session JSONL, and replay filters them by the
recorded `harnessStatePath`. What remains untested is the `refinements.jsonl`
log itself, whose cross-session provenance is likely *better* than what the
matrix reports.

### U15 — Reconstruction across branch, fork, and rollback
Session trees support branching and refinements support rollback
(`rollbackProposal`). How attribution behaves across a branch point, a fork, or
a rollback chain was not tested.

### U16 — Concurrent writer conflict handling
`applyRefinementProposal` takes a `baselineState` and rejects edits with
`"entry changed during refinement planning"`. A CRUD write landing during the
`/refine` planning window should trigger that path. Untested, and directly
relevant to how cleanly writers can be separated in a future experiment.

### U18 — Rejected (as opposed to clamped or no-op) configuration requests
Test 05 separates accepted, clamped and no-op service-tier requests. A path that
*rejects* a request outright was not found or exercised. Whether one exists, and
what it records, is untested.

### U19 — Reverse-replay beyond the tested shape
**Partly resolved.** The mixed-scope case is now tested and was a real defect:
an unfiltered replay is wrong across scopes even with `/refine` as the only
writer, and filtering on the recorded `harnessStatePath` is exact (T02.C6–C8).

Still untested, and explicitly preserved as such: compaction; forks and branch
divergence; concurrent sessions writing the same store; global-history
interactions beyond the single exercised sequence; crash / torn-write
conditions; rollback chains (`rollbackProposal`); and writer classes other than
`/refine` and `rlm.harness` CRUD. Reconstruction also covers the `entries` map
only — `HarnessState.refinements[]` and `schema` are not replayed.

### U20 — Detecting a foreign harness writer after the fact
**Resolved affirmatively for the tested fixture, and the earlier entry here was
wrong.** This item previously said the question "was not investigated" while
T02.C3 simultaneously asserted no marker existed. Investigating it showed four
record-consistency signals fire on the contaminated fixture and none on the
clean one: `CHAIN-BREAK`, `VERSION-GAP`, `SOURCE-MISMATCH`, `ORPHAN`
(T02.C3/C4). The detector is now part of the durable probe.

Still open: whether these four detect *every* foreign mutation. A CRUD write
that preserved the version chain and `source`, and touched only entries the
refinement history also touches, might evade all four — untested. Also open:
**attribution** — the signals bound which entries were affected but recover
neither the foreign write's content nor its position in the session (T02.C5).

### U17 — Sort-order sensitivity of the default summary
Test 03 placed the hidden fact late by `path` and `title`. Which of the three
sort keys dominates, and whether an entry can be displaced by `id` alone, was
not characterised.
