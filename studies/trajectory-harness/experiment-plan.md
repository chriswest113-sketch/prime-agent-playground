# Small Controlled Experiments

These experiments follow baseline characterization. They deliberately avoid building a general evaluation platform.

## Shared minimal record

For each run, preserve:

- immutable run ID, baseline commit, branch, model/provider/API, task/variant ID, seed/temperature where supported;
- assigned condition and whether the actor/reviewer saw prior trajectories;
- transcript/session file and harness snapshots before/after each refinement;
- assistant turns, input/output/cache tokens, wall time, child count/usage, compactions;
- repeated error signatures, refinement count/kind/scope, evidence references, apply failures, rollbacks;
- exact quality-gate commands, exit codes, bounded output hashes, and workspace commit/diff hash;
- task success rubric, regressions, and held-out variant score;
- missing data and environment failures separately from task failure.

Use repository-native JSONL plus a small study-owned manifest. Do not mutate global user state: set a temporary agent home per run and archive it.

## Experiment 1: mechanics and contamination check

**Purpose:** establish that assigned conditions remain isolated before measuring quality.

Use one deterministic faux-provider trajectory that contains a repeated correctable error. Run:

- A: refinement disabled;
- B: local refinement enabled;
- C: global refinement requested in a temporary isolated agent home.

Verify exact harness diffs, session records, rollback, prompt inclusion on the next turn, no leakage across agent homes, and no mutation of the baseline worktree. This tests instrumentation, not improvement.

**Stop condition:** any cross-condition contamination, missing lineage, or non-reproducible state hash.

## Experiment 2: enabled versus disabled paired tasks

**Purpose:** test durable improvement with the least causal structure.

Select 6–10 short tasks in two families, each with:

1. a training variant designed to expose a reusable failure;
2. an isomorphic held-out variant with renamed entities/data;
3. an unrelated sentinel task that detects broad regressions.

Randomly assign paired fresh sessions to:

- A: refinement disabled;
- B: local immediate self-refinement after the training trajectory.

Evaluate held-out variants in fresh context while loading only the condition's intended harness state. Primary outcome: held-out task success. Secondary outcomes: repeated-error rate, gate attempts, tokens, turns, and regressions. Report paired differences and bootstrap intervals; do not treat harness-entry count or eloquence as success.

**Durability criterion:** benefit must appear on held-out variants after a session restart/reload, not only in the refining turn.

## Experiment 3: evidence requirement

Only if Experiment 2 shows measurable signal, compare:

- B1: unrestricted immediate refinement;
- B2: proposal rejected unless every edit names at least one preserved trajectory entry/tool-result ID and a validation step.

Initially enforce the requirement in the study runner/manifest rather than modifying production schema. Measure invalid/unsupported refinement rate, held-out score, regressions, and review cost.

## Experiment 4: self versus independent review/promotion

Only if unsupported or regressive edits remain material, compare:

- C1: self-proposed, immediately applied;
- C2: self-proposed candidate reviewed in fresh context by an independent model/run, then promoted or rejected;
- C3: independently proposed from the same redacted trajectory.

Candidates live only under the study directory until promotion; do not write production global harness state. Blind the evaluator to condition and entry prose. Measure promotion precision, improvement, regressions, latency, and tokens.

## Experiment 5: rollback stress

Inject a known harmful but plausible entry after establishing baseline scores. Test:

1. detection on sentinel/held-out failures;
2. direct rollback;
3. behavior after restart;
4. whether later derived refinements preserve the harm.

Distinguish record restoration from behavioral recovery. A rollback is successful only if state hashes and task outcomes recover within declared tolerance.

## Analysis rules

- Predeclare task rubrics, primary outcomes, exclusions, and stopping rules before inspecting condition results.
- Keep task generation separate from evaluation where practical.
- Preserve failures and skipped runs; never replace them silently.
- Compare identical model/provider versions and budgets within a pair.
- Report effect sizes and uncertainty, not only pass counts.
- Treat repeated variants from one task family as clustered, not independent samples.
- Do not promote global refinements from these experiments without explicit human review.

## Checkpoint after Experiment 1 (historical)

At this checkpoint, Experiment 1's mechanics and contamination check has been executed and passed. See [`experiment-1/README.md`](experiment-1/README.md). This result validates the minimal instrumentation and condition isolation only; it is not evidence of durable task improvement. Experiments 2–5 have not begun.

## Final execution status

Experiments 2–5 have now been executed as deterministic, credential-free scaffold tests. See [`experiments-2-5/README.md`](experiments-2-5/README.md). All planned mechanics comparisons are complete, but the results are explicitly synthetic and do not establish real-model self-improvement or generalization.

## Adversarial audit status

Experiment 6 challenged the favorable synthetic results and falsified five assurances. See [`experiment-6-adversarial/README.md`](experiment-6-adversarial/README.md). The experimental program is complete for credential-free deterministic mechanics; further progress toward self-improvement claims requires non-synthetic models/tasks and stronger evidence, independence, lineage, and retrieval controls.
