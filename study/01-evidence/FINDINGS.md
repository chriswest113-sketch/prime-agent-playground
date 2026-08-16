# Prime Agent — Implementation-Grounded Findings

**Subject:** `prime-agent` v0.7.2 @ `97b994c3d7c45ca1ae635190e91e9e58ddf2577c`
**Method:** source reading (files read in full), direct execution of the real modules, full test-suite runs.
**Status of each claim below:** every assertion carries a `file:line` citation or an experiment id.
**Provenance caveat:** the clone is shallow (50 commits). No historical/evolution claims are made from git.

---

## 1. What Prime Agent actually is

A TypeScript monorepo (~190k LOC non-test) plus a small Python kernel-side runtime (1,534 LOC,
`prime-agent-runtime/src/rlm/`). Four workspaces: `ai` (provider layer, 36.9k), `coding-agent`
(the agent itself, 134.5k), `tui` (15.1k), `agent` (2.4k). 424 TypeScript test files, 4 Python.

The distinguishing design decision is that **the model's primary tool is a persistent IPython
kernel**, not a set of discrete tools. File edits, shell, search, subagent spawning, and harness
mutation are all Python calls in one long-lived namespace.

---

## 2. The two loops, and the fact that they do not touch

This is the central structural finding.

Prime Agent contains two distinct feedback structures. **Neither references the other.**
Verified by exhaustive cross-grep: `autonomous.ts` contains zero references to refine/refinement;
`refinement.ts` contains zero references to gates, autonomous, exitCode, spawn, or exec
(the only `gate` hits in `refinement.ts` are the string "review gate" in a prompt, `refinement.ts:175`).

### Loop A — Autonomous quality gates: **closed, but off by default**

`packages/coding-agent/src/core/autonomous.ts`

- A gate is a **shell command**; pass/fail is `result.status === 0` (`autonomous.ts:320-328`).
- Failure feeds a continuation prompt containing the command, attempt count and truncated output
  (`autonomous.ts:349-360`), and the run continues.
- Retries bounded by `maxRetries: 3` (`autonomous.ts:57-61`).
- **Genuine engineering:** before re-running a gate it captures a git worktree snapshot and, if the
  workspace is byte-identical to the last failure, refuses to re-run and tells the model to change
  something first (`autonomous.ts:293-311`). This is a real anti-spin mechanism.
- **Default `commands: []`** (`autonomous.ts:58`). With no gate configured,
  `refreshAutonomousQualityGates` returns `undefined` immediately (`autonomous.ts:278-280`) and the
  run terminates only on budget exhaustion: `maxContinuations: 3, maxTurns: 12, maxTokens: 80_000,
  timeoutMs: 30min` (`autonomous.ts:50-55`).
- Therefore, **out of the box autonomous mode has no success criterion at all.** The README states
  this plainly — "reaching a limit does not imply task success" — which is an accurate self-description.

### Loop B — `/refine` continual harness: **open; it writes but never measures**

`packages/coding-agent/src/core/refinement/refinement.ts` (1,017 lines, read in full)

The full cycle is: serialize trajectory → one `completeSimple` LLM call → parse JSON edits →
validate shape → apply to a JSON store → append an event. That is the entire loop.

- The refiner emits `expectedOutcome`, documented to the model as *"what should improve and how to
  validate it"* (`refinement.ts:158`).
- **`expectedOutcome` is never evaluated.** Exhaustive grep of every read site: it is stored on the
  result (`:796`), copied verbatim into the history event's `outcome` field (`:788`), and re-rendered
  as prose back into the refiner's own next prompt (`:559`). No code parses it, executes it, or
  compares it to anything. Confirmed experimentally (EXP-PA-001/H3).
- The `evidence` field of a persisted refinement event is `proposal.rationale` (`:787`) — the
  **same model's own justification**, not external evidence.
- `RefinementResult` has no field for an observed outcome (EXP-PA-001/H3b), so a later turn has
  nowhere to record "this refinement did or did not help."

The phrase "evidence-backed" in the README describes the *prompt instruction* given to the refiner
(`refinement.ts:150-151`, `prompts/rlm.ts:158`), not a verification performed by the system.

