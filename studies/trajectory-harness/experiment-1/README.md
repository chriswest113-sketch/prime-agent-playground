# Experiment 1: Mechanics and Contamination Check

Status: **PASS**. This is an instrumentation/mechanics check, not an evaluation of self-improvement.

## Question

Can refinement-disabled, session-local refinement, and explicitly global refinement be executed with deterministic faux-provider trajectories while preserving scope isolation, session lineage, prompt visibility, rollback, reproducible semantic state, and product-worktree isolation?

## Conditions

All conditions received the same two-turn deterministic trajectory: the faux assistant selected the repository-forbidden `npm test` command twice and reported the same policy failure.

- **A-disabled:** no refinement call.
- **B-local:** faux-generated prompt-note proposal applied to the session-local harness.
- **C-global:** the same proposal explicitly applied to a dedicated global harness under an isolated agent home.

B and C then rolled back their applied refinement. Every condition used a distinct temporary agent home and persisted session. The production `AgentSession.refine()`, model-facing JSON proposal parser, proposal application, prompt rebuild, session custom-entry recording, save/load, and rollback paths were exercised. The provider was faux; no credentials, external inference, or spend were used.

## Predeclared checks

1. A writes no local or global harness state and its system prompt does not contain the study entry.
2. B writes only local state; C writes only global state.
3. B and C include the entry in the rebuilt system prompt.
4. Every refinement result has a matching `prime-agent.refinement` session entry.
5. Rollback removes the created entry in the selected scope.
6. Agent homes are distinct and no product path outside `studies/trajectory-harness/experiment-1` changes during execution.
7. A second complete run produces identical semantic hashes after removing timestamps, generated IDs, absolute artifact paths, and session-header metadata.

## Result

All checks passed. The runner executed each condition twice and rejected any semantic-hash mismatch. The archived primary run contains:

| Condition | Prompt included before rollback | Refinement records | Rollback | Final harness location | Semantic session hash |
|---|---:|---:|---:|---|---|
| A-disabled | No | 0 | Not applicable | None created | `0bf05e5484eaaa1b441bad5a87614bf992e9f22a35cf0cc61e5930978ae21ac9` |
| B-local | Yes | 2 (apply + rollback) | Passed | Local state, empty after rollback | `7fae2e36f2f0414fe4d6357cc8859107edcab13507d39117622ad3bc8a42e478` |
| C-global | Yes | 2 (apply + rollback) | Passed | Global state, empty after rollback | `087be955b95b6aab48caa71975b51be0686960b12bb3a4486235141f59bc6a1e` |

The final local/global harness semantic hash for both rolled-back conditions was `8d28cd8e1b13d2fdf3ca210132b6d1dcb5dd239cdc63b06fd511b9530ce94dbc`, representing the same empty entry structure after volatile metadata removal.

## Evidence

- `run.ts`: executable assertions and semantic projection.
- `run-output.txt`: exact successful console result.
- `artifacts/result.json`: portable run manifest.
- `artifacts/experiment-1-*/session-runtime/sessions/*.jsonl`: primary session transcripts.
- B local harness and C global harness files: final post-rollback state.
- C `refinements.jsonl`: global apply and rollback history.

## Interpretation boundaries

**RUNTIME-CONFIRMED:** credential-free refinement mechanics can maintain the intended local/global isolation, make supplemental prompt state visible on the next prompt build, record lineage, roll back, and reproduce semantic final state in this fixture.

**NOT ESTABLISHED:** task improvement, generalization, evidence quality, model judgment, independent review value, production-daemon behavior, or behavior under accumulating harness state. The prompt entry was deliberately supplied by a deterministic faux response. Experiment 2 has not begun.

## Reconstruction

`reconstruction.patch` applies the Experiment 1 study changes to baseline `7b69442ed56d3d72e30ab81fc71d2e79a30807de`. Copy the patch outside the checkout, check out that baseline, and run `git apply /path/to/reconstruction.patch`. The patch intentionally excludes itself. `manifest.sha256` verifies every Experiment 1 file except the manifest and reconstruction patch.
