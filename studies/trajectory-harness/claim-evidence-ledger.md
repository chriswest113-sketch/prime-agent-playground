# Claim/Evidence Ledger

Source anchors use repository-relative paths and baseline line numbers. “Negative evidence” records what the inspected path does not establish; it is not a repository-wide proof of absence.

| ID | Material claim | Classification | Evidence | Bounds / negative evidence |
|---|---|---|---|---|
| C01 | The RLM interface is persistent IPython plus typed host calls; Python does not own provider execution. | DOCUMENTED, IMPLEMENTATION-CONFIRMED | `docs/rlm-runtime.md`; `prime-agent-runtime/src/rlm/__init__.py:84-150`; `agent-session.ts:8764-8768` | End-to-end provider-backed RLM was not run. |
| C02 | One live kernel serializes ordinary cells and retains its namespace across tool calls. | DOCUMENTED, IMPLEMENTATION-CONFIRMED | `docs/rlm-runtime.md` Jupyter Transport; `core/kernel/index.ts` execute queue/state | Real-kernel round-trip tests were skipped because no eligible configured kernel Python was found. Not RUNTIME-CONFIRMED here. |
| C03 | Restart persistence is selective dill snapshot/restore, not arbitrary process preservation. | IMPLEMENTATION-CONFIRMED | `kernel/index.ts:1481-1569`; `kernel/state-snapshot.ts`; `test/kernel-state-roundtrip.test.ts` | Runtime suite skipped; sockets, generators, live handles, and other unpicklable values are not promised. |
| C04 | `/refine` can create/update/delete four supplemental kinds but cannot rewrite the base system prompt through its schema. | DOCUMENTED, IMPLEMENTATION-CONFIRMED, RUNTIME-CONFIRMED | `refinement.ts:30-32,123-173,633-804`; refinement test log (59 passed) | Source edits/extensions can still alter system prompt construction. “Immutable” is subsystem-relative. |
| C05 | Local refinement is default; global refinement is explicit and cross-session. | DOCUMENTED, IMPLEMENTATION-CONFIRMED, RUNTIME-CONFIRMED | `refinement.ts:140-148,269-342`; refinement test log | No multi-session live daemon reproduction. Global effect follows prompt loading and storage paths. |
| C06 | Refinement application is immediate after proposal; it is not candidate/review/promotion. | IMPLEMENTATION-CONFIRMED | `refinement.ts:857-930,1000-1017` | A model review gates auto-refine scheduling, but there is no independent post-proposal reviewer/promotion state in this path. Searches for `candidate`, `promotion`, and refinement approval yielded no such lifecycle in refinement code. |
| C07 | Refinements carry free-text rationale/evidence, expected outcome, edits, and snapshots. | IMPLEMENTATION-CONFIRMED, RUNTIME-CONFIRMED | `refinement.ts:50-101,787-799`; refinement test log | No mandatory trajectory entry IDs, reproducer, metric delta, uncertainty, or external evidence schema. Evidence can be plausible prose only. |
| C08 | Rollback applies inverse entry edits from snapshots and records a new refinement. | IMPLEMENTATION-CONFIRMED, RUNTIME-CONFIRMED | `refinement.ts:804-888`; rollback cases in `test/refinement.test.ts` | Not transactional rollback of code, kernel, session tree, or external effects. Concurrent changes may make inverse edits fail. |
| C09 | Harness “skill” refinement stores a Python callable reference and arguments but does not create executable code. | IMPLEMENTATION-CONFIRMED, RUNTIME-CONFIRMED | `refinement.ts:134-138,664-705`; skill validation tests | A pre-existing installed Python callable is required. No executable skill synthesis is performed by `applyRefinementProposal`. |
| C10 | Subagent refinement stores a reusable textual spec, distinct from spawning a child. | IMPLEMENTATION-CONFIRMED | Generic `HarnessEntry`; `refinement.ts:134-148`; `agent-session.ts:10035+` | No binding automatically instantiates a child from a subagent entry. Model compliance is uncertain. |
| C11 | Python harness CRUD can bypass `/refine`'s model planning and evidence convention. | IMPLEMENTATION-CONFIRMED | `prime-agent-runtime/src/rlm/harness.py` CRUD and `record_refinement` | Direct writes still use typed store validation, but evidence is optional text and mutation does not require a recorded event. |
| C12 | Sessions are append-only JSONL trees and branching preserves alternate descendants. | DOCUMENTED, IMPLEMENTATION-CONFIRMED, RUNTIME-CONFIRMED | `session-manager.ts:75-99,248-263,1930-2134`; tree test log (31 passed) | Tests cover manager behavior, not concurrent daemon writers or crash recovery. |
| C13 | Compaction is lossy context transformation while full entries remain in session storage. | DOCUMENTED, IMPLEMENTATION-CONFIRMED | `docs/compaction.md`; `session-manager.ts:465-590,1542-1565` | No semantic fidelity metric; this pass did not run the compaction suite. |
| C14 | Compaction does not itself clear an extant kernel or child registry. | DOCUMENTED, IMPLEMENTATION-CONFIRMED | separate transcript compaction and kernel/child ownership in `agent-session.ts` | Cross-restart restoration remains selective and was not runtime-confirmed. |
| C15 | RLM child admission returns a handle before completion; results require explicit messaging/files. | DOCUMENTED, IMPLEMENTATION-CONFIRMED | `rlm/__init__.py:28-32,143-150`; `agent-session.ts:10035+` | No live model child was spawned in this pass. |
| C16 | Child lifecycle includes list, retained addressability, cancellation/deletion, and durable registry/ledger data. | DOCUMENTED, IMPLEMENTATION-CONFIRMED | `agent-session.ts:9164-9481`; `modes/daemon/rlm-ledger.ts` | “Survives restart” was not end-to-end runtime reproduced. Deletion does not prove disk erasure. |
| C17 | Detached work is designed to continue in resident workers. | DOCUMENTED, IMPLEMENTATION-CONFIRMED | `docs/long-running-agents.md`; daemon supervisor/mode sources | UNKNOWN at runtime in this environment because detach/reattach was not exercised. |
| C18 | Model/provider dispatch is extensible and normalized around streaming events. | IMPLEMENTATION-CONFIRMED | `packages/ai/src/types.ts:6-164`; `api-registry.ts:23-97`; built-in registration | Cross-provider behavioral equivalence is not guaranteed and was not tested. |
| C19 | Autonomous completion is constrained by budgets and optional shell gates; gate success is scoped evidence. | DOCUMENTED, IMPLEMENTATION-CONFIRMED | `core/autonomous.ts:254-347`; docs | The selected runtime suite had 2 failures in process-tree termination, so lifecycle reliability is not runtime-confirmed. |
| C20 | In this container, autonomous timeout/abort tests left probed descendant processes observable beyond their wait bound. | RUNTIME-CONFIRMED | `runtime/test-suite-agent-session-autonomous.test.ts.txt` | This may be environment-sensitive; no root-cause claim is made. 20 other tests passed. |
| C21 | Kernel and daemon process boundaries are not security sandboxes. | DOCUMENTED, IMPLEMENTATION-CONFIRMED | `docs/rlm.md` Trust Model; `docs/rlm-runtime.md` Trust Boundary; process launch sources | No OS sandbox escape test was attempted because the implementation explicitly runs with user permissions. |
| C22 | Durable global harness content is a cross-session prompt/trust surface. | IMPLEMENTATION-CONFIRMED, INFERENCE | global store merge plus `system-prompt.ts:106,141` | Security impact depends on who can write the agent directory and on model behavior; no exploit test performed. |
| C23 | The repository does not yet establish that refinement causes durable generalizable improvement. | INFERENCE | State mutation/rollback tests establish mechanics only; no paired task evaluation or held-out generalization evidence found in inspected refinement tests | Absence from selected search/inspection is not proof no external evaluation exists. Repository-local evidence is insufficient. |

