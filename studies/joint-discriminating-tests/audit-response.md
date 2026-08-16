# Response to the independent Codex audit

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

This is a worse failure than the original claim described. Reconstruction under
a foreign writer does not fail loudly or leave a gap — it returns a plausible,
complete, wrong answer. That constraint now propagates into the next phase's
design guidance.

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
surfaced seven type errors across four probes (all now fixed), and by rebuilding
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
accurate for `91ce174`. After the changes above the suite is **93 assertions**:
`test-02` gained three (T02.C1–C3) and `test-05` gained one (T05.4d), while
T05.4b and T05.4c were rewritten rather than added.

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
