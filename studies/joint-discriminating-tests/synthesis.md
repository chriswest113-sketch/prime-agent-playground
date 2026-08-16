# Synthesis

Six probes, 98 assertions, all passing on the final run. Every result below is
traceable to a raw artifact under `<probe>/artifacts/`.

---

## 1. Adjudication of the five candidate revised statements

The brief asked whether five specific revised statements are supported. Each is
accepted, revised, or rejected **solely on the experiments**.

---

### Statement 1

> "There is no typed or deterministic linkage between autonomous gate outcomes
> and refinement, although gate failures can reach refinement through shared
> transcript state."

**ACCEPTED WITH NARROWER WORDING.** RUNTIME-CONFIRMED. Revised form:

> No typed gate identity and no automatic gate-validation linkage was found.
> Gate-failure continuation text can enter a **subsequently invoked** refinement
> request through the shared trajectory.

Every clause is independently demonstrated by `test-01`:

- *No typed linkage* — `RefinementResult` keys are
  `["appliedEdits","expectedOutcome","harnessStatePath","id","rationale","scope","summary"]`;
  the serialized result does not contain the gate sentinel; neither
  `refinement.ts` nor `autonomous.ts` references any of the other's symbols.
- *No deterministic linkage* — the gate invocation counter is unchanged across
  `refine()` (2 → 2). Refinement neither re-runs nor consults the gate. The
  applied edit is exactly whatever the refiner reply proposed.
- *Gate failures can reach refinement through shared transcript state* — the
  sentinel `JOINT_GATE_SENTINEL_7F31`, emitted only on the failing gate's
  stdout, appears verbatim inside the `<conversation>` block of the captured
  refiner request, and in no other block.

Two qualifications, both raised by an independent audit and both correct:

- **This is transport, not causation.** The probe calls `refine()` itself.
  Nothing shows a gate failure *causes* or *schedules* a refinement.
- **The transport itself is deterministic.** Calling the whole coupling
  "probabilistic" was loose. Given a refinement is invoked and the continuation
  is still in the trajectory window, serialization deterministically includes the
  gate text. What is model-mediated is whether refinement runs at all, and
  whether the refiner conditions its proposal on the text.

"Can reach" is also scoped to that window: `planRefinement` takes
`slice(-80_000)` of the serialized conversation, so a gate failure far enough
back is excluded. That boundary was not probed.

---

### Statement 2

> "Default harness salience degrades under growth; full state remains
> programmatically accessible, while practical autonomous retrieval remains
> separately measurable."

**ACCEPTED.** RUNTIME-CONFIRMED for the first two clauses; the third is a
correct statement about what remains unmeasured.

`test-03` seeded 15 global memory entries and placed
`HIDDEN_HARNESS_FACT_83D2` outside the default rendered subset. The system
prompt *actually sent to the provider* rendered 6 entries and the line
`+9 more memory entries`; the fact was absent. It was then recovered through six
API surfaces: `loadHarnessState()`, the same renderer at a raised limit,
`rlm.harness.list()`, `.get()`, `.snapshot()`, `rlm.get_harness_state()`, and
end-to-end through a tool call inside a live agent loop — six interfaces over
one store.

Two refinements to the wording are earned by the evidence:

- **The degradation is signalled, not silent.** The prompt states the true count
  (`memory: 15`) and the overflow (`+9 more`). "Degrades" is right; "hides" would
  be wrong.
- **The bound is renderer-specific, not global.** 6/kind in the system prompt,
  20/kind in Python `overview()`, 40/kind in the refiner's own overview. The
  same accumulation is displaced at one boundary and visible at another —
  confirmed causally by T03.12, where the *same* Python renderer at limit 6 also
  omits the fact.
- **"Six independent paths" was overstated and is corrected to "six API
  surfaces".** All six read the same `harness_state.json`. They demonstrate
  breadth of access, not independent corroboration.

"Practical autonomous retrieval remains separately measurable" is exactly right
and is the reason claims 4 and 5 are marked NOT TESTED rather than answered.

---

### Statement 3

> "`/refine` mutations have meaningful session-tree ordering and before/after
> provenance, while direct Python CRUD and absent complete prompt snapshots
> prevent full effective-harness reconstruction."

**FIRST CLAUSE ACCEPTED; SECOND CLAUSE REJECTED AS STATED.**
TEST-CONFIRMED + RUNTIME-CONFIRMED.

