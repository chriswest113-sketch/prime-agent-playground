# Convergence context — why each test exists

Two independent investigations (one Claude, one Codex) studied Prime Agent from
the same baseline, then cross-reviewed each other. Most of their findings
converged. This phase exists only to resolve the handful that did not, using the
smallest runtime tests capable of discriminating between the competing readings.

Neither prior study is reproduced here. What follows is only the *disagreement*
each test was built to settle, stated in one paragraph, so a reader can judge
whether the test is actually discriminating.

---

## Test 01 — Gate → refinement transcript coupling

**The disagreement.** One synthesis asserted that autonomous quality gates and
`/refine` "never touch" — that a gate failure cannot cause a refinement. The
cross-review objected that an indirect path plausibly exists: a gate fails → the
gate-failure continuation is injected into the conversation → `/refine`
serializes the conversation into `<conversation>` → the refiner can therefore
observe the gate failure. Both sides were reasoning from source. Neither had run
the path end to end.

**Why a test is needed.** "Never touch" and "coupled through shared transcript
state" have the same source-level footprint if you only look at imports. They
differ observably in exactly one place: whether the gate's output text is
physically present in the bytes sent to the refiner. That is a one-sentinel
experiment. It also lets three follow-on questions be answered separately —
whether any *typed* linkage exists, whether the gate is *re-validated* after
refinement, and whether the influence is anything more than probabilistic.

---

## Test 02 — Turn-level harness attribution

**The disagreement.** The studies disagreed on how much of the harness mutation
timeline is reconstructible after the fact — one reading it as "provenance
exists", the other as "provenance is absent". The cross-review noted this was
being treated as binary when the two writers into harness state are quite
different: `/refine` (TypeScript, goes through the session) and direct
`rlm.harness` CRUD (Python, goes straight to the state file).

**Why a test is needed.** A single yes/no verdict is wrong under either reading.
The honest output is a matrix: eight separate reconstruction dimensions, scored
per writer, from a real persisted session. Building the minimal session
(message A → one distinctive edit → message B) twice, once per writer, makes the
difference between them measurable rather than argued.

---

## Test 03 — Routing visibility vs programmatic retrieval

**The disagreement.** Both studies established that the default system-prompt
harness summary is bounded, sorts lexically, and shows only a few entries per
kind, so accumulation can push entries out of it. One study described the
displaced state as becoming "invisible". The cross-review argued that word is
too strong, because full harness state remains programmatically accessible.

**Why a test is needed.** "Invisible" collapses five distinct claims that have
different truth values: whether the fact is *stored*, whether it is *in the
default summary*, whether it is *retrievable*, whether an agent *spontaneously
retrieves* it, and whether it is *successfully used*. Only the first three are
testable without a real model. The test scores those three and refuses the other
two rather than manufacturing them.

---

## Test 04 — Normalized faux reproducibility

**The disagreement.** Prior work characterised the faux evaluation surface as
"nondeterministic". The cross-review suspected the observed nondeterminism was
confined to volatile framing — timestamps, generated ids, chunk boundaries — and
that the semantic content of a run is in fact stable.

**Why a test is needed.** "Nondeterministic" is only useful as a claim if it is
scoped to a level. The test therefore runs the same flow twice at two layers
(provider-only, and full session in separate processes), compares raw bytes
first, then applies a normalization that touches *only* known volatile framing,
and scores four reproducibility classes separately. The normalization is
constrained in advance: no substantive model/tool content and no outcome field
may be normalized to force equality.

---

## Test 05 — Effective model / configuration record

**The disagreement.** The studies split between "configuration is recorded" and
"configuration is absent" — a framing the cross-review rejected as the wrong
question. What matters for any future controlled experiment is the *boundary*:
which parts of a run's configuration can be recovered from the persisted record,
and which cannot.

**Why a test is needed.** The boundary can only be drawn by exercising real
configuration transitions, persisting, reloading from disk, and inventorying
what survived — field by field, including explicit absence checks for the
fields a controlled-equivalence argument would require (seed, temperature, model
snapshot, prompt bytes, harness hash).

---

## External evaluator question (secondary, deliberately bounded)

**The open issue.** The cross-review asked whether the external Verifiers /
prime-rl integration closes any part of a score → refinement loop.

**Why it is bounded here.** The brief says to record only what is present in
this repository or trivially inspectable locally, and otherwise mark it
deferred. So the probe does exactly two mechanical things — classify every
in-repo reference, and characterise the one inbound channel that could carry an
evaluator signal — and defers everything requiring external repository research.
