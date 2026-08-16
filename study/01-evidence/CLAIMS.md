# Claim Ledger — README claims against implementation

Each README claim is quoted, then given a status against source, tests, and (where run) direct
observation. Statuses: **SUPPORTED** / **PARTIAL** (real but narrower than the wording) /
**INSTRUCTION-ONLY** (the system tells the model to do it; no mechanism enforces or records it) /
**REFUTED** / **UNVERIFIED** (not established in this study).

The distinction that does most of the work here is **mechanism claim** vs **outcome claim**.
Prime Agent's mechanism claims hold up well. Its outcome claims are where the wording outruns
the code.

---

## Mechanism claims

| # | Claim (README) | Status | Evidence |
|---|---|---|---|
| M1 | "persistent IPython is the built-in model tool; file operations, shell commands, tool use, subagents, and context management happen through code" | **SUPPORTED** | Kernel subsystem `src/core/kernel/` (3,405 lines); system prompt establishes the contract, `prompts/rlm.ts:14-34`. Tool calls are Python `await` expressions whose results bind to names and persist across turns (`prompts/rlm.ts:27`). |
| M2 | "treats context as variables (*prompt-as-a-variable*)" | **PARTIAL** | Realized as a **file path in the system prompt**: `Conversation log: ${messagesPath}` (`prompts/rlm.ts:76`), where `messagesPath` is the session JSONL (`agent-session.ts:4305`). No binding of the conversation to a Python value exists — greps of the Python runtime and kernel bootstrap for transcript injection return nothing. Real capability, thinner than the wording. |
| M3 | "`rlm(...)` spawns real child agents ... and returns their results programmatically" | **PARTIAL** | Spawn is real. But the second half is contradicted by the system prompt itself: `await rlm(...)` "returns immediately after task admission with `rlm_child_id`, `name`, `session_dir`, and `model`; **it never waits for or returns the child's answer**" (`prompts/rlm.ts:129`). Results arrive only via `agent_message` replies or files. |
| M4 | "It never rewrites the immutable base system prompt" | **SUPPORTED** | Enforced in code at `refinement.ts:671-673`. Verified by direct execution — both the explicit-id route and the title-slug route are refused while a control edit applies (EXP-PA-001/H1). Architecturally stronger than that check: refinement writes to a separate store rendered as a supplemental block. |
| M5 | "recorded snapshots support rollback" | **PARTIAL** | Real: per-edit `before`/`after` snapshots (`refinement.ts:779`), reverse-order rollback proposal (`refinement.ts:804-836`), global history in `refinements.jsonl` (`refinement.ts:374-379`). Two gaps: (a) `version` is monotonic, so a rolled-back entry is indistinguishable from one edited twice (EXP-PA-001/H2); (b) rollback covers **only** the `/refine` writer — see M6. |
| M6 | "stores supplemental prompts, memories, skill descriptions, and reusable subagent specifications as durable state" | **SUPPORTED**, with a significant caveat | Typed, versioned, scoped entries persisted atomically (`refinement.ts:34-63`, `345-359`). **Caveat:** the store has a *second* writer — the Python CRUD API advertised at `prompts/rlm.ts:29` and implemented in `prime-agent-runtime/src/rlm/harness.py`. That path is unjournaled and irreversible: `_upsert` mutates and saves (`harness.py:345-401`); `delete()` does `del ...; self.save()` (`harness.py:412-424`) with no before-snapshot anywhere. |
| M7 | "local to the session by default" | **SUPPORTED** | Default scope is `"local"` (`refinement.ts:768`, `1015`); global requires an explicit flag. `getLocalHarnessStateDir` / `getGlobalHarnessStateDir` separate the stores (`refinement.ts:269-275`). |
| M8 | "Sessions run in the background: daemon-backed agents keep running when the terminal disconnects" | **UNVERIFIED (strongly indicated)** | Large daemon/supervisor/worker subsystem under `src/modes/daemon/` and `src/modes/session-worker/`, with a dedicated `nightly-process-stress.yml` CI job and extensive supervisor tests. Not exercised end-to-end in this study. |
| M9 | "Agents communicate directly" | **UNVERIFIED (strongly indicated)** | `core/agent-messages.ts` (636 lines), `core/agent-observe.ts` (200), kernel skill tests present. Topology is explicitly bounded: parent, siblings, direct children only; deeper traffic relays (`prompts/rlm.ts:117`). |
| M10 | "Skills are executable: skills are importable Python packages" | **UNVERIFIED (strongly indicated)** | `core/skills.ts` (633 lines), `rlm/skill.py`, skill fixtures incl. a collision fixture, `builtin-skills.test.ts`. Observed indirectly: the suite exercises a deliberately broken skill and degrades with a warning rather than failing (`Warning: Python skill broken_skill failed to install and will be unavailable`, test log). |
| M11 | "Bounded autonomous mode ... continues within configured turn, token, and time budgets" | **SUPPORTED** | `DEFAULT_AUTONOMOUS_LIMITS` = 3 continuations / 12 turns / 80,000 tokens / 30 min (`autonomous.ts:49-55`), enforced in `autonomousLimitReason`. |
| M12 | "can run user-defined quality gates" | **SUPPORTED, off by default** | A gate is a shell command; pass = exit 0 (`autonomous.ts:320-328`); retries bounded at 3 (`autonomous.ts:57-61`). **`commands` defaults to `[]`** (`autonomous.ts:58`), and with none configured the gate check short-circuits (`autonomous.ts:278-280`). Out of the box, autonomous mode has no success criterion. |

