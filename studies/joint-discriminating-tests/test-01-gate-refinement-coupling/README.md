# Test 01 — Gate → refinement transcript coupling

## Question

Can an autonomous quality-gate failure reach the `/refine` refiner, and if so by
what mechanism?

Four sub-questions are answered separately:

- **A.** Does the information path exist?
- **B.** Is there any typed gate-result identity or linkage?
- **C.** Is gate outcome mechanically validated after refinement?
- **D.** Can the gate failure influence the refiner only probabilistically,
  through transcript text?

## Hypothesis alternatives

| | Hypothesis | Would look like |
| --- | --- | --- |
| **H0** | NO CONNECTION | Gate output never appears in the refiner request. |
| **H1** | UNTYPED TRANSCRIPT-MEDIATED CONNECTION | Gate output appears only as conversation text; no typed field; no post-refinement gate validation. |
| **H2** | MECHANICALLY LINKED CONNECTION | A typed gate result is passed into refinement, and/or the gate is re-run to validate the refinement. |

## Source anchors

| Anchor | What it establishes |
| --- | --- |
| `packages/coding-agent/src/core/autonomous.ts:333-343` | On gate failure, `state.lastGateFailure` captures `{command, attempt, exitText, output}`. |
| `packages/coding-agent/src/core/autonomous.ts:350-360` | `buildAutonomousGateFailureContinuation()` renders those fields into user-visible text. |
| `packages/coding-agent/src/core/autonomous.ts:212-224` | `nextAutonomousContinuation()` returns that text as a `UserMessage`. |
| `packages/coding-agent/src/core/agent-session.ts:2735`, `:3224` | The continuation is admitted into the session as ordinary session input. |
| `packages/coding-agent/src/core/refinement/refinement.ts:892` | `planRefinement()` builds `conversationText = serializeConversation(convertToLlm(messages)).slice(-80_000)`. |
| `packages/coding-agent/src/core/refinement/refinement.ts:896-905` | That text is wrapped in `<conversation>` and sent to the refiner. |
| `packages/coding-agent/src/core/agent-session.ts:7845` | `planRefinement(this.agent.state.messages, ...)` — the live trajectory, continuation included. |
| `packages/coding-agent/src/core/refinement/refinement.ts:93-102` | `RefinementResult` shape — no gate field. |

## Exact command

```bash
npx tsx studies/joint-discriminating-tests/test-01-gate-refinement-coupling/run.ts
```

## Environment

Node v22.22.2, Linux 6.18.5-fc-v20, no provider credentials, isolated agent dir.
See `../execution-envelope.md`. The gate is a real child process:

```
printf '%s\n' "JOINT_GATE_SENTINEL_7F31 assertion failed in verify_reward()" ;
printf 'ran\n' >> "<scratch>/gate-invocations.log" ; exit 3
```

It appends one line per invocation, so gate executions can be counted across
phases. The refiner call is served by the in-repo faux provider, which captures
the exact request.

## Raw output

```
[PASS] T01.1: the deliberately failing gate actually executed -- gate invocations = 2
[PASS] T01.2: the gate-failure continuation carrying the sentinel entered the session trajectory as a user message -- continuation length 388
[PASS] T01.3: the refiner planning request was captured through the faux provider (no credentials used)
[PASS] T01.4: the gate sentinel appears inside the <conversation> block supplied to the refiner
[PASS] T01.5: the sentinel reaches the refiner ONLY through <conversation>, not through a dedicated gate field
[PASS] T01.6: C: the autonomous gate is NOT re-run as part of refinement -- before=2 after=2
[PASS] T01.7: B: the persisted RefinementResult carries no gate-typed field -- gate-shaped keys: []
[PASS] T01.8: B: the RefinementResult does not record the gate outcome that preceded it
[PASS] T01.9: B: neither module imports or references the other's types (no static typed linkage) -- refinement->gate: []; autonomous->refinement: []
[PASS] T01.10: D: the applied edits come from the refiner reply, so gate text can only influence refinement probabilistically -- applied: ["create memory:t01_probe_memory"]
```

The captured `<conversation>` block sent to the refiner
(`artifacts/refiner-request-conversation-block.txt`):

```
[User]: implement the reward function and finish

[Assistant]: Implemented the reward function. Task complete.

[User]: Autonomous quality gate failed (attempt 1/3): `printf '%s\n' "JOINT_GATE_SENTINEL_7F31 assertion failed in verify_reward()" ; ... ; exit 3` exited 3.

Output:
JOINT_GATE_SENTINEL_7F31 assertion failed in verify_reward()

Continue working. Fix the failure, then produce terminal evidence. Timestamp: 2026-08-16T02:42:12.146Z.

[Assistant]: Re-checked the reward function and adjusted the tolerance.
```

The full refiner request (`artifacts/refiner-request-user-prompt.txt`) contains
exactly five blocks: `<current_harness_state>`, `<refinement_history>`,
`<conversation>`, `<scope_policy>`, `<user_refine_instructions>`.

## Result

**H1 — UNTYPED TRANSCRIPT-MEDIATED CONNECTION.** RUNTIME-CONFIRMED.

- **A: the path exists.** The sentinel, emitted only by the failing gate's
  stdout, is present verbatim in the `<conversation>` block of the refiner
  request.
- **B: no typed linkage.** The sentinel appears in no other block and not in the
  refiner system prompt. `RefinementResult` has keys
  `["appliedEdits","expectedOutcome","harnessStatePath","id","rationale","scope","summary"]`
  — none gate-shaped, and the serialized result does not contain the sentinel.
  Neither module references any of the other's symbols.
- **C: no mechanical validation.** The gate invocation counter is unchanged
  across the refine call (2 → 2). Refinement neither re-runs the gate nor checks
  its outcome.
- **D: probabilistic only.** The applied edit is exactly the one the refiner
  reply proposed. Gate text is one input among five to a free-form model call.

## What this result DOES establish

- Gate-failure output physically reaches the refiner's request bytes, on this
  code path, in this configuration.
- No typed field, shared identifier, or import connects the two subsystems.
- Refinement does not validate the gate outcome it may have been influenced by.
- The only channel is conversation text, so any influence is mediated by a model
  and is therefore non-deterministic.

## What this result DOES NOT establish

- That a real refiner model **would** act on the gate failure. The proposal here
  was authored by the probe.
- That the path holds when the continuation is pushed out of the 80,000-character
  `slice(-80_000)` window, or after a compaction rewrites the trajectory.
- Anything about the other continuation route
  (`_queueAutonomousContinuationForThresholdCompaction`, agent-session.ts:2735),
  which was not the route exercised here.
- Anything about auto-`/refine` (`reviewAutoRefine`), which was not exercised.
- That "gate failure caused the refinement" in any causal sense — only that the
  information was available to the refiner.