### The consequence

Prime Agent can measure (Loop A) and it can learn (Loop B), but **the thing it measures never informs
the thing it learns.** A gate failure cannot cause a refinement; a refinement is never validated by a
gate. The observe→hypothesize→test→measure→update-belief cycle is broken between *test/measure* and
*update belief*: belief updates happen, but on the basis of an LLM's reading of a transcript, not on
the basis of an outcome.

---

## 3. Measurement by instruction, not by mechanism

A recurring pattern: where a closing mechanism is absent, the system substitutes a natural-language
instruction telling the model to do it.

- `prompts/rlm.ts:158`: *"diagnose the issue, update the smallest relevant continual harness
  component, **validate on the next action, then record the outcome**."*
- `harness.py:716`: *"Run the next action with the changed harness state, then record the outcome."*

There is no field to record the outcome into and no code that checks whether it happened.
Loop closure is delegated to model compliance. This is a design choice with a real cost for anyone
trying to attribute outcomes to harness states: compliance is unobservable and unenforced.

---

## 4. Direct experimental results (EXP-PA-001)

Real modules, no mocking of the code under test. Script and raw output:
`study/02-experiments/exp-pa-001-refinement-loop/`.

| ID | Hypothesis | Verdict |
|----|-----------|---------|
| H1 | Base-system-prompt edits are refused **by code** | **SUPPORTED** |
| H2 | Rollback restores the exact prior state | **PARTIAL** |
| H3 | Something records whether a refinement helped | **REFUTED** |
| H3b | `RefinementResult` has an observed-outcome channel | **REFUTED** |
| H4 | Harness history is bounded/trimmed | **REFUTED** |
| H5 | The model sees the harness state it accumulated | **REFUTED** |
| H6 | A stale-planned refinement is refused | **SUPPORTED** |

**H1 — immutability is real, and narrow.** Enforcement is a single identifier check:
`edit.kind === "prompt" && (edit.id === "base_system_prompt" || computedId === "base_system_prompt")`
(`refinement.ts:671-673`). I confirmed both the explicit-id route *and* the title-slug route
(a title of "base system prompt" slugs to the same id) are blocked, while a control edit applies.
The stronger structural guarantee is architectural, not that check: refinement writes to a *separate
store* that is rendered as a supplemental block, so the base prompt is never in the edit surface.

**H2 — rollback restores content, not identity.** Content, title and path are restored from the
`before` snapshot, but `version` is monotonic: it went 1 → 2 → 3 across write-then-rollback. An entry
that has been rolled back is not distinguishable by version from one edited twice.

**H4 — unbounded.** 500 refinements produced a 439.8 KiB `harness_state.json` with 500 entries and
500 history events retained. No prune, trim, or evict call exists in the module.

**H5 — the accumulation is largely invisible, and the sampling is pathological.** With 500 entries on
disk, the prompt rendering showed **6**, and 5 of 500 refinement events. The caps are module constants
(`refinement.ts:26-28`). The serious part is the *selection rule*: entries are sorted alphabetically by
`(path, title, id)` (`refinement.ts:467-469`) and the first 6 taken. The rendered sample was
`mem_0, mem_100, mem_101, mem_102, mem_103, mem_104` — **not recency, not usage, not relevance.**
A long-running session's most recent lessons are systematically invisible to the model that wrote them,
and which lessons survive into the prompt is an artifact of lexical ordering of titles.

**H6 — a real concurrency guard, with a gap.** `applyRefinementProposal` refuses an edit whose entry
changed since planning began (`refinement.ts:727-740`) — correct optimistic concurrency, motivated by
the multi-second LLM call in the middle. But it only engages when the caller passes `baselineState`,
and the convenience wrapper `refineHarness()` (`refinement.ts:1000-1017`) **does not pass it**. Only
the split `planRefinement` / `applyRefinementProposal` path is protected.

---

## 5. Two writers to one store, under different safety regimes

The harness store `harness_state.json` has **two independent writers**:

1. **TypeScript `/refine`** — journaled (global → `refinements.jsonl`, `refinement.ts:374-379`;
   local → session JSONL), rollback-able via `before`/`after` snapshots, optimistic-concurrency-guarded.
2. **Python direct CRUD** from the kernel — `rlm.harness.create_memory(...)`,
   `update_*`, `delete_*` (advertised to the model at `prompts/rlm.ts:29`), implemented in
   `prime-agent-runtime/src/rlm/harness.py`.

The Python path is **unjournaled and irreversible**. `_upsert` mutates and calls `self.save()`
(`harness.py:345-401`); `delete()` does `del self.entries[kind][id]; self.save()`
(`harness.py:412-424`) with **no before-snapshot recorded anywhere**. `record_refinement`
(`harness.py:677-689`) exists but is a *separate, manual* call the model must choose to make.

So a model-initiated `delete_memory` is unrecoverable, invisible to rollback, and leaves no trace
beyond the entry's absence. The only distinguishing mark is the `source` field: `"refine"` vs `"agent"`.

Note the contrast in engineering discipline within the same codebase: the **subagent spawn ledger**
(`src/modes/daemon/rlm-ledger.ts`, HEAD commit #1387) is an append-only versioned JSONL log with
enforced append-time invariants, forward-compatible unknown-op skipping, torn-final-line tolerance,
and documented multi-writer `O_APPEND` semantics. That rigor was applied to *process identity*, not to
the *learning* state.

---

## 6. Attribution is not reconstructible

For empirical work the decisive question is: given a recorded session, can you determine what the model
actually saw at turn *t*?

**No.**

- `SessionHeader` records `type, version, id, timestamp, cwd, parentSession, rlmDepth, git`
  (`session-manager.ts:75-85`). No system prompt, no harness-state reference, no harness version,
  no model pin.
- The system prompt is **not persisted in the session at all** (grep for `systemPrompt` in
  `session-manager.ts` returns nothing). It is rebuilt on every turn from the *current*
  `harness_state.json`.
- `harness_state.json` is overwritten in place (atomic temp+rename, `refinement.ts:345-359`);
  only the latest state exists.

Partial recovery is possible in one direction: for `/refine`-authored global edits, `refinements.jsonl`
carries `before`/`after` per edit, so the state could in principle be replayed backwards. That chain
breaks the moment the Python CRUD path writes (§5), and local-scope refinements live only in the
session JSONL.

**Consequence for the research question:** in the abstraction `Y_t = F(G, M_t, S_t, H_t, C_t, ...)`,
Prime Agent mutates `H_t` continuously but does not record `H_t` alongside `Y_t`. Outcomes cannot be
attributed to harness states after the fact. Two runs "on the same harness" are not verifiably the same.

---

## 7. What "prompt-as-a-variable" actually is

The README describes the RLM as treating "context as variables (*prompt-as-a-variable*)".

Implementation: the system prompt contains the line `Conversation log: ${messagesPath}`
(`prompts/rlm.ts:76`), where `messagesPath` is `this.sessionManager.getSessionFile()`
(`agent-session.ts:4305`) — the session JSONL path on disk.

There is **no binding of the conversation to a Python variable**. Grep of the Python runtime for
conversation/message bindings and of the kernel bootstrap for namespace injection of the transcript
returns nothing. The mechanism is: *the transcript is a file, the path is in the prompt, and Python
can read files.*

This is a real and useful capability — the model can slice its own history programmatically rather
than re-reading it into context — but it is materially thinner than "context as variables" suggests.
Assessment: **PARTIAL**, with the gap being that addressability is by file path, not by live value.

What *is* genuinely variable-like: tool calls are Python `await` expressions whose return values bind
to names and persist across turns in the kernel namespace (`prompts/rlm.ts:27`). That part is real.

---

## 8. Measurement is designed to happen outside the agent

Evidence that Prime Agent is built as the *policy* in an externally-scored loop, not as a
self-evaluating system:

- The gate's git-snapshot pathspec hardcodes exclusions for
  `:(exclude)verification`, `:(exclude).vf-prime-agent`, `:(exclude)submission.tar.gz`,
  `:(exclude)runner_args.log` (`autonomous.ts:385-392`) — artifacts of PrimeIntellect's
  `verifiers` / `prime-rl` evaluation harness.
- ACP exposes a namespaced `_meta` channel (`ai.primeintellect.prime-agent`) carrying structured
  subagent, autonomous-gate, goal, and refinement state, documented as read by
  "a prime-agent-aware client (**or the verifiers harness**)" (`modes/acp/acp-meta.ts:1-9`).
  `PrimeAgentAutonomousMeta` exports `gateAttempt`, `gateFailure`, `limitReason`
  (`acp-meta.ts:24-32`); `PrimeAgentRefinementMeta` exports `status`, `summary`, `changes`, `error`
  (`acp-meta.ts:53-58`) — and, consistent with §2, **no outcome measure**.

This reframes the §2 finding. The missing measurement is not an oversight so much as a **boundary
choice**: scoring is the environment's job, and Prime Agent's job is to expose enough structured state
for the environment to score it. That is defensible for RL training. It does mean the agent alone
cannot tell you whether it is improving.

- **Product telemetry is not a substitute.** Five event names total — `agent started`,
  `onboarding completed`, `agent command used`, `agent run completed`, `agent session ended`
  (`telemetry.ts:23-29`) — pseudonymous, opt-*out* (`telemetry.ts:208`,
  `agent-session-services.ts:226`), posted to `api.primeintellect.ai` (`telemetry.ts:13`).
  Coarse product analytics, not experiment data.

---

## 9. Test-suite baseline (executed, not inferred)

Full `coding-agent` suite, credentials unset, `PI_NO_LOCAL_LLM=1`, clean tree at `97b994c`
with `npm install` only:

**300 files passed / 11 failed; 4,091 tests passed / 64 failed / 59 skipped; 264s.**

Dominant failure cause, reproduced in isolation with a minimal repro harness:
`Failed to load extension: Cannot find package '.../@earendil-works/pi-agent-core/dist/index.js'
imported from src/core/extensions/loader.ts`. The extension loader resolves extensions against the
package's **built** entry point; a fresh `npm install` symlinks workspaces to source and produces no
`dist/`. 51 of the 64 failures are the three `extensions-*` files.

**The repository does not build from a clean checkout in this environment.** `npm run build` fails at
`packages/ai` with `TS2536: Type 'TProvider' cannot be used to index type ...` (`src/models.ts:20,34,36`)
under the pinned `tsgo` (TypeScript 7 native preview). `packages/agent/dist` and
`packages/coding-agent/dist` are therefore never produced, so the extension failures are not fixable by
building here.

An earlier draft of this document stated that the build succeeds. It does not; see
`study/02-experiments/INCIDENTS.md` (INC-001) for how that error arose, and for the more consequential
finding that the failed build **silently rewrote tracked source** — `generate-models` runs before the
compile and regenerated `models.generated.ts` from 20,733 to 2,103 lines in this network-restricted
environment. That is a hidden-variable mutation (`M_t`) triggered by the project's own documented build
command, with no version stamp and no warning. The tree has been restored and re-verified.

A "post-build" suite run (141 failures) is recorded as **VOID** — it measured the gutted catalog under
CPU contention. It is not comparable to the figure above.

**Honest characterization:** the suite is large, fast, and overwhelmingly *mechanical* — it asserts
plumbing (protocol shapes, lifecycle, persistence, process supervision), not agent quality.
`refinement.test.ts` mocks `completeSimple` (`refinement.test.ts:33-43`) and asserts edit application,
scope, rollback and concurrency semantics. This is appropriate unit testing; it is **not** evaluation
of whether refinement improves behavior, and the repository contains no harness that measures that.

---

## 10. Assumptions embedded in the design

1. **The evaluator is external.** (§8) Self-measurement is out of scope by construction.
2. **The model is a trustworthy author of its own state.** Refinement edits are validated for
   *shape*, never for *content* (`validateEdit`, `refinement.ts:664-705` — checks action/kind
   enums, required fields, and that skill edits carry a python `reference` + `arguments`).
   Nothing checks that a memory is true or a skill works.
3. **Harness state stays small.** Contradicted by H4/H5: nothing bounds growth, and the prompt view
   degrades to a lexically-arbitrary 6-entry sample.
4. **Session-local by default limits blast radius.** True (`refinement.ts:768` defaults scope to
   `"local"`), and a real safety property — but it also means most learning is discarded with the session.
5. **Not a security boundary.** Stated explicitly in the README and accurate: the kernel executes
   model-generated Python with user permissions.

---

## 11. Open questions (not settled by source or by these experiments)

1. **Does `/refine` improve task outcomes at all?** Unanswerable from this repository — there is no
   benchmark, no scoring harness, and no before/after comparison anywhere in the tree. Requires
   external experiment.
2. **How often does the H5 visibility pathology bite in practice?** Depends on entry-title
   distributions in real sessions. Measurable: seed N entries, vary titles, measure which survive
   into the rendered prompt.
3. **How frequently does auto-refine fire, and what fraction of proposals apply cleanly?**
   `reviewAutoRefine` is itself an LLM gate (`refinement.ts:949-998`) triggered on `turn_interval`
   or `compact`. Its precision/recall is unmeasured.
4. **Does the Python CRUD path get used by models in practice?** If yes, the journal is
   systematically incomplete and §6 is worse than stated.
5. **Is the faux provider capable of deterministic full-trajectory replay?** Partially examined
   (`packages/ai/src/providers/faux.ts` is a scripted-response provider with a `callCount` state
   hook); whether it can replay a *recorded real* trajectory is unresolved.
6. **Upstream correspondence.** Whether this fork matches `PrimeIntellect-ai/prime-agent` at any
   commit is **UNKNOWN** — no upstream remote, shallow clone.

---

## 12. What deserves controlled experimentation

Ranked by information gain per unit effort, for a study of empirically optimizing compound AI systems:

1. **Harness-state visibility under growth (H5 extension).** Cheap, fully deterministic, no LLM
   needed. Quantifies how a "learning" store becomes invisible to the learner. Directly generalizes:
   any system that renders accumulated state into a bounded prompt window has this failure mode, and
   the selection rule is the whole ballgame.
2. **Attribution reconstruction (§6).** Attempt to reconstruct `H_t` for a synthetic session from
   `refinements.jsonl` alone, then again after injecting Python-CRUD writes. Measures exactly how much
   provenance survives. This is the core question for evidence preservation over time.
3. **Closing the loop as an intervention.** Wire gate outcomes into refinement (the link that does not
   exist, §2) in a fork, and measure whether outcome-conditioned refinement beats transcript-conditioned
   refinement. This is the highest-value experiment and the one Prime Agent's architecture most
   cleanly sets up by *not* doing it.
4. **Refinement determinism.** Same trajectory, same harness, N runs of `planRefinement` → how stable
   are the proposed edits? Bears on whether "the harness improves" is even a repeatable operation.
5. **Auto-refine gate precision.** Does `reviewAutoRefine` fire on trajectories where refinement
   demonstrably helps, versus noise?

---

## 13. Relation to the broader problem

Prime Agent is a well-engineered instance of a system that **treats harness state as first-class,
durable, versioned, scoped data** — that part is genuinely valuable and unusually well executed
(typed entries, per-entry versions, scope separation, atomic writes, per-edit before/after snapshots,
optimistic concurrency). It demonstrates that `H_t` can be a real, inspectable, editable artifact
rather than a string baked into a binary.

What it demonstrates by omission is equally instructive. Making harness state *mutable* is not the
hard part; making mutations *attributable to outcomes* is. Prime Agent has:

- durable state ✔
- versioned entries ✔
- snapshot + rollback ✔ (for one of its two writers)
- scoped blast radius ✔
- a measurement mechanism ✔ (gates)
- **a link from measurement to state change ✘**
- **a record of which state produced which outcome ✘**

Those last two are precisely what distinguishes *changing* a system over time from *empirically
improving* it. A system with the first five properties and not the last two can accumulate changes
indefinitely while remaining unable to demonstrate that any of them helped — and, per H5, can
accumulate them past the point where it can even see them.
