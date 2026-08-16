# External evaluator question (secondary, bounded)

## Question

Does the external Verifiers / prime-rl integration actually close any part of
the score → refinement loop?

The brief scopes this deliberately: record what a version-matched adapter or
consumer in this repository establishes; if answering requires external
repository research, mark it `DEFERRED — EXTERNAL REFERENCE STUDY REQUIRED`.
It also forbids inferring architectural intent from comments.

## Design

Two mechanical steps, no interpretation of intent:

1. **Inventory.** Grep every in-repo reference to
   `verifiers|prime-rl|prime_rl|vf-prime|vf_prime` across `.ts .py .md .json
   .toml .sh .yml .yaml`, classify each hit by the *kind of thing it is*, and
   fail if any hit falls outside the known non-integration kinds. Separately
   grep the coding-agent source for any reward/score concept, and for Python
   adapter signatures (`load_environment`, `vf.Environment`, `verifiers as vf`).
2. **Inbound-channel shape.** Runtime-test the one path by which an external
   evaluator could feed a signal into refinement — `refine({instructions})` —
   and record what the refiner actually receives.

## Exact command

```bash
npx tsx studies/joint-discriminating-tests/external-evaluator/run.ts
```

## Raw output

```
[PASS] EXT.1: no version-matched Verifiers/prime-rl adapter, environment module, or consumer exists in this repository -- python adapter files: []; every one of the 37 references falls into a known non-integration kind: ["CO-DEPLOYMENT ARTIFACT (git pathspec excluding a verifiers working directory from gate snapshots)","DOCUMENTATION (prose describing external tools reachable via the `prime` CLI)","OUTBOUND TELEMETRY SURFACE (ACP `_meta` payload a verifiers-aware client may read)","PROJECT PROSE","TEST REFERENCE"]
[PASS] EXT.2: the coding-agent source contains no reward/score concept at all -- hits: []
[PASS] EXT.3: an evaluator signal can only enter refinement as untyped free text inside <user_refine_instructions> -- blocks: ["current_harness_state","refinement_history","conversation","scope_policy","user_refine_instructions"]
[PASS] EXT.4: the refiner request has no typed score/reward field
```

## What is actually present in the repository

All 37 references fall into five non-integration kinds:

| Kind | Example |
| --- | --- |
| DOCUMENTATION | `packages/coding-agent/skills/prime-intellect/` — prose describing verifiers, prime-rl and the Environments Hub as external tools reachable through the `prime` CLI. No code. |
| PROJECT PROSE | `README.md` links, `CHANGELOG.md`. |
| OUTBOUND TELEMETRY SURFACE | `packages/coding-agent/src/modes/acp/acp-meta.ts` — namespaced ACP `_meta` payloads a "prime-agent-aware client (or the verifiers harness)" may read. |
| CO-DEPLOYMENT ARTIFACT | `packages/coding-agent/src/core/autonomous.ts:387` — `:(exclude).vf-prime-agent` in the gate snapshot pathspec, excluding a verifiers working directory. |
| TEST REFERENCE / PROMPT PROSE | test fixtures; the autonomous continuation prompt naming "the host evaluator, verifier". |

Two structural observations follow from the ACP surface, and they are relevant
to Test 01:

- `PrimeAgentAutonomousMeta` carries `gateAttempt` and `gateFailure`.
  `PrimeAgentRefinementMeta` carries `status`, `summary`, `changes`, `error`.
  They are **two separate, unlinked payloads** — no shared correlation id. Even
  at the external boundary, gate outcome and refinement are not typed together.
- Both are **outbound**. Nothing in this repository reads a score back in.

The only inbound channel is `refine({instructions})`
(`rpc-types.ts:55` → `AgentSession.refine`). The runtime test fed it
`"evaluator reward=0.25 on task ext_probe_task"` and confirmed it arrives as
free text inside `<user_refine_instructions>`. The refiner request has exactly
five blocks and none of them is typed for a score.

## Result

**The score → refinement loop is NOT CLOSED IN THIS REPOSITORY.**
IMPLEMENTATION-CONFIRMED (inventory) + RUNTIME-CONFIRMED (inbound channel).

- In-repo adapter: **ABSENT**.
- Outbound: ACP `_meta`, with gate state and refinement completion as separate
  unlinked payloads.
- Inbound: untyped free text only.

**`DEFERRED — EXTERNAL REFERENCE STUDY REQUIRED`** for whether the external
Verifiers / prime-rl side constructs such a loop. That cannot be determined from
this repository; it requires reading version-matched
`PrimeIntellect-ai/verifiers` and `PrimeIntellect-ai/prime-rl`, which is outside
this phase's scope.

## What this result DOES NOT establish

- That no such loop exists anywhere — only that no part of it is implemented or
  consumed here.
- Anything about the external harness's own behaviour.
- Architectural intent. The `acp-meta.ts` comment naming "the verifiers harness"
  is recorded as evidence that an outbound surface exists for such a consumer;
  it is deliberately not read as evidence of what that consumer does.