---

## Outcome claims

| # | Claim (README) | Status | Evidence |
|---|---|---|---|
| O1 | "**The harness can improve**" / "A Self-Improving RLM Agent" | **INSTRUCTION-ONLY** | The system can *change* its harness. Nothing in the repository establishes, measures, or records *improvement*. There is no benchmark, scoring harness, pass-rate, or before/after comparison anywhere in the tree. |
| O2 | "refine through **small, evidence-backed** updates" | **PARTIAL / INSTRUCTION-ONLY** | "Small" is encouraged by prompt, not enforced — no size or count cap on edits. "Evidence-backed": the persisted `evidence` field is `proposal.rationale` (`refinement.ts:787`) — **the same model's own justification**, not external evidence. The word describes a prompt instruction (`refinement.ts:150-151`), not a verification step. |
| O3 | "`/refine` reviews the current trajectory and can apply small, evidence-backed updates" | **SUPPORTED as described** | Accurate: one `completeSimple` call over the serialized trajectory (last 80,000 chars, `refinement.ts:892`) → JSON edits → shape validation (`validateEdit`, `refinement.ts:664-705`) → apply. Note validation checks *shape only* (enums, required fields, skill `reference`/`arguments`); nothing checks whether a memory is true or a skill works. |
| O4 | "validate on the next action, then record the outcome" (`prompts/rlm.ts:158`; also `harness.py:716`) | **INSTRUCTION-ONLY** | There is **no field to record an outcome into** and no code that checks compliance. `expectedOutcome` is written (`refinement.ts:788,796`) and re-read as prose into the refiner's next prompt (`refinement.ts:559`) — never parsed, executed, or compared. `RefinementResult` has no observed-outcome slot (EXP-PA-001/H3, H3b). `plan_refinement` (`harness.py:704-719`) returns three static strings — a template, not a planner. |
| O5 | "reaching a limit does not imply task success" (README's own caveat) | **SUPPORTED — accurate self-description** | Correct, and the most epistemically careful sentence in the README. With gates unset (M12) there is no success signal at all. |
| O6 | "not a security sandbox" (README warning) | **SUPPORTED — accurate self-description** | The kernel executes model-generated Python with user permissions. Worker/kernel isolation is for lifecycle and recovery, not confinement. |

---

## Claims the README does not make, that a reader may infer

Recorded because the gap between the impression and the implementation is where a reference
study earns its keep.

1. **That accumulated lessons stay available to the agent.** They do not, by default. The
   system-prompt view is hard-capped at 6 entries per kind and 180 characters each
   (`refinement.ts:26-28`), selected **alphabetically** by `(path, title, id)`
   (`refinement.ts:467-469`). At 500 stored memories the model sees 6 — 1.2% coverage — and
   `recall@recent10` is 0% (EXP-PA-002). The store remains reachable from Python
   (`rlm.get_harness_state()`, and `overview()` at a caller-adjustable default of 20 per kind,
   `harness.py:721`), and the prompt block is explicitly described in-code as
   "routing/context hints" (`refinement.ts:449`) — but a lesson absent from the routing view
   gives the model no reason to go looking for it.

2. **That this is opt-in.** Auto-refine is **enabled by default**: `enabled ?? true`, firing every
   **25 assistant turns** or on compaction, with a **20-minute cooldown**
   (`settings-manager.ts:883-897`). Combined with unbounded growth (EXP-PA-001/H4), a long-running
   session automatically accumulates harness state that it progressively cannot see.

3. **That the agent knows whether it is improving.** It has no mechanism to know. That is a
   deliberate boundary, not an oversight: scoring belongs to the external `verifiers` / `prime-rl`
   harness, evidenced by hardcoded gate exclusions for `.vf-prime-agent`, `verification`,
   `submission.tar.gz`, `runner_args.log` (`autonomous.ts:385-392`) and by an ACP `_meta` channel
   documented as read by "a prime-agent-aware client (or the verifiers harness)"
   (`modes/acp/acp-meta.ts:1-9`).