## Baseline-closure additions

| ID | Material claim | Classification | Evidence | Bounds / negative evidence |
|---|---|---|---|---|
| C24 | Separate executions retain Python variables in one real live kernel. | RUNTIME-CONFIRMED | `live-kernel-probe.ts`; `runtime-closure/live-kernel-probe.txt` | Same kernel process only; not restart persistence. |
| C25 | Disk-backed local/global Python harness state can be written from a real kernel and read from a fresh kernel process. | RUNTIME-CONFIRMED | live-kernel probe and output | Direct harness CRUD, not `/refine`; source runtime injected with `PYTHONPATH` because supported full provisioning was blocked. |
| C26 | Dill snapshot/restore and unpicklable-state handling remain unconfirmed at runtime. | UNKNOWN at runtime, IMPLEMENTATION-CONFIRMED | skipped round-trip output; snapshot implementation | The supported bootstrap failed on a network download and system Python lacks `dill`. |
| C27 | The production AgentSession refinement application path persists a faux-planned memory, rebuilds its prompt, and emits completion. | RUNTIME-CONFIRMED | serialized-refine suite, 71 passed | Planner output is mocked; not a real model-driven proposal. Other kinds are confirmed at lower host-test level. |
| C28 | The two autonomous cleanup failures consistently observe killed but unreaped Node zombies rather than executing descendants after the wait. | RUNTIME-CONFIRMED | four diagnostic logs with `/proc/<pid>/stat` | Container PID 1 behavior is environment-sensitive; no general host claim. |
| C29 | Credential-free real-process daemon `/refine` did not complete in this pass. | UNKNOWN | daemon serialized-refine process log | Child stderr was captured but absent from assertion output; cause not inferred. |