The first clause holds: `/refine` writes a `custom` session entry with `id`,
`parentId` on the message spine, and a timestamp; post-mutation messages descend
from it; `appliedEdits[].before` and `.after` are full entry snapshots. Direct
CRUD writes no session entry, no refinement event, and no before value; writer
identity survives only as `source: "agent"`.

The second clause is where this study was wrong, and an independent audit caught
it. The original matrix marked complete harness-state reconstruction as PARTIAL
for `/refine`, reasoning from the absence of a full-state snapshot. That was an
assertion, not a result — and it is false. A `/refine`-only history
**reverse-replays to the exact earlier state** (T02.C1): `appliedEdits` carries
`before` *and* `after` for every touched entry, so the ordered edit log is
itself a complete differential record and the snapshot is unnecessary.

Revised form (narrowed twice — once after the Codex audit, once after the
self-audit that followed it):

> For a tested single-branch `/refine` history, earlier harness state is exactly
> reconstructible by reverse-replaying the ordered edit history **for the
> relevant recorded harness scope / state path**. Naively mixing refinement
> records from different harness stores produces an incorrect reconstruction
> even with `/refine` as the only writer. What the reconstruction recovers is
> the harness **entry set**, not the whole `HarnessState`. Absent prompt
> snapshots separately prevent recovering the effective system prompt, which is
> a different quantity.

Two corrections the self-audit forced, both recorded rather than quietly folded
in:

- **"Writer purity is sufficient" was wrong.** `_applyRefine` appends a
  `prime-agent.refinement` session entry for *global* refinements too, so a
  session mixing scopes puts records for two different stores in one JSONL. An
  unfiltered replay injects global entries into the local reconstruction and is
  wrong with `/refine` as the only writer (T02.C7). Filtering by the recorded
  `harnessStatePath` is exact (T02.C8). The records already carry the needed
  identity (T02.C6); the first version of the probe simply ignored it.
- **"No marker in the records" was false.** See Statement 3b.

### Statement 3b — contamination is detectable, which the study first denied

The first correction pass claimed an interleaved CRUD write produces a wrong
state "with no marker in the records that a foreign write occurred". A
self-audit refuted this using only production records. Three claims must be kept
apart:

| Claim | Status |
| --- | --- |
| **Corruption** — the reconstruction is wrong | **ESTABLISHED** (T02.C2) |
| **Detection** — the contamination is visible in the records | **ESTABLISHED for this fixture** (T02.C3), and specific: zero signals on the clean history (T02.C4) |
| **Attribution** — recovering what the foreign write was, and when | **NOT ESTABLISHED** (T02.C5) |

Four independent record-consistency signals fire on the contaminated fixture:
`CHAIN-BREAK` (a recorded `before` ≠ the prior recorded `after`), `VERSION-GAP`
(entry version advances outside the `/refine` edit chain), `SOURCE-MISMATCH`
(`before.source` becomes `agent` after a prior `refine`), and `ORPHAN` (a
final-state entry with no refinement edit history). All four are now asserted by
the durable probe.

The calibrated finding:

> An interleaved direct CRUD write invalidates naive `/refine`-history
> reconstruction. In the tested fixture the contamination is detectable from
> production-record inconsistencies (chain break, version gap, source mismatch,
> and orphan state), although detection does not itself reconstruct or fully
> attribute the foreign write.

These four signals are **not** generalized to every possible CRUD mutation. A
write that happened to preserve the version chain and `source`, and touched only
entries the refinement history also touches, was not tested.

---

### Statement 4

> "Prime Agent records nominal and some per-response model identity, but does not
> record enough effective configuration or immutable provider/model provenance to
> establish controlled run equivalence."

**ACCEPTED.** RUNTIME-CONFIRMED.

`test-05` persisted and reloaded a session exercising provider selection, model
change, thinking-level change, service-tier change, a routed `responseModel`, a
`responseId`, usage and stop reason.

*Recorded:* `model_change{provider, modelId}`, `thinking_level_change`,
`service_tier_change` as tree-positioned events; `api`, `provider`, `model`,
`usage`, `stopReason`, `timestamp` on every assistant response; `responseModel`
and `responseId` when the provider supplies them — so "some per-response model
identity" is precisely right, and better than "absent".

*Not recorded:* temperature, seed, top_p/top_k, model revision/snapshot, model
catalog hash/version, the system prompt bytes, any prompt hash, any per-request
harness snapshot or hash, per-response thinking level or service tier, tool
versions, skill versions.

One finding strengthens the statement beyond what it claims, though the first
version of this study overstated it and an audit was right to press. **Change
events record only the effective value after clamping, and only when it
changes.** Three cases, now separated with valid `ServiceTier` values
(T05.4b–T05.4d):

