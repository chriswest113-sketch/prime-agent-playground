# Test 04 — Normalized faux reproducibility

## Question

Is the faux-provider evaluation surface "nondeterministic", or is it
nondeterministic only at the event/identifier framing level while remaining
semantically reproducible after principled normalization?

## Hypothesis alternatives

| | Hypothesis |
| --- | --- |
| **H0** | Fully deterministic — repeated runs are byte-identical. |
| **H1** | Framing-level nondeterminism only — raw bytes, ids and chunk boundaries vary; semantic content does not. |
| **H2** | Semantic nondeterminism — the model/tool content or outcomes themselves vary between runs. |

## Design

Two layers, so provider nondeterminism is never confused with session-framing
nondeterminism:

- **Layer P** — provider only. A fixed `Context` is streamed **5 times** in one
  process. Isolates the faux provider's own chunking, ids and usage accounting.
- **Layer S** — the full `AgentSession` flow (tool call → tool result → text →
  `/refine` → second turn) run in **3 independent child processes**.

Nondeterminism claims are *measured over N repetitions*, not asserted from a
single pair. An earlier two-run version of this probe produced a spurious
failure when two runs happened to emit the same number of progress events; the
repetition design removes that coincidence sensitivity. (The runner also needed
`set -o pipefail` — without it, `npx tsx … | tee` reported `tee`'s status and
masked that failure.)

## Normalization contract

Applied — known volatile framing only:

| Normalizer | Removes |
| --- | --- |
| `iso-timestamp` | ISO-8601 timestamps |
| `epoch-ms` | epoch-millisecond integers |
| `refine-id` | `refine_<17 UTC digits>` |
| `faux-random-id` | `faux:<epoch>:<base36>` api/tool ids |
| `temp-session-dir` | `pi-suite-<epoch>-<base36>` temp paths |
| `study-agent-dir` | the probe's isolated agent dir name |
| `uuid` | session UUIDs |
| `short-entry-id` | 8-hex session entry `id`/`parentId`/`targetId` |
| *segmentation* | consecutive same-index `*_delta` events concatenated; consecutive `message_update` progress runs collapsed |

Deliberately **not** normalized: assistant text content, tool names and
arguments, tool result content, harness entry titles/content/paths/versions,
stop reasons, applied-edit outcomes, and usage numbers. Usage in particular is
compared as observed — it is never coerced to equality. Where usage *does* vary
(see below), the probe diagnoses the variance rather than normalizing it away.

**The normalizers are lexical, not schema-aware.** They rewrite anything
matching a UUID, epoch-millisecond, or hex-id shape anywhere in the serialized
trace, including inside model text or tool arguments. In this fixed script no
such value occurs in substantive content, so nothing meaningful is erased — but
the same normalizer set applied to a fixture whose content legitimately contains
a UUID or timestamp *would* erase it and could mask a real difference. An audit
raised this; it is a real limitation of the approach, not of this run.

The segmentation normalizer needs justification, since it is the only one that
touches event structure. `message_update` fires once per emitted chunk and
carries no content of its own in this trace; its *count* is a direct function of
`splitStringByTokenSize`'s `Math.random()` (`faux.ts:241-251`). Collapsing
consecutive runs of it is therefore the session-layer equivalent of
concatenating deltas, and discards no information.

## Source anchors

| Anchor | What it establishes |
| --- | --- |
| `packages/ai/src/providers/faux.ts:241-251` | `splitStringByTokenSize` uses `Math.random()` — chunk boundaries are random. |
| `packages/ai/src/providers/faux.ts:132-134` | `randomId()` uses `Date.now()` + `Math.random()` — api ids and default tool-call ids. |
| `packages/ai/src/providers/faux.ts:57-64` | `fauxToolCall` accepts an explicit `id`, so ids are controllable. |
| `packages/ai/src/providers/faux.ts:201-239` | `withUsageEstimate` derives usage from prompt/response length — deterministic for a fixed context. |
| `packages/ai/src/providers/faux.ts:253-263` | `cloneMessage` overwrites `model` with the requested id but preserves `responseModel`. |
| `packages/coding-agent/src/core/refinement/refinement.ts:874-877` | `refine_<UTC digits>` ids embed wall-clock time. |

