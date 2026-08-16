# Results matrix

Evidence classes used throughout: **IMPLEMENTATION-CONFIRMED** (read from
source), **TEST-CONFIRMED** (asserted by a probe over persisted artifacts),
**RUNTIME-CONFIRMED** (observed in a live execution), **ENVIRONMENT-DEPENDENT**,
**INFERENCE**, **UNKNOWN**.

## Master matrix

| Question | Prior disagreement | Test result | Evidence class | Revised finding | Remaining uncertainty |
| --- | --- | --- | --- | --- | --- |
| **Q1** Gate → refinement coupling | "Gates and `/refine` never touch; a gate failure cannot cause a refinement" vs. "an indirect transcript path exists" | Sentinel emitted only by a failing gate appears verbatim in the `<conversation>` block of the captured refiner request; appears in no other block and not in the refiner system prompt; gate invocation count unchanged across `refine()` (2 → 2); `RefinementResult` has no gate-shaped key and does not contain the sentinel; neither module references the other's symbols | RUNTIME-CONFIRMED (path, no re-run, no typed field) + IMPLEMENTATION-CONFIRMED (no cross-module reference) | **UNTYPED TRANSCRIPT-MEDIATED TRANSPORT.** Gate-failure text is carried into a *subsequently invoked* refinement request; no typed linkage, no shared identifier, no post-refinement gate validation. Transport is deterministic given invocation + window; what is model-mediated is whether refinement runs and whether the refiner acts on the text | Whether a real refiner model acts on gate text; behaviour when the continuation falls outside the 80 000-char `slice(-80_000)` window or after compaction; the second continuation route and auto-`/refine` were not exercised |
| **Q2** Turn-level harness attribution | "Provenance exists" vs. "provenance is absent" | Twelve-dimension matrix over four real persisted sessions: `/refine` writer, CRUD writer, a reverse-replay probe added after the Codex audit, and a mixed-scope probe added after the self-audit | TEST-CONFIRMED + RUNTIME-CONFIRMED | **Depends on writer purity AND scope discipline.** `/refine`: tree position, ordering, before, after, message split, per-entry state — and the complete harness **entry set** at an earlier checkpoint via *scope-aware* reverse-replay (T02.C1). Naive replay across mixed scopes is wrong even with `/refine` as the only writer (T02.C7/C8). A foreign CRUD write corrupts reconstruction (T02.C2) but is **detectable** in the tested fixture by four record-consistency signals, with zero false positives on the clean history (T02.C3/C4); detection is not attribution (T02.C5). Neither writer supports recovering the system prompt actually sent | Whether the four signals detect every possible CRUD mutation; compaction, forks/branch divergence, concurrent sessions, crash/torn writes, rollback chains, other writer classes; `HarnessState.refinements[]` is not reconstructed |
| **Q3** Routing visibility vs retrieval | Accumulated state becomes "invisible" vs. "that is too strong — it stays programmatically accessible" | Fact stored (yes); absent from the system prompt actually sent (yes, 6 of 15 memory entries rendered, `+9 more` shown); retrievable through six API surfaces over the same store, including end-to-end through a live agent tool loop | RUNTIME-CONFIRMED for claims 1–3; claims 4–5 **NOT TESTED** | **DEGRADED DEFAULT SALIENCE / ROUTING, not absolute invisibility.** The omission is signalled, not silent. The bound is renderer-specific: 6/kind in the system prompt, 20/kind in Python `overview()`, 40/kind in the refiner's own overview. The six surfaces are breadth of access, not independent corroboration — all read one store | Whether a real agent spontaneously retrieves displaced state (claim 4) and whether doing so improves task outcome (claim 5). Both require a real model. The practical cost of degraded salience is unmeasured |
| **Q4** Faux reproducibility | "Nondeterministic evaluation surface" vs. "volatile framing only" | 5 provider-layer runs + 3 independent session-layer processes. Raw traces all distinct; segmentations all distinct; auto tool ids all distinct; after collapsing chunk-segmentation framing every event frame is identical; every semantic projection identical except input tokens, whose ±1 variance tracks system-prompt length exactly (2479→676, 2481/2483→677) while output tokens are `[7,9,3]` in every run | RUNTIME-CONFIRMED (semantic reproducibility); ENVIRONMENT-DEPENDENT (input-token accounting, cause diagnosed) | **Non-canonical at the event/identifier level; the selected semantic projections of ONE fixed scripted flow reproduced after principled normalization.** Model content is fixture-authored, so the load-bearing finding is that the surrounding pipeline preserved it, not that the provider is deterministic. Identifier instability is a *default*, not a property. **Input**-token accounting is the one semantic-layer exception: ±1 across processes, consistent with and mechanistically explained by temp-path length crossing the 4-chars-per-token boundary (necessary condition tested; sole causation not established) | Faux provider only; nothing established about real providers. One deterministic script measured. Whether the input-token framing diagnosis generalises beyond this environment is untested |
| **Q5** Model / configuration record | "Configuration recorded" vs. "configuration absent" | Real transitions driven, session persisted, reloaded from disk, inventoried field by field with explicit absence checks | RUNTIME-CONFIRMED | **Nominal configuration is recorded; effective configuration is not.** Provider, requested model, thinking level, service tier are typed change events; routed `responseModel` and `responseId` persist per response *when the provider supplies them*; temperature, seed, model snapshot, catalog version, prompt bytes, harness hash, tool/skill versions are all absent. Change events record *effective* (clamped) values only: an accepted value is recorded verbatim, a **clamped** value writes an event carrying the post-clamp value (losing the request), and a **no-op** writes nothing. No rejection path was exercised | Whether real providers populate `responseModel`/`responseId`; configuration held outside the session file; RLM child sessions use a different write path |
| **EXT** External evaluator loop | Unresolved: does Verifiers / prime-rl close a score → refinement loop? | 37 in-repo references, all classified as documentation, prose, outbound telemetry, a co-deployment pathspec, or tests. No adapter, no environment module, no reward/score concept in source. Inbound signal is untyped free text in `<user_refine_instructions>` | IMPLEMENTATION-CONFIRMED + RUNTIME-CONFIRMED | **No typed, internally closed score → refinement protocol exists here.** Outbound ACP `_meta` reports gate state and refinement completion as two separate unlinked payloads; the examined typed refinement input channel carries untyped free text. Other untyped routes into the trajectory exist and were not enumerated | `DEFERRED — EXTERNAL REFERENCE STUDY REQUIRED` for the external side |