- `flex` is supported → recorded verbatim;
- `priority` on a model without fast-mode support → clamped to `default`; an
  event **is** written, but it records `default`, so the request is
  indistinguishable from a direct `default` request;
- `priority` again, now a no-op → **no event at all**.

So the accurate claim is not "clamped or rejected requests leave no record".
Clamping loses the *requested value*; only a no-op loses the whole event. No
rejection path was exercised at all. This is still a reconstruction gap in the
*nominal* record rather than merely the effective one — but a narrower one.

Two scope corrections also apply: the absence findings are scoped to the
**persisted session artifact**, not to every artifact the repository writes; and
`responseModel` was fixture-injected to test the persistence path, so nothing
here shows a real provider populating it.

---

### Statement 5

> "The faux provider may be non-canonical at the event/identifier level while
> remaining semantically reproducible after principled normalization."

**ACCEPTED WITH NARROWER WORDING.** RUNTIME-CONFIRMED. Two changes are earned:
"may be non-canonical" strengthens to "is non-canonical", and "semantically
reproducible" must carve out input-token accounting, which is
ENVIRONMENT-DEPENDENT. Revised form:

> The faux provider **is** non-canonical at the event/identifier level, and is
> semantically reproducible after principled normalization **for content, tool
> behaviour, harness state, output-token accounting and outcomes**; input-token
> accounting is not reproducible across processes, though its variance is fully
> attributable to prompt-length framing rather than semantic drift.

`test-04` measured 5 provider-layer runs and 3 independent session-layer
processes:

| Class | Verdict |
| --- | --- |
| BYTE-LEVEL | NOT REPRODUCIBLE — 5/5 and 3/3 distinct raw traces |
| IDENTIFIER | NOT REPRODUCIBLE by default (5/5 distinct auto tool ids); REPRODUCIBLE when ids are supplied explicitly |
| EVENT-FRAME | NOT REPRODUCIBLE at chunk-segmentation level (5/5 distinct segmentations; progress counts `[12,12,11]`); REPRODUCIBLE once segmentation framing is collapsed |
| SEMANTIC SCRIPT | REPRODUCIBLE — terminal content, tool semantics, tool results, harness semantic state, output-token accounting and outcomes all identical. **Input**-token accounting is the one exception (below) |

Two things the evidence adds:

- **Identifier instability is a default, not a property.** `fauxToolCall`
  accepts an explicit `id` and those are stable across all 5 runs. A harness
  that supplies ids gets identifier reproducibility for free.
- **The normalization did not have to be stretched, and one dimension resisted
  it honestly.** No substantive content and no outcome field was normalized.
  Input-token accounting turned out *not* to be reproducible across processes:
  it varies by ±1. Rather than normalize usage to force equality — which the
  contract forbids — the probe measures the variance and tests its cause. Input
  tokens track system-prompt length exactly (2479 → 676, 2481/2483 → 677) while
  output tokens are `[7, 9, 3]` in every run, and any two runs with equal
  prompt lengths report equal input tokens. The cause is the temp session
  path's variable-length random suffix crossing the 4-chars-per-token boundary
  in `estimateTokens`. The evidence is consistent with framing and shows no
  semantic drift, but the probe tests a necessary condition rather than
  intervening, so sole causation is not established. Either way the statement's
  "semantically reproducible" must exclude input-token accounting, which is
  **ENVIRONMENT-DEPENDENT**.

The prior "nondeterministic evaluation surface" characterisation therefore needs
narrowing, not withdrawal: it is accurate about bytes, ids, and chunk
boundaries, and inaccurate as a statement about the layer an evaluator scores.

---

## 2. Classification of every previously disputed statement

