# Experiments 2–5: Completed Synthetic Harness Study

Status: **PASS AS A SCAFFOLD TEST; INCONCLUSIVE FOR REAL-MODEL SELF-IMPROVEMENT**.

No external model, credential, network service, or paid token was used. The actor, reviewer, evidence validator, tasks, and ground truth are deterministic study fixtures. Production harness state, proposal application, formatting, persistence, and rollback planning/application are used where stated.

## Checkpoint record

Every point at which the study would previously have stopped is preserved in `artifacts/checkpoints.jsonl` and a separate `checkpoint-*.json`:

| Checkpoint | State | Result |
|---|---|---|
| 00 — design freeze | 8 held-out tasks in two families, 4 sentinel tasks, zero external calls | Design and limitations fixed before outcomes. |
| 01 — Experiment 2 | refinement disabled versus enabled | Disabled 0/8; enabled 8/8; 0 sentinel regressions. |
| 02 — Experiment 3 | unrestricted versus evidence-required | Unrestricted caused 4/4 sentinel regressions; evidence-required caused 0/4 and rejected 2 unsupported candidates. |
| 03 — Experiment 4 | self-immediate versus independent review/proposal | Synthetic promotion precision: 0.50 versus 1.00/1.00. |
| 04 — Experiment 5 | harmful entry and rollback stress | Score fell to 0/12, recovered to 12/12, entry hash recovered exactly, reload retained recovery. |

The complete runner output was byte-identical across two executions.

## Experiment 2: disabled versus enabled

### Design

Eight held-out tasks were divided equally between two families:

- validation tasks repeat the training error unless the harness contains the repository-approved validation policy;
- inspection tasks repeat snippet-only inspection unless the harness contains the full-file inspection policy.

Four unrelated sentinels detect a broad harmful policy. Both conditions start at 0/8. The enabled condition applies two prompt entries through `applyRefinementProposal`; the disabled condition remains empty.

### Result

| Metric | Disabled | Enabled |
|---|---:|---:|
| Held-out passed | 0/8 | 8/8 |
| Sentinel passed | 4/4 | 4/4 |
| Refinements | 0 | 1 |
| Applied edits | 0 | 2 |
| Simulated turns | 2 | 2 |
| Provider tokens | 0 | 0 |

Every paired held-out difference was `+1`; the deterministic resampling interval is `[1, 1]`. This is a fixture property, not a statistical estimate of a model effect. The actor explicitly recognizes study markers, so the experiment demonstrates causal prompt-state plumbing, not learned generalization.

## Experiment 3: evidence required versus unrestricted

Four candidate edits were offered: two supported policy entries and two unsupported entries, including a broad harmful prompt. Unrestricted application accepted all four. The study-owned evidence gate accepted only candidates with both preserved trajectory references and a validation field.

| Metric | Unrestricted | Evidence required |
|---|---:|---:|
| Candidates applied | 4 | 2 |
| Held-out passed | 0/8 | 8/8 |
| Sentinel passed | 0/4 | 4/4 |
| Unsupported rejected | 0 | 2 |

The evidence gate prevented the fixture's known regression. It is external study logic; Prime Agent's production refinement schema does not enforce these references.

## Experiment 4: self versus independent review/promotion

Eight synthetic candidates contained four supported and four unsupported/harmful candidates.

| Strategy | Promoted | True positive | False positive | Precision |
|---|---:|---:|---:|---:|
| Self, immediate mutation | 8 | 4 | 4 | 0.50 |
| Independent review | 4 | 4 | 0 | 1.00 |
| Independent proposal | 4 | 4 | 0 | 1.00 |

This confirms that the proposed candidate/review bookkeeping and metrics can distinguish strategies when ground truth is known. It does not show that a real independent model can identify good refinements: the reviewer and labels are deterministic and share the study's ground truth.

## Experiment 5: rollback stress

Two good policy entries first produce 12/12 across held-out and sentinel tasks. A plausible broad harmful prompt reduces performance to 0/12. Production rollback planning constructs inverse edits from the recorded refinement; application restores the exact semantic entry hash and 12/12 score. Saving and loading a fresh `HarnessState` retains 12/12.

A second branch creates a benign memory while the harmful prompt exists, then rolls back only the harmful prompt. Behavior returns to 12/12 and the derived memory remains. This shows targeted rollback, but it cannot establish that arbitrary downstream refinements are uncontaminated by a bad ancestor.

## Measurements retained

- success and sentinel regressions;
- repeated synthetic error strings;
- turns and provider-token usage (two turns and zero tokens per Experiment 2 condition);
- refinement frequency and applied-edit count;
- candidate acceptance/rejection and promotion precision;
- rollback count and pre/post/reload score;
- semantic state hash at every checkpoint;
- limitations attached to every checkpoint.

Compactions and subagents were zero because these fixtures do not exercise them. Wall time is intentionally not compared because the deterministic runner performs no provider work and timing would measure the container rather than the harness condition.

## Conclusion

**Prime Agent is a good scaffold for controlled harness-refinement research, with important limitations.**

Useful now:

- isolated local/global harness stores;
- production create/update/delete and rollback mechanics;
- session-visible prompt rebuilding;
- faux-provider integration testing;
- artifact, lineage, and checkpoint capture;
- experiments that externally impose evidence and promotion policies.

Not established or not sufficient now:

- real-model trajectory-driven improvement;
- generalization beyond prompt-marker fixtures;
- trustworthy self-authored evidence;
- safe immediate global mutation;
- independent review effectiveness with actual models;
- causal cleanup of refinements derived from harmful state.

Therefore this is a **good experimental scaffold**, not yet a validated self-improving system or a sufficient production promotion mechanism. A real claim requires non-synthetic held-out tasks, real actor/reviewer models, independent evaluation, uncertainty across repeated runs/models, and evidence-linked candidate/review/promotion rather than immediate mutation.

## Files

- `run.ts`: deterministic runner and assertions.
- `run-output.txt`: exact output from the second byte-identical run.
- `artifacts/experiment-2.json` through `experiment-5.json`: detailed metrics.
- `artifacts/checkpoint-*.json` and `checkpoints.jsonl`: checkpoint state.
- `artifacts/final-state.json`: combined result.
- `artifacts/conclusion.json`: machine-readable verdict.

## Reconstruction

`reconstruction.patch.b64` decodes to a patch that applies the completed Experiments 2–5 artifacts to study baseline `d65d4b1`. Copy it outside the checkout, check out that baseline, and run `base64 -d reconstruction.patch.b64 > /tmp/experiments.patch && git apply /tmp/experiments.patch`. The decoded patch excludes its base64 carrier. `manifest.sha256` covers all files in this directory except the manifest.
