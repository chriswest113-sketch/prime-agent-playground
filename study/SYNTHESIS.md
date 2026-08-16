# Prime Agent — Reference Study Synthesis

**Subject:** `prime-agent` v0.7.2 @ `97b994c3d7c45ca1ae635190e91e9e58ddf2577c`
**Character:** independent, implementation-grounded. No prior analysis was taken as given.
**Evidence:** `01-evidence/` (FINDINGS, CLAIMS, SUBSYSTEMS, TEST_BASELINE), `02-experiments/`.

A note on standing: this is a study of one system at one commit, conducted over one session, in one
environment (Linux, root, no provider credentials). It establishes what the code does. It establishes
nothing about how well Prime Agent performs at real tasks, because the repository contains no way to
measure that and this study did not build one.

---

## 1. What Prime Agent actually implements

A coding/research agent whose **primary tool is a persistent IPython kernel** rather than a set of
discrete tools. File edits, shell, search, subagent spawning, and harness mutation are all Python calls
in one long-lived namespace, so tool results bind to names and survive across turns.

Around that sit five substantial subsystems: a daemon/supervisor/worker/kernel process topology with an
append-only spawn ledger; session persistence as an append-only JSONL tree with compaction; a durable,
scoped, versioned "continual harness" store mutated by `/refine`; a skills layer of importable Python
packages; and bounded autonomous operation with shell-command quality gates.

~190k lines of non-test TypeScript plus a 1.5k-line Python kernel runtime, with 4,214 tests of which
4,147 pass in this environment (the 8 failures are environmental — three assume a non-root user, the
rest need credentials).

## 2. What architectural problems it solves

Read from the code rather than the marketing, Prime Agent is organised around **continuity**:

1. **Context exhaustion** — compaction, plus a kernel namespace where intermediate state lives outside
   the token history.
2. **Session mortality** — daemon-backed sessions survive terminal disconnect; state, schedules and
   subagents persist and can be reattached.
3. **Harness state as data rather than code** — supplemental prompts, memories, skill descriptions and
   subagent specs are typed, versioned, scoped, atomically-written records instead of strings baked into
   a binary. This is the genuinely valuable contribution and it is well executed.
4. **Subagent identity under concurrency** — the spawn ledger enforces family invariants across
   multi-writer appends.
5. **Delegating scoring to the environment** — the agent exposes structured state for an external
   evaluator (`verifiers` / `prime-rl`) rather than judging itself.

That last one is the key to reading everything else correctly.

## 3. Which claimed behaviors survive scrutiny

Full ledger in `01-evidence/CLAIMS.md`. The pattern is clean:

**Mechanism claims hold up.** The kernel model, base-prompt immutability (enforced in code at
`refinement.ts:671-673`, verified by execution), durable scoped harness state, per-edit rollback,
bounded autonomous budgets — all real and mostly tested.

**Two mechanism claims are narrower than their wording.**
- *"Treats context as variables (prompt-as-a-variable)"* is implemented as a **file path in the system
  prompt** (`Conversation log: ${messagesPath}`, `prompts/rlm.ts:76`). No binding of the conversation to
  a Python value exists. The model can slice its own transcript programmatically — real and useful —
  but addressability is by path, not by value.
- *"`rlm(...)` returns their results programmatically"* is contradicted by the system prompt itself:
  admission "**never waits for or returns the child's answer**" (`prompts/rlm.ts:129`).

**Outcome claims are where the wording outruns the code.** "The harness can improve" and
"evidence-backed updates" describe *prompt instructions given to the refiner*, not verification the
system performs. The persisted `evidence` field is the same model's own rationale
(`refinement.ts:787`).

**The README's own caveats are its most accurate sentences** — "reaching a limit does not imply task
success" and "not a security sandbox" are both exactly right.

## 4. The central finding: two loops that never touch

Prime Agent contains both halves of an empirical loop and no connection between them.

```
Loop A — autonomous quality gates          Loop B — /refine continual harness
  shell command, exit 0 = pass               serialize trajectory
  git worktree snapshot blocks re-runs       one LLM call → JSON edits
  on an unchanged workspace                  shape validation
  retries bounded at 3                       apply to store, append event
  DEFAULT: commands = []                     DEFAULT: on, every 25 turns
       ↓                                          ↓
  measures                                   writes
       └────────── no code path ───────────────┘
```

Verified by exhaustive cross-grep: `autonomous.ts` contains zero references to refinement;
`refinement.ts` contains zero references to gates, exit codes, or process execution.

A gate failure cannot cause a refinement. A refinement is never validated by a gate. The
observe→hypothesize→test→measure→update-belief cycle is broken precisely between *measure* and
*update belief*: belief updates happen, but conditioned on an LLM's reading of a transcript rather than
on an outcome.