## Per-probe assertion counts

All probes exit non-zero on any failed assertion. Latest full run: **6/6 PASS**, 98 assertions.

| Probe | Assertions | Result |
| --- | --- | --- |
| `test-01-gate-refinement-coupling` | 10 | PASS |
| `test-02-turn-harness-attribution` | 23 | PASS |
| `test-03-routing-vs-retrieval` | 14 | PASS |
| `test-04-normalized-reproducibility` | 21 | PASS |
| `test-05-model-config-record` | 26 | PASS |
| `external-evaluator` | 4 | PASS |
| **Total** | **98** | **PASS** |

## Negative results and limitations preserved

These are findings, not omissions:

1. **Claims 4 and 5 of Q3 were not tested and are not claimed.** A faux provider
   cannot measure spontaneous model behaviour, because the probe authors the
   model's decisions. `test-03` records `scriptedDecision: true` where it
   scripts a tool call.
2. **The faux provider cannot represent a routed model at the provider layer.**
   `cloneMessage` overwrites `message.model` with the requested id. The routed
   case in Q5 was represented through `responseModel`, which survives the clone
   — a genuine field, but a narrower channel than a real gateway would use.
3. **No IPython/RLM kernel was available.** `prime-agent-runtime` is not
   pip-installed and `ipykernel` is absent. Python harness paths were exercised
   in a plain subprocess against the same store; in-kernel behaviour is untested.
4. **A two-run version of Q4 produced a spurious failure.** Two independent runs
   happened to emit the same number of per-chunk progress events. The probe was
   changed to measure nondeterminism over 5 and 3 repetitions instead of
   asserting it from a single pair. The original failure is recorded here rather
   than erased.
5. **`run-all.sh` initially masked that failure** because a piped `npx tsx … |
   tee` reports `tee`'s exit status. Fixed with `set -o pipefail`. Every result
   above comes from a run made after that fix.
6. **Whole-trace normalization in Q4 does not yield equality**, and is not
   claimed to. Equality appears only after chunk-segmentation coalescing, which
   is documented as a separate, justified normalization step.
6b. **Input-token accounting in Q4 is genuinely not reproducible across
   processes.** An earlier version of the probe asserted usage equality and
   passed by luck; a later run failed with `input: 676` vs `677`. Normalizing
   usage to force a pass is forbidden by the normalization contract, so the
   probe was changed to measure the variance and test its cause instead. The
   variance tracks system-prompt length exactly and is consistent with, and
   mechanistically explained by, the temp session path's variable-length random
   suffix crossing the 4-chars-per-token boundary. The probe tests a necessary
   condition (equal prompt length => equal input tokens), not sole causation.
   The original failure is recorded, not erased.
7. **A create edit records no `before` key.** This surfaced as an initial
   failure in `test-02` and is correct behaviour; the probe was redesigned to
   test before-state reconstruction with an `update`, and the create case is
   retained as assertion `T02.A0`.
8. **`npm install` under npm 10.9.7 rewrote `package-lock.json`.** Reverted; not
   part of the commit. Recorded in `execution-envelope.md`.
9. **The probes were not type-checked in the first round.** `studies/` sits
   outside the repository's `tsconfig` `include` and biome `files.includes`, so
   the pre-commit `npm run check` passed without ever looking at them. Adding
   `studies/joint-discriminating-tests/tsconfig.json` surfaced **eight
   diagnostics at `91ce174`** (test-01 ×1, test-02 ×1, test-04 ×5, test-05 ×1;
   first reported as "seven", corrected by the later self-audit), one of them
   substantive: Test 05 passed `"standard"` as a service tier, which is not in
   the `ServiceTier` union. **That invalidated the original Q5
   service-tier evidence**, which has been re-collected with valid values.
10. **An audit corrected a claim this study asserted without testing.** The
   original matrix marked complete harness-state reconstruction as PARTIAL for
   `/refine` because no snapshot is persisted. Reverse-replay of the ordered edit
   log in fact reconstructs it **exactly** (T02.C1). The row is corrected.
11. **That correction then overstated in the opposite direction, and a
   self-audit caught it.** It claimed the foreign-writer failure leaves "no
   marker in the records" — again asserted rather than tested, and again false.
   Four record-consistency signals fire on the contaminated fixture and none on
   the clean one (T02.C3/C4). The false claim is retracted, the detector is now
   part of the durable probe, and corruption / detection / attribution are kept
   as three separate claims.
12. **The same self-audit found the replay helper ignored recorded scope.** It
   collected every `prime-agent.refinement` entry and replayed them against one
   store, though `_applyRefine` writes that entry for global refinements too.
   A mixed-scope session therefore reconstructed wrongly with `/refine` as the
   only writer (T02.C7). Fixed by filtering on the recorded `harnessStatePath`;
   the "writer purity is sufficient" framing is withdrawn.
13. **The reported diagnostic count was wrong.** The tsconfig surfaced **eight**
   diagnostics at `91ce174`, not seven. Corrected wherever stated.
