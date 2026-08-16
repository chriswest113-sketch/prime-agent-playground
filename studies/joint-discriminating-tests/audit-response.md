# Correction history

Two correction passes are recorded below, in order. Neither is rewritten by the
other. The point is to preserve the actual epistemic sequence — including that
the same failure mode (asserting in prose what the assertion does not test)
recurred after being flagged once.

- **Pass 1** — independent Codex audit of `91ce174` → commit `76f329e1`.
- **Pass 2** — self-audit of `76f329e1` → this commit.

---

# Pass 1 — response to the independent Codex audit

An independent Codex audit of commit `91ce174` reproduced the full six-probe
suite in a materially different environment (Node 20.20.2 / npm 11.4.2 /
Python 3.12.13 / kernel 6.18.35, versus Node 22.22.2 / npm 10.9.7 /
Python 3.11.15 / kernel 6.18.5 here) and reported **6 probes passed, 89
assertions passed, 0 failed**, with the expected environment-sensitive
divergence in ids, timestamps, temp paths and event segmentation, and the
input-token relationship reproducing exactly (`2479 → 676`, `2481 → 677`).

Its verdict was **MATERIAL ISSUES**, directed at claim scope and causal
interpretation rather than at the raw artifacts. That assessment is correct.
Every one of its six points is accepted. Two of them identified claims this
study had *asserted without testing*, and those were resolved with new tests
rather than softened wording.

The audit comment is preserved in full on PR #3.

---

## Adjudication

| # | Audit point | Verdict | Action |
| --- | --- | --- | --- |
| 1 | Q1 establishes transcript **transport**, not causal gate-triggered refinement | **Accepted** | Q1 reworded throughout; the audit's own sharper observation (transport is deterministic; only the refiner's *response* is not) adopted |
| 2 | Q2 does not establish that complete state is unreconstructible for a `/refine`-only history | **Accepted — and the underlying claim is false** | New probe section (Writer C, T02.C1–C3). The matrix row is corrected |
| 3 | Q3's retrieval surfaces are not six *independent* mechanisms | **Accepted** | Reworded to "six API surfaces over one store" everywhere |
| 4 | Q4 demonstrates stability of one probe-authored script, not general faux reproducibility | **Accepted** | Scoped to one fixed script; the load-bearing finding restated as pipeline preservation, not provider determinism; lexical-normalizer limitation recorded |
| 5 | Q5 tests one clamped no-op, not rejected configuration generally | **Accepted** | Service-tier phase rebuilt to separate accepted / clamped / no-op (T05.4b–T05.4d) |
| 6 | The external probe does not establish `refine({instructions})` is the only inbound channel | **Accepted** | Reworded to "the examined typed refinement input channel"; noted that Test 01 itself demonstrates another route |

Nothing in the audit was rejected.

---

## The two points that required new experiments

### Audit point 2 — complete-state reconstruction (the study was wrong)

The original matrix marked "COMPLETE effective harness state at message A / B"
as **PARTIAL** for `/refine`, reasoning that no full-state snapshot or hash is
persisted per turn. The audit correctly identified this as an argument, not a
result, and suggested that final state plus ordered edit records might permit
reverse reconstruction.

It does. `test-02` now builds a three-refinement history (create ×2 →
update + delete → create + update), records ground-truth harness state at each
checkpoint, and reconstructs earlier checkpoints purely by reverse-replaying the
ordered `appliedEdits` read from the session JSONL off the final state:

```
[PASS] T02.C1: a /refine-ONLY history reverse-replays to the EXACT harness state
       at an earlier checkpoint -- checkpointA exact=true checkpointB exact=true
       over 3 refinements
```

`appliedEdits` carries `before` **and** `after` for every touched entry, so the
ordered edit log is a complete differential record. The snapshot is unnecessary.
The matrix row is corrected from PARTIAL to **RECONSTRUCTIBLE**.

Testing it also produced a finding neither the study nor the audit had:

```
[PASS] T02.C2: one interleaved direct CRUD write breaks reverse reconstruction
[PASS] T02.C3: and it breaks it SILENTLY: the replay still yields a complete,
       well-formed - but wrong - state, with no marker in the records that a
       foreign write occurred
```