## Experiment 1 additions

| ID | Material claim | Classification | Evidence | Bounds / negative evidence |
|---|---|---|---|---|
| C30 | Disabled, local, and explicitly global faux-refinement conditions remained isolated across distinct agent homes in the mechanics fixture. | RUNTIME-CONFIRMED | `experiment-1/run.ts`; `experiment-1/artifacts/`; `experiment-1/run-output.txt` | One deterministic fixture; not provider/model generalization. |
| C31 | Applied local/global prompt state was included by the next system-prompt rebuild and rollback restored empty selected-scope entries. | RUNTIME-CONFIRMED | Experiment 1 assertions, transcripts, and final harness files | Prompt visibility was checked before rollback; behavioral compliance was not evaluated. |
| C32 | Repeated executions produced identical semantic transcript/harness hashes after declared volatile fields were removed. | RUNTIME-CONFIRMED | Runner's primary/replication hash assertion | Raw files differ in timestamps, generated IDs, paths, and session headers by design. |
| C33 | Experiment 1 provides no evidence that trajectory-driven refinement improves task performance. | RUNTIME-CONFIRMED negative boundary | No quality task or held-out outcome was run | Experiment 2 has not begun. |

## Experiments 2–5 additions

| ID | Material claim | Classification | Evidence | Bounds / negative evidence |
|---|---|---|---|---|
| C34 | The scaffold can represent and score paired disabled/enabled conditions over held-out and sentinel fixtures. | RUNTIME-CONFIRMED | `experiments-2-5/artifacts/experiment-2.json` | Deterministic marker-aware actor; effect size is constructed, not a real-model estimate. |
| C35 | An external trajectory-evidence requirement rejected the fixture's unsupported edits and prevented its sentinel regression. | RUNTIME-CONFIRMED | `experiment-3.json` | Evidence enforcement is study-owned and ground truth is known; production `/refine` does not require it. |
| C36 | Candidate/review/promotion metrics distinguish immediate self-promotion from deterministic independent review. | RUNTIME-CONFIRMED | `experiment-4.json` | Does not establish real independent-model reviewer accuracy. |
| C37 | Production inverse-edit rollback restored the exact semantic entry hash and synthetic outcomes after a harmful prompt; reload retained recovery. | RUNTIME-CONFIRMED | `experiment-5.json` | Downstream causal contamination is not generally reversed; only a benign derived memory was tested. |
| C38 | Prime Agent is suitable as an experimental refinement scaffold but is not validated as a self-improving system. | INFERENCE supported by runtime mechanics | Experiments 1–5 and baseline ledger | Real models, non-synthetic tasks, independent evaluation, and uncertainty across models/runs remain absent. |

## Experiment 6 adversarial additions

| ID | Material claim | Classification | Evidence | Bounds / negative evidence |
|---|---|---|---|---|
| C39 | Metadata-only evidence requirements accept forged trajectory/validation claims. | RUNTIME-CONFIRMED | `experiment-6-adversarial/artifacts/finding-01-forged-evidence.json` | Study gate only; production does not currently enforce even this gate. |
| C40 | The Experiment 2 actor overfits exact intervention markers and fails a semantic paraphrase. | RUNTIME-CONFIRMED | `finding-02-marker-overfit.json` | Deterministic actor limitation; not evidence about a real model's paraphrase ability. |
| C41 | Experiment 4's perfect reviewer precision fails under a minimal label distribution shift. | RUNTIME-CONFIRMED | `finding-03-reviewer-shift.json` | Deterministic label reviewer; demonstrates evaluation leakage, not real-reviewer accuracy. |
| C42 | Rolling back a harmful parent leaves a harmful derived prompt active and does not restore behavior or entry hash. | RUNTIME-CONFIRMED | `finding-04-derived-contamination.json` | One explicit dependency fixture; establishes lack of automatic causal rollback. |
| C43 | Default harness overview limits can omit a stored seventh prompt entry. | RUNTIME-CONFIRMED | `finding-05-overview-truncation.json` | Visibility depends on kind, insertion/order behavior, configured limits, and prompt formatter. |
| C44 | The repository is useful as a mechanics scaffold but the current study/evidence layer is not yet a sound evaluation or promotion scaffold. | INFERENCE supported by falsification | Experiments 1–6 | Real-model experiments could change the assessment, but require stronger controls first. |