## Exact command

```bash
npx tsx studies/joint-discriminating-tests/test-04-normalized-reproducibility/run.ts
```

## Raw output

```
[PASS] T04.P1: Layer P BYTE-LEVEL: raw provider traces are NOT identical across 5 runs -- distinct raw traces = 5/5
[PASS] T04.P2: Layer P EVENT-FRAME: delta segmentation is volatile (Math.random chunking) across 5 runs -- distinct segmentations = 5/5
[PASS] T04.P3: Layer P EVENT-FRAME: after concatenating deltas, every run's event frame is identical
[PASS] T04.P4: Layer P IDENTIFIER: auto-generated tool-call ids are distinct in every run -- distinct auto ids = 5/5
[PASS] T04.P5: Layer P IDENTIFIER: explicitly supplied tool-call ids are stable
[PASS] T04.P6: Layer P SEMANTIC: terminal assistant text is identical in every run
[PASS] T04.P7: Layer P SEMANTIC: tool-call semantics (name + arguments) are identical
[PASS] T04.P8: Layer P SEMANTIC: usage totals are identical for a fixed context
[PASS] T04.S1: Layer S BYTE-LEVEL: all 3 raw session traces differ -- distinct raw traces = 3/3
[PASS] T04.S1b: Layer S EVENT-FRAME (observation, not a pass condition): per-chunk progress event counts across runs -- message_update counts = [12,12,11]; distinct raw event-type sequences = 2/3
[PASS] T04.S2: Layer S EVENT-FRAME: after collapsing chunk-segmentation framing, every run's event TYPE sequence is identical
[PASS] T04.S4: Layer S EVENT-FRAME: after coalescing, every run's normalized event frame is identical
[PASS] T04.S5: Layer S SEMANTIC: terminal assistant content is identical
[PASS] T04.S6: Layer S SEMANTIC: tool-call semantics are identical
[PASS] T04.S7: Layer S SEMANTIC: tool results are identical
[PASS] T04.S8: Layer S SEMANTIC: harness semantic state is identical
[PASS] T04.S9: Layer S SEMANTIC: assertions/outcomes are identical
[PASS] T04.S10a: Layer S SEMANTIC: OUTPUT token accounting is identical across runs -- output tokens per run: [[7,9,3],[7,9,3],[7,9,3]]
[PASS] T04.S10b: Layer S (observation, not a pass condition): INPUT token accounting across runs -- input tokens per run: [[676,695,755],[676,695,755],[677,695,755]]; per-turn max delta: [1,0,0]; system prompt lengths: [[2479,2479],[2479,2479],[2481,2481]]
[PASS] T04.S10c: Layer S: any INPUT token variance is fully explained by volatile prompt-length framing, not by semantic drift -- inputTokensEqual=false promptLengthsEqual=false
[PASS] T04.S11: Layer S: whole-trace normalization is NOT claimed to produce equality -- normalizedWholeTraceEqual=false
```

## Classification

| Class | Verdict |
| --- | --- |
| **BYTE-LEVEL** | **NOT REPRODUCIBLE.** Every raw trace differs, at both layers (5/5 and 3/3 distinct). |
| **IDENTIFIER** | **NOT REPRODUCIBLE by default** — auto-generated tool-call ids (5/5 distinct), session UUIDs, faux api ids, `refine_<UTC>` ids. **REPRODUCIBLE when ids are supplied explicitly** (T04.P5). |
| **EVENT-FRAME** | **NOT REPRODUCIBLE at chunk-segmentation level** (5/5 distinct segmentations; progress-event counts `[12,12,11]`). **REPRODUCIBLE once chunk-segmentation framing is collapsed.** |
| **SEMANTIC SCRIPT** | **REPRODUCIBLE** for terminal assistant content, tool-call semantics, tool results, harness semantic state, **output**-token accounting, and outcomes. **Input**-token accounting is **ENVIRONMENT-DEPENDENT** — see below. |