| # | Disputed statement | Classification | Basis |
| --- | --- | --- | --- |
| 1 | "Autonomous gates and `/refine` never touch; a gate failure cannot cause a refinement" | **SETTLED WITH NARROWER WORDING** | Rejected as stated. Correct form: no typed or deterministic linkage; an untyped transcript-mediated path does exist (T01.4) |
| 2 | "A gate failure can reach the refiner" | **SETTLED** | RUNTIME-CONFIRMED (T01.4) |
| 3 | "Refinement validates gate outcome" | **SETTLED** — rejected | Gate invocation count unchanged across refine (T01.6) |
| 4 | "`/refine` mutations carry provenance" | **SETTLED** | Tree position, ordering, before, after all reconstructible (T02.A1–A6) |
| 5 | "Harness mutations have no provenance" | **SETTLED WITH NARROWER WORDING** | True for direct Python CRUD; false for `/refine` (T02.B1–B6 vs T02.A1–A6) |
| 6 | "Complete effective harness state at a turn is reconstructible" | **SETTLED WITH NARROWER WORDING** — corrected twice, both times against this study's own claim | TRUE for the harness *entry set* of a single-branch, single-scope `/refine` history under **scope-aware** replay (T02.C1); FALSE under naive replay across mixed scopes even with `/refine` as the only writer (T02.C7/C8); FALSE with a foreign writer, though contamination is detectable in the tested fixture (T02.C2–C5). Recovering the effective *system prompt* remains impossible either way (T02.A8) |
| 7 | "Accumulated harness state becomes invisible" | **SETTLED WITH NARROWER WORDING** | Absent from the default routing summary; retrievable by six paths (T03.3, T03.5–T03.13) |
| 8 | "Full harness state remains programmatically accessible" | **SETTLED** | RUNTIME-CONFIRMED through six API surfaces over one store (T03.5–T03.10) |
| 9 | "An agent will retrieve displaced harness state when it matters" | **STILL UNRESOLVED** | Claim 4 NOT TESTED — requires a real model |
| 10 | "Displaced harness state costs task performance" | **STILL UNRESOLVED** | Claim 5 NOT TESTED — requires a real model and held-out tasks |
| 11 | "The faux evaluation surface is nondeterministic" | **SETTLED WITH NARROWER WORDING** | True at byte/identifier/segmentation level; false at the semantic level (T04) |
| 12 | "Faux runs are semantically reproducible" | **SETTLED** | All six semantic dimensions identical across 3 processes (T04.S5–S10) |
| 13 | "Faux usage accounting is reproducible" | **ENVIRONMENT-DEPENDENT** — rejected for input tokens, accepted for output tokens | Output tokens identical in every run (T04.S10a); input tokens vary ±1 across processes, tracking system-prompt length, cause diagnosed (T04.S10b, T04.S10c) |
| 14 | "Prime Agent records model configuration" | **SETTLED WITH NARROWER WORDING** | Nominal configuration yes; effective configuration no (T05) |
| 15 | "Prime Agent records no per-response model identity" | **SETTLED** — rejected | `responseModel` and `responseId` persist when the provider supplies them (T05.6, T05.7) |
| 16 | "Records establish controlled run equivalence" | **SETTLED** — rejected | Seed, temperature, snapshot, prompt bytes, harness hash all absent (T05 absence checks) |
| 17 | "Requested configuration is recoverable from the record" | **SETTLED** — rejected | Only effective post-clamp values are recorded, and only on change. Clamped requests lose the requested value; no-ops lose the event entirely; accepted values survive verbatim (T05.4b–T05.4d) |
| 18 | "Verifiers/prime-rl closes a score → refinement loop" | **SETTLED for this repository; DEFERRED for the external side** | No adapter and no reward/score concept exists here; the examined typed refinement input channel carries untyped free text (EXT.1–EXT.4). "Only inbound channel" was wrong — Test 01 itself shows the trajectory is another route |

---

## 3. What changed as a result of this phase

**Two prior claims were rejected outright.** "Gates and `/refine` never touch"
is false — the transcript path is real and was observed. "Prime Agent records no
per-response model identity" is false — `responseModel` and `responseId` persist
when supplied.

**Two of this study's own claims were rejected on audit, in successive passes.**
The first version marked complete harness-state reconstruction as PARTIAL for
`/refine` on the strength of an argument rather than a test; reverse-replay of
the ordered edit log reconstructs it exactly. The correction that established
that then overstated in the opposite direction, claiming the foreign-writer
failure leaves "no marker in the records" — also asserted rather than tested,
and also false. See `audit-response.md`.

**Four were narrowed rather than overturned.** Gate/refinement independence is
true of *typing and determinism*, not of *information flow*. Provenance absence
is true of *direct CRUD*, not of `/refine`. Invisibility is *bounded default
rendering*, not inaccessibility. Nondeterminism is *framing-level*, not
semantic.

**Three new gaps surfaced that neither prior study had named.** First, a clamped
configuration request records the post-clamp value and silently loses the
requested one, and a no-op request records nothing — a gap in the *nominal*
record, which had been treated as the part that *was* reliable. Second, faux
input-token accounting is not reproducible across processes: it moves with the
incidental length of the temp session path embedded in the system prompt; both
prior studies had treated usage as stable under the faux provider. Third, and most
consequential for the next phase: a foreign writer makes reverse-replay return a
confident wrong answer — but the contamination is detectable from record
inconsistencies, so an experiment can audit writer purity rather than merely
assume it.