**And the defaults invert the emphasis.** The loop that measures is **off** by default
(`commands: []`, `autonomous.ts:58`). The loop that writes without measuring is **on** by default,
firing every 25 assistant turns with a 20-minute cooldown (`settings-manager.ts:883-897`).

### Measurement by instruction

Where a closing mechanism is absent, the system substitutes a natural-language instruction:

> "validate on the next action, then record the outcome" — `prompts/rlm.ts:158`, `harness.py:716`

There is no field to record an outcome into and no code that checks compliance. `expectedOutcome` is
written and re-read as prose into the refiner's next prompt (`refinement.ts:559`), never parsed,
executed, or compared (EXP-PA-001/H3, H3b). `plan_refinement` returns three static strings — a
template, not a planner.

## 5. Assumptions the design contains

1. **The evaluator is external.** Best-evidenced by hardcoded gate exclusions for `.vf-prime-agent`,
   `verification`, `submission.tar.gz`, `runner_args.log` (`autonomous.ts:385-392`) and an ACP `_meta`
   channel documented as read by "a prime-agent-aware client (**or the verifiers harness**)"
   (`acp-meta.ts:1-9`). Scoring is the environment's job. Under this reading the missing measurement is
   a **boundary choice, not an oversight** — and the fairest way to state the finding.
2. **The model is a trustworthy author of its own state.** Refinement edits are validated for *shape*
   only (`validateEdit`, `refinement.ts:664-705`). Nothing checks that a memory is true or a skill works.
3. **Harness state stays small.** Contradicted: nothing bounds growth (EXP-PA-001/H4), and the prompt
   view degrades to a lexically-arbitrary 6-entry sample (EXP-PA-002).
4. **Session-local default limits blast radius.** True and a real safety property — and it also means
   most of what is learned is discarded with the session.
5. **A run is a stable configuration.** Contradicted throughout: no seed, `temperature` never set, no
   model version stamp, fuzzy model matching, thinking levels that silently clamp, a skill roster that
   varies with ambient auth state, and registries that change with wall-clock time.

## 6. Where the wording is worse than the engineering — and vice versa

Worth separating, because both directions occur.

**The engineering is better than a skim suggests:** optimistic concurrency on harness edits with a
"changed during planning" refusal; a gate that refuses to re-run against an unchanged worktree; an
append-only spawn ledger with append-time invariants, torn-line tolerance and forward compatibility;
compaction that appends rather than deletes, leaving the dropped span exactly reconstructible; atomic
temp+rename state writes; `loadHarnessState` degrading to empty rather than throwing on corruption.

**The wording is better than the engineering here:** "self-improving," "evidence-backed," and
"validate then record the outcome" all describe intentions carried by prompts. The word doing the most
unearned work is **evidence** — in the persisted record it means *the same model's own rationale*.

## 7. What remains unresolved

1. **Does `/refine` improve task outcomes at all?** Unanswerable from this repository. No benchmark, no
   scoring harness, no before/after comparison exists anywhere in the tree.
2. **How often does the visibility pathology bite in practice?** Depends on real title distributions.
3. **What is auto-refine's precision?** The review gate (`refinement.ts:949-998`) is itself an LLM call.
   Its false-positive and false-negative rates are unmeasured.
4. **Do models actually use the unjournaled Python CRUD path?** If yes, provenance is worse than stated.
5. **Upstream correspondence** — **UNKNOWN**. No upstream remote; the clone is shallow (50 commits).
   No claim about Prime Agent's history or evolution is made anywhere in this study.
6. **Everything about real-task performance.** Not measured here, and not measurable with what ships.

## 8. What deserves controlled experimentation

Ranked by information gain per unit cost.

1. **Close the loop as an intervention.** Wire gate outcomes into refinement — the link that does not
   exist — and compare outcome-conditioned refinement against transcript-conditioned refinement. This is
   the highest-value experiment available, and Prime Agent sets it up cleanly *by not doing it*. The fork
   is already writable and the two subsystems are cleanly separated.
2. **Attribution reconstruction.** Try to reconstruct harness state at turn *t* from `refinements.jsonl`
   alone, then again after injecting Python-CRUD writes. Measures exactly how much provenance survives.
3. **Harness visibility under growth** (extends EXP-PA-002). Deterministic, no LLM, no network. Vary the
   selection rule — recency, usage-weighted, relevance — and measure recall of recent lessons.
4. **Refinement determinism.** Same trajectory, same harness, N runs of `planRefinement`. How stable are
   the proposed edits? Bears on whether "the harness improves" is even a repeatable operation. Note this
   requires a real provider: the faux path cannot vary.
5. **Auto-refine gate precision.** Does the review gate fire on trajectories where refinement
   demonstrably helps?

## 9. Relation to the broader problem

The research question concerns configuring, evaluating, comparing and improving AI systems over time
while preserving reliable evidence. Against the provisional decomposition
`Y_t = F(G, M_t, S_t, H_t, C_t, T_t, W_t, E_t, L_t)`, here is what Prime Agent actually preserves at the
moment a turn is produced:

