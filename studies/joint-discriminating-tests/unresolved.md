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
every run. The probe asserts the causal diagnosis rather than the equality:
runs with equal system-prompt lengths report equal input tokens, so framing is
the complete explanation.

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
`DEFERRED — EXTERNAL REFERENCE STUDY REQUIRED`. Established here: no adapter, no
environment module, no reward/score concept in this repository; the only inbound
channel is untyped free text; the outbound ACP `_meta` surface reports gate
state and refinement completion as two separate unlinked payloads. What the
external repositories do cannot be determined from here, and the brief forbids
inferring intent from comments.

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

### U14 — Global-scope refinement history
Global refinements also append to `refinements.jsonl` via
`appendGlobalRefinement`, adding a cross-session log local refinements do not
have. Test 02 exercised local scope only, so the reconstruction matrix does not
cover global-scope provenance, which is likely *better* than what is reported.

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
T02.C1 replays create, update and delete across three refinements on a linear
branch. Rollback chains (`rollbackProposal`), branch points, forks, and
global-scope refinements were not replayed. Whether reverse-replay stays exact
across those is unknown.

### U20 — Detecting a foreign harness writer after the fact
T02.C3 shows an interleaved CRUD write makes reverse-replay return a complete
but wrong state with no marker. Whether any signal exists that would let an
investigator *detect* the contamination — a version counter discontinuity, an
`updated_at` inconsistency, a `source` mismatch — was not investigated. This
matters directly for whether a future experiment can rely on writer purity or
must enforce it.

### U17 — Sort-order sensitivity of the default summary
Test 03 placed the hidden fact late by `path` and `title`. Which of the three
sort keys dominates, and whether an entry can be displaced by `id` alone, was
not characterised.