**Two remain genuinely open and are not answerable without a real model:**
whether an agent spontaneously retrieves displaced harness state, and whether
that retrieval affects task outcome. Both were deliberately left untested rather
than approximated with a faux provider whose decisions the probe itself authors.

---

## 3b. Admitted findings, stated at their tested boundary

After two correction passes, these are the seven claims the artifact stands
behind, each scoped to what was actually run.

**A. TRANSPORT.** Gate-failure continuation text can enter a *subsequently
invoked* refinement request through the shared trajectory. This does not
establish triggering, scheduling, or behavioural influence on the refiner.
Transport itself is deterministic given invocation and an in-window
continuation.

**B. RECONSTRUCTION.** Scope-aware reverse replay of the tested `/refine` edit
history reconstructs the earlier harness **entry set** exactly, with no
full-state snapshot. Scope-aware is load-bearing: naive replay across records
from more than one harness store is wrong even with `/refine` as the only
writer. `HarnessState.refinements[]` and `schema` are not reconstructed.

**C. CONTAMINATION.** A direct CRUD write invalidates that reconstruction. In
the tested fixture the contamination is detectable from production-record
inconsistencies — chain break, version gap, source mismatch, orphan state — with
zero false positives on the clean history. The study does **not** establish
universal detectability of every foreign mutation, and detection is not
attribution: the signals bound which entries were touched but recover neither
the write's content nor its position.

**D. ROUTING.** Default harness salience degrades under accumulation; the
omission is signalled, not silent. Displaced state remains accessible through
multiple interfaces over one store. Autonomous retrieval and task benefit remain
untested.

**E. FAUX REPRODUCIBILITY.** For one fixed scripted flow, selected semantic
projections survive volatile-framing normalization. Model content is
fixture-authored, so the load-bearing part is that the surrounding pipeline
preserved it. This does not generalize to provider behavioural determinism.
Input-token accounting is an environment-dependent exception, consistent with
and mechanistically explained by prompt-length framing — a necessary condition
was tested, not sole causation.

**F. CONFIGURATION.** Persisted records capture useful requested / effective /
change information but are insufficient for controlled run equivalence.
Accepted, clamped and no-op service-tier behaviour are three distinct outcomes
and must stay distinguished: accepted is recorded verbatim, clamped writes an
event carrying the post-clamp value and loses the request, no-op writes nothing.
**No rejected request was tested.**

**G. EXTERNAL EVALUATION.** No typed, internally closed score → refinement
protocol was found in this repository. External implementation remains
unstudied.

---

## 4. Boundary

This phase stops here, as instructed. The next question —
*does continual harness refinement actually improve future task outcomes?* — is
materially different and requires design decisions this study did not make:
task set, held-out evaluation, real model and provider, evaluator independence,
static vs refinement conditions, outcome-conditioned refinement,
candidate/review/promotion, replication, and cost/quota.

Three findings here constrain that design and should be carried into it:

1. **Q5's boundary limits what "controlled" can mean.** Without seed,
   temperature, model snapshot, prompt bytes, or a per-request harness hash in
   the record, two runs cannot be shown equivalent from artifacts alone. Any
   controlled comparison must add its own provenance capture.
2. **Q2's matrix determines what a refinement-condition arm can prove, and the
   requirements are writer purity AND scope discipline.** A single-scope,
   single-branch `/refine` history is fully reconstructible with no extra
   instrumentation — stronger than the first draft believed. But two things
   break it. Mixing global and local refinements breaks a naive replay even with
   no foreign writer, so any reconstruction must filter by the recorded
   `harnessStatePath`. And a direct `rlm.harness` CRUD write makes replay
   produce a plausible wrong state — detectable, in the tested fixture, via the
   four record-consistency signals, so a reconstruction pipeline should run that
   detector as a precondition rather than assume purity.
3. **Q4 sets the achievable reproducibility target.** Semantic-script
   reproducibility is attainable and is the right equality relation for
   assertions; byte or event-frame equality is not, and should not be built into
   any harness's pass criteria. Note specifically that **token-usage equality is
   not a safe assertion even under a faux provider** — input accounting moves
   with incidental prompt-framing length. A cost or budget comparison between
   experimental arms needs a tolerance, not an equality check.