| variable | preserved? | evidence |
|---|---|---|
| `C_t` context/transcript | **yes, well** | append-only JSONL tree; compaction appends, never deletes; dropped span reconstructible |
| `E_t` environment | **partly** | `git` context pinned in the session header |
| `W_t` topology | **partly** | spawn ledger records subagent family structure |
| `M_t` model | **name only** | no version, no snapshot date, no catalog hash; untimestamped generated catalog |
| `H_t` harness | **no** | mutated in place; never recorded alongside the turn; second unjournaled writer |
| `T_t` tools/skills | **no** | no skill versioning, no usage telemetry; roster varies with auth state |
| sampling | **no** | no seed; `temperature` plumbed but never set — provider defaults apply |
| `Y_t` outcome | **no** | no success measure exists |

**The transcript is excellent; the configuration that produced it is largely unrecorded.** This is the
single most transferable observation from the study, and it is not a Prime Agent quirk — it is what
happens whenever a system is built to *run well* rather than to *be compared*. Preserving what was said
is easy and everyone does it. Preserving what was configured is the part that gets skipped, and it is the
part that makes two runs comparable.

Three consequences follow directly.

**Mutable harness state and a frozen experiment are in tension.** If a harness is a reusable
configuration and an experiment is a frozen application of that harness to a task, then Prime Agent's
default behavior — auto-refine every 25 turns, writing to the store that renders into the system prompt —
means the harness **mutates during the run**. A session is not one experiment; it is an unlabelled
sequence of them. Anyone measuring a Prime-Agent-like system must either pin the harness for the duration
or record every mutation with its turn index. Neither happens by default.

**A memory is not a check.** Prime Agent converts observed failures into *prose memories*. A memory only
works if it is read — and EXP-PA-002 shows that at 500 entries the model sees six of them, chosen
alphabetically, with 0% recall of the ten most recent. A check defends itself; a memory depends on being
retrieved. Prime Agent's one self-defending mechanism is the gate, and it ships empty. **The retrieval
rule, not the storage format, is what determines whether accumulated knowledge is real.** That is the
finding most worth carrying to any system that accumulates lessons into a bounded context window.

**Determinism is shallower than it looks.** Even the scripted test provider is nondeterministic in its
framing: unseeded chunk boundaries, wall-clock timestamps, random ids. No run of the suite produces a
stable identifier set, so two runs cannot be diffed field-for-field. If a system's *deliberately fake*
model layer is not reproducible, its real one certainly is not — and reproducibility has to be designed
in at the identifier level, not assumed from the absence of a network call.

### Where the evidence pushes back

Two places where this study's findings complicate a tidy framing rather than confirming it.

**"Prefer deterministic enforcement over probabilistic judgment" has a visible cost here.** Prime Agent's
one deterministic gate — shell exit code — is genuinely well built, and it ships disabled. Plausibly
because a general-purpose agent cannot know what command would constitute success for an arbitrary task.
The deterministic check is not merely better-or-worse than the probabilistic one; it is **less general**,
and that generality gap is why the probabilistic path is the one that runs by default. A methodology
preferring mechanical checks should expect to pay in coverage, and should say where that trade lands.

**This study committed the error it went looking for.** I reported that `npm run build` succeeded by
reading an exit status that belonged to `tail`, not to `npm` — a positive result indistinguishable from
its own side effect. The build had in fact failed *and* silently rewritten a tracked source file,
invalidating a measurement I had already recorded. It is written up in `02-experiments/INCIDENTS.md`
rather than quietly fixed, because the correction is the more useful artifact: the failure mode is not
exotic, it survived an explicit intent to be rigorous, and it was caught only by checking `git status`
for an unrelated reason. Any protocol relying on an agent to self-report its own verification has this
hole in it.

---

## What I would tell someone deciding whether to build on this

Prime Agent demonstrates, concretely and in working code, that **harness state can be a first-class,
inspectable, versioned, scoped, rollback-capable artifact** rather than a string in a prompt. That is
worth studying closely and it is the part that is genuinely hard to get right.

It also demonstrates, by omission, that this is the *easier* half. Making harness state mutable is a
data-modelling problem. Making mutations attributable to outcomes is an experimental-design problem, and
nothing in the system addresses it: no outcome is recorded, no configuration is stamped onto a turn, no
run can be replayed, and the accumulated state becomes progressively invisible to the agent that wrote it.

A system with durable versioned state, snapshots, rollback, scoped blast radius and a measurement
mechanism — but no link from measurement to state change, and no record of which state produced which
outcome — can accumulate changes indefinitely while remaining unable to demonstrate that any of them
helped. That is the difference between *changing* a system over time and *empirically improving* it, and
it is the most useful thing Prime Agent has to teach.