### Input-token accounting: a diagnosed environment dependence

Layer P gives identical usage for a fixed context. Layer S does **not**: input
tokens differ by 1 between processes.

An earlier version of this probe asserted usage equality and happened to pass;
on a later run it failed. Rather than normalize usage to force a pass — which
the normalization contract forbids — the probe now measures the variance and
tests its cause. Three consecutive runs:

| Run set | System prompt lengths | Turn-1 input tokens |
| --- | --- | --- |
| A | 2479, 2479, 2481 | 676, 676, 677 |
| B | 2479, 2481, 2481 | 676, 677, 677 |
| C | 2483, 2479, 2479 | 677, 676, 676 |

Output tokens were `[7, 9, 3]` in every single run.

**Cause.** `withUsageEstimate` derives input tokens from the serialized prompt
via `estimateTokens = ceil(chars/4)` (`faux.ts:128-130`). The system prompt
embeds `messagesPath`, a temp session path whose random base-36 suffix varies in
*length* (`pi-suite-<epoch>-<base36>`). A 2–4 character difference in the path
crosses the 4-chars-per-token quantisation boundary and shifts input tokens
by 1.

**Discriminating assertion (T04.S10c).** The question is not "are input tokens
equal" but "is inequality explained by framing or by semantic drift". The probe
asserts that any two runs with *equal system-prompt lengths* report *equal input
tokens*. That held in every run — so prompt-length framing is the complete
explanation, and no semantic drift is present.

### Whole-trace normalization

**Whole-trace normalization does not produce equality**, and the probe does not
pretend otherwise (T04.S11). The residual difference is precisely the
chunk-segmentation framing, which the field-level normalizers do not touch.
Equality appears only when segmentation is coalesced as well.

## What this result DOES establish

- The prior "nondeterministic evaluation surface" claim needs narrowing: the
  nondeterminism is real but confined to byte, identifier and chunk-segmentation
  framing.
- For **one fixed faux-response script**, the pipeline around the provider —
  tool execution, tool-result capture, harness application, session persistence,
  output-token accounting, outcome recording — preserved the scripted semantics
  across every run measured, despite randomized framing. This is the load-bearing
  finding: model *content* equality is largely a restatement of fixture
  construction, since the responses are authored by the probe. What is not
  trivial is that nothing in the surrounding machinery perturbed them.
- Input-token accounting is **not** reproducible across processes, and the cause
  is identified: volatile temp-path length crossing the token quantisation
  boundary. It is framing, not drift.
- Identifier nondeterminism is a *default*, not a property: explicit ids are
  stable, so a harness that supplies them gets identifier reproducibility.

## What this result DOES NOT establish

- Anything about **real providers**. This is the faux provider only. Real
  provider nondeterminism (sampling, server-side cache, routing) is a separate
  and much larger question.
- That the semantic layer is reproducible for *all* flows. One deterministic
  script was measured, with 5 provider-layer and 3 session-layer repetitions.
  Flows involving timing races, concurrency, or wall-clock-dependent branching
  were not exercised.
- General faux-provider behavioural reproducibility. The provider returns
  authored fixtures; it makes no decisions that could vary.
- That the equality contract was pre-registered. It was not: this probe was
  revised twice after observing failures (segmentation coincidence, then
  input-token variance). Both revisions and their triggering failures are
  documented, but a reader should treat the final contract as
  post-hoc-refined rather than fixed in advance.
- That input-token accounting is reproducible. It demonstrably is not, across
  processes, in this environment. The claim established is narrower: the
  variance is fully attributable to prompt-length framing.
- That the framing diagnosis generalises to real providers, whose usage
  accounting is server-side and subject to cache state.
- That "semantically reproducible" implies "canonical". The faux provider is
  explicitly non-canonical at the event and identifier level; a consumer that
  keys on ids or chunk boundaries will see instability.
