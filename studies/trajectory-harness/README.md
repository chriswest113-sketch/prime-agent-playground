# Trajectory-Driven Harness Refinement Study

This directory is an isolated, challengeable baseline study of Prime Agent at the repository state recorded in [provenance.md](provenance.md). It separates product documentation, source confirmation, observed runtime behavior, inference, and unknowns. It does not treat repository claims as ground truth.

Artifacts:

- [provenance.md](provenance.md): exact Git baseline and repository relationship.
- [implementation-map.md](implementation-map.md): ownership and data-flow map.
- [claim-evidence-ledger.md](claim-evidence-ledger.md): material claims, classifications, source anchors, negative evidence, and limitations.
- [runtime-reproduction.md](runtime-reproduction.md): exact commands, environment limitations, and observed results.
- [unresolved-questions.md](unresolved-questions.md): questions not settled by this pass.
- [experiment-plan.md](experiment-plan.md): smallest controlled comparisons proposed after baseline characterization.
- `runtime/*.log`: raw command output, including warnings and failures.

## Evidence labels

- **DOCUMENTED**: asserted by repository documentation; not independently established.
- **IMPLEMENTATION-CONFIRMED**: directly represented by inspected source paths and control/data flow.
- **RUNTIME-CONFIRMED**: observed by an executed test or reproduction in this environment.
- **INFERENCE**: a reasoned interpretation not directly guaranteed by source or runtime.
- **UNKNOWN**: evidence is unavailable or insufficient.

A claim may carry multiple labels. Runtime confirmation is bounded to the exact exercised path and is not evidence of end-to-end model quality.

## Baseline closure

The follow-up closure pass is recorded in [baseline-closure.md](baseline-closure.md), with exact commands in [exact-commands.md](exact-commands.md), a reproducible live-kernel probe in `live-kernel-probe.ts`, raw output in `runtime-closure/`, a SHA-256 manifest, and a reconstruction patch. No continual-harness A/B experiment has begun.