> **SUPERSEDED — historical Pass 1 output, preserved deliberately.** The
> `T02.C3` line above is the false claim Pass 2 retracted: the contamination
> *is* detectable from production records. That assertion's pass condition never
> tested the "no marker" clause. The current probe asserts detection instead.
> See Pass 2 §A. This block is kept so the mistake is part of the record.

The corruption half of this stands: reconstruction under a foreign writer
returns a plausible, complete, wrong answer rather than an error. That
constraint propagates into the next phase's design guidance — now paired with
the detector that makes it auditable.

### Audit point 5 — clamped vs rejected (the evidence was invalid)

The audit noted that only a `priority → default` no-op was exercised. Following
that up surfaced a worse problem the audit had not seen: the original probe
passed `"standard"` as a service tier, and `"standard"` is **not in the
`ServiceTier` union** (`"auto" | "default" | "flex" | "scale" | "priority" | null`).

TypeScript would have caught it. Nothing did, because `studies/` sits outside
the repository's `tsconfig` `include` and biome `files.includes` — so the
pre-commit `npm run check` passed over 913 files without ever looking at the
probes. The original Q5 service-tier evidence was therefore produced with an
invalid value and is withdrawn.

Fixed by adding `studies/joint-discriminating-tests/tsconfig.json`, which
surfaced **eight diagnostics** across four probes at `91ce174` — test-01 ×1,
test-02 ×1, test-04 ×5, test-05 ×1 (a later self-audit corrected this count
from the "seven" first reported) — all now fixed, and by rebuilding
the tier sequence with valid values to separate three genuinely distinct cases:

| Request | Effective | Event written | What is lost |
| --- | --- | --- | --- |
| `flex` | `flex` | `flex` | nothing |
| `priority` | `default` | `default` | the **requested value** |
| `priority` again | `default` (already current) | **none** | the entire request |

The claim "clamped or rejected requests leave no record at all" conflated two of
these and never touched rejection. It is replaced by the three-case statement
above.

---

## One correction to the audit's own framing

The audit's reproduction record says the suite ran **89 assertions**. That was
accurate for `91ce174`. After the Pass 1 changes the suite was **93
assertions**: `test-02` gained three (T02.C1–C3) and `test-05` gained one
(T05.4d), while T05.4b and T05.4c were rewritten rather than added. (Pass 2
takes it to 98 — see the end of this file.)

Also worth stating plainly, since the PR description for `91ce174` implied
otherwise: the claim that pre-commit checks validated this work was wrong. They
ran and passed, but they never examined `studies/`. They do now, via the added
tsconfig and an explicit typecheck step.

---

## Audit points adopted as findings rather than corrections

Three observations from section F of the audit are recorded in the study because
they sharpen it, not because anything was wrong:

1. **Q1 transport determinism** — folded into Test 01's result section and
   Statement 1 of the synthesis.
2. **Lexical vs schema-aware normalizers** — recorded in Test 04's normalization
   contract. The normalizers rewrite anything UUID-, epoch- or hex-id-shaped
   anywhere in the trace, including inside model text. Harmless for this fixture;
   a real hazard for a fixture whose content legitimately contains such values.
3. **Nominal/effective is too binary** — Test 05 now distinguishes change events
   (post-clamp effective application values) from assistant-response records
   (requested model identity, plus provider-reported response model when
   available).

---

## Readiness

The audit's verdict was **YES WITH LIMITATIONS**: sufficient to stop writing
credential-free faux probes and move to real-model experiment *design*, provided
the record is corrected first, and with the caveat that the synthesis statements
must not be used verbatim as premises.

The corrections it listed are complete. The caveat stands regardless: the next
phase should treat the revised statements as scoped findings about this
codebase, not as premises.


---

# Pass 2 — SELF-AUDIT / SECOND CORRECTION

**Audit target:** `76f329e1d11b6ceb7c5747f1ff8ac46f6cf994ca` (the Pass 1
correction). Read-only; no branch modified during the audit.

## What reproduced

