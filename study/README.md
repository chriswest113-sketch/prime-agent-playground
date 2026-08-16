# Prime Agent Reference Study

An independent, implementation-grounded investigation of Prime Agent, conducted as a
reference study for the AI Optimization Lab research programme.

This directory contains study artifacts only. It does not modify Prime Agent.

## Contents

- `SYNTHESIS.md` — **start here.** What Prime Agent implements, which claims survive scrutiny,
  what remains unresolved, and how it relates to the broader problem of improving AI systems
  over time with preserved evidence.
- `00-baseline/` — provenance record and the exact baseline commit. Read this first;
  it records what is known and what is explicitly UNKNOWN about this clone.
- `01-evidence/FINDINGS.md` — the main evidence document. Every assertion carries a
  `file:line` citation or an experiment id.
- `01-evidence/CLAIMS.md` — every README claim verified, separating mechanism claims from
  outcome claims.
- `01-evidence/SUBSYSTEMS.md` — evidence for the evaluation surface, model/provider identity,
  sessions and compaction, process topology, and skills.
- `01-evidence/TEST_BASELINE.md` — executed test results and why two earlier runs were discarded.
- `02-experiments/` — runnable experiments against the real modules, with raw output.
  - `exp-pa-001-refinement-loop/` — does the continual-harness loop close?
  - `exp-pa-002-harness-visibility/` — how much accumulated harness state stays visible?
  - `INCIDENTS.md` — deviations and invalidated measurements, including one case where
    the project's own build command silently rewrote tracked source.

## Reproducing

From the repository root, with `npm install` completed:

    npx tsx study/02-experiments/exp-pa-001-refinement-loop/run.ts
    npx tsx study/02-experiments/exp-pa-002-harness-visibility/run.ts

Both are deterministic and require no network, no API key, and no model call.

## Method

Claims are separated into what the code *does* versus what documentation, identifiers, and
comments *say* it does. Behaviors are labelled IMPLEMENTED_AND_TESTED / IMPLEMENTED_UNTESTED /
PARTIAL / DOCUMENTED_ONLY / NOT_FOUND, and a test counts as evidence only if it asserts the
behavior rather than merely constructing the object. Where source alone could not settle a
question, the real module was executed against a temporary store and observed.