| Check | Result |
| --- | --- |
| Study typecheck (`tsgo -p studies/joint-discriminating-tests/tsconfig.json`) | **PASS**, 0 errors; all 7 study `.ts` files confirmed in `--listFiles` |
| Probes | **6/6 PASS** |
| Assertions | **93/93 PASS**, 0 failed |
| `run-all.sh` ordering | typecheck precedes the probe loop; `set -o pipefail` present |
| Production source touched | **none** — the `91ce174 → 76f329e` delta is 46 files, all under `studies/` |
| Repository `npm run check` covers `studies/` | **No** — root tsconfig `--listFiles` returns 0 study files; `biome check studies/…` reports "Checked 0 files". The study's own explicit typecheck is the only coverage |

Same host as the target, so this is *not* cross-environment corroboration the
way the Codex audit was.

## What the self-audit nevertheless found

### A. The "no marker" claim was false

`76f329e1` asserted that an interleaved CRUD write yields a wrong reconstruction
"with no marker in the records that a foreign write occurred". A detector
written from scratch, using only the ordered refinement records plus the final
`harness_state.json`, produced **four signals on the contaminated history and
zero on the clean one**:

```
CHAIN-BREAK     memory:rc_x — recorded before !== prior recorded after
VERSION-GAP     memory:rc_x — before.version=3, prior after.version=2
SOURCE-MISMATCH memory:rc_x — before.source=agent (prior after.source=refine)
ORPHAN          memory:rc_hidden — in final state, absent from every refinement record
```

The defect is the same class the Codex audit flagged: `T02.C3`'s pass condition
only checked `!exact && non-empty`. It never tested the "no marker" clause its
own text asserted. `unresolved.md` U20 simultaneously admitted the question "was
not investigated" — so the artifact both asserted and disclaimed the same thing.

Retracted. The detector is now part of the durable probe (T02.C3, T02.C4), and
corruption / detection / attribution are kept as three separate claims (T02.C5).
The four signals are **not** generalized to every possible CRUD mutation.

### B. Writer purity is not sufficient — the replay ignored recorded scope

The Pass 1 replay helper collected every `prime-agent.refinement` session entry
and replayed them against one store. But `_applyRefine` appends that entry for
**global** refinements too, so one JSONL can carry records for two stores. On a
session interleaving scopes, with `/refine` as the **only** writer:

```
scopes recorded        : ["global","local","global","local"]   (2 distinct harnessStatePath values)
ground truth LOCAL ids : ["l_entry"]
naive replay           : ["g_entry","l_entry"]   exact = false
scope-aware replay     : ["l_entry"]             exact = true
```

The records already carried the identity needed to filter (`scope`,
`harnessStatePath`); the helper simply ignored it. Fixed, and the mixed-scope
case is now an explicit assertion (T02.C6–C8). The "writer purity is sufficient"
framing is withdrawn.

### C. Q4 causality language was still too strong

The Codex audit asked that the input-token diagnosis be phrased as *consistent
with and explained by* rather than experimentally proven. Pass 1 addressed the
fixture-scope half of that point but left "fully explained by" / "fully
attributable to" in place. The probe tests a **necessary** condition (equal
prompt lengths ⇒ equal input tokens) over 3 runs and 2 distinct lengths; no
intervention pinning path length was performed. Wording narrowed accordingly.

### D. The diagnostic count was wrong

Pass 1 reported "seven type errors". Reproducing `91ce174` in a detached
worktree with the new tsconfig yields **eight** diagnostics: test-01 ×1,
test-02 ×1, test-04 ×5, test-05 ×1. This count refers to the prior artifact, not
to current errors — the suite typechecks clean today. Corrected wherever stated.

## Verdict recorded at the time

Delta-audit verdict: **MATERIAL ISSUES** — the corrections reproduced and all six
Codex points were addressed, but a demonstrably false claim had been introduced
across five documents. Readiness: **YES WITH LIMITATIONS**, conditional on the
three fixes above, which this commit applies.

## Suite size after this correction

Pass 2's reproduction figures (93/93) describe the audited commit `76f329e1`.
Applying the corrections adds five assertions to `test-02` — T02.C4, C5, C6, C7,
C8, with C3 rewritten from the false claim to the detection result — bringing
the suite to **98 assertions across 6 probes**, all passing.

## The pattern worth keeping

Twice now, this study has stated in prose something its assertions did not test,
and been wrong both times — first about reconstruction being impossible, then
about contamination being undetectable. Both overstatements ran in the direction
of a cleaner story. That is the standing risk in this artifact, and the reason
assertion text and pass conditions should be read against each other rather than
trusted separately.
