# Implementation Map

## Execution and ownership

1. `AgentSession` is the central host-side coordinator for prompts, provider turns, tools, compaction, refinement, autonomous policy, and RLM children (`packages/coding-agent/src/core/agent-session.ts`).
2. The default model-facing execution surface is the IPython tool (`packages/coding-agent/src/core/tools/ipython.ts`), backed by a lazily created `KernelManager` that uses Jupyter/ZeroMQ (`packages/coding-agent/src/core/kernel/index.ts`).
3. Python's `rlm` callable is a shim over typed `host.request` comm messages; the TypeScript session handles `rlm.run`, list, and delete (`prime-agent-runtime/src/rlm/__init__.py:84-150`; `packages/coding-agent/src/core/agent-session.ts:8764-8768`). Provider execution does not occur in the Python shim.
4. Daemon supervisor and resident worker code own attachment, routing, process continuity, and family-level child discovery (`packages/coding-agent/src/modes/daemon/daemon-supervisor.ts`; `packages/coding-agent/src/modes/daemon/daemon-mode.ts`; `packages/coding-agent/src/modes/daemon/rlm-ledger.ts`). These are process boundaries, not privilege boundaries.

## Persistent IPython state

- In-process state persists because calls share one kernel namespace.
- `KernelManager.snapshotState()` and `restoreState()` serialize selected user names to a session artifact using generated dill code (`packages/coding-agent/src/core/kernel/index.ts:1481-1569`; `packages/coding-agent/src/core/kernel/state-snapshot.ts`).
- Live/internal handles are excluded; unpicklable values are reported/skipped. Persistence is therefore selective, not a guarantee that arbitrary Python state survives restart.
- Compaction changes transcript context, not the kernel object, so an extant kernel survives compaction. Cross-process revival depends on the snapshot path and serializability.

## Continual Harness and `/refine`

- Editable kinds are `prompt`, `memory`, `skill`, and `subagent`; actions are create/update/delete; scopes are local/global (`packages/coding-agent/src/core/refinement/refinement.ts:30-32`).
- Global state is `<agentDir>/harness/harness_state.json`; local state is `<sessionArtifactDir>/harness/harness_state.json` (`refinement.ts:269-278`). Writes use a temporary file and rename, retaining mode (`refinement.ts:345-358`).
- The base system prompt is source-defined. Harness prompt entries are appended as formatted supplemental context in the system-prompt builder (`packages/coding-agent/src/core/system-prompt.ts:6,106,141`). Thus “immutable” means `/refine` has no edit operation for the base prompt, not that deployed source/configuration can never change it.
- Planning invokes a model over serialized trajectory, current merged harness overview, and refinement history. Application is a separate phase and uses a baseline state to reject target entries changed during planning (`refinement.ts:857-930`, `707-804`).
- The refinement record stores rationale as `evidence`, a claimed expected outcome, and before/after entry snapshots. There is no required structured trajectory pointer, test result, counterfactual, confidence, reviewer identity, or promotion decision (`refinement.ts:50-101`, `787-799`).
- Auto-refinement has a separate model review gate at turn intervals or compaction. The gate itself judges whether the trajectory contains reusable evidence (`refinement.ts:175-185`, `936-998`). This is model judgment, not an empirical quality gate.
- Python `rlm.harness` exposes direct CRUD and refinement-event recording. It can mutate harness state without going through the `/refine` proposal/review path (`prime-agent-runtime/src/rlm/harness.py`).

## Refinement semantics by kind

| Kind | Stored behavior |
|---|---|
| Prompt | Supplemental text included in the harness overview; does not rewrite base prompt. |
| Memory | Durable declarative text included in the same overview. |
| Skill | Description plus required Python reference and argument contract. A harness entry describes/routes a callable; `/refine` does not synthesize or install executable Python implementation files. |
| Subagent | Reusable textual delegation specification. It is not itself a running child or executable wrapper. |

All kinds share the same generic record and prompt-injection path. Local and global entries are merged; ID collisions retain both by display-prefixing the local entry (`refinement.ts:326-342`).

## Rollback

Rollback constructs inverse edits from recorded `before` and `after` snapshots and applies them as a new refinement (`refinement.ts:804-836`, `878-888`). Global history is appended to a cross-session JSONL file; local history is stored as custom entries in the session transcript (`refinement.ts:369-418`; `packages/coding-agent/src/core/agent-session.ts`). This is logical entry rollback, not full session, file-system, installed-skill, model, or kernel rollback.

## Sessions, branching, and compaction

- A JSONL session header is followed by typed entries with `id` and `parentId`; the active leaf selects one root-to-leaf path (`packages/coding-agent/src/core/session-manager.ts:75-99,248-263,1183-1189`).
- `branch()` moves the leaf pointer without deleting other descendants; a subsequent append creates another child. `createBranchedSession()` copies a selected path into a new session file (`session-manager.ts:1930-2134`).
- Compaction appends a lossy summary entry while the full historical entries remain in the JSONL tree. Context reconstruction uses the latest compaction summary plus retained and later messages (`session-manager.ts:465-590,1542-1565`).
- Branch summaries similarly preserve an abandoned path as summary context. Neither summary provides a cryptographic or semantic fidelity guarantee.

## Persistent/background execution

Normal interactive execution uses daemon-managed resident workers. Detaching a client need not end the worker, schedules, kernel, or child sessions (`packages/coding-agent/src/modes/daemon/daemon-supervisor.ts`; `daemon-mode.ts`). Recovery uses JSONL and session artifacts. Evidence in this pass is source/documentation only; an end-to-end detach/reattach reproduction was not completed.

## Subagent lifecycle and communication

- `rlm.run` admits a child and returns a handle, then child execution continues independently (`agent-session.ts:10035+`; `prime-agent-runtime/src/rlm/__init__.py:143-150`).
- Depth is checked host-side; default/configuration is represented by `RLM_DEPTH` and `RLM_MAX_DEPTH` (`agent-session.ts:9699`, `session-manager.ts:768-774`).
- The direct-child registry supports list/delete and survives through transcript/artifact-backed reconciliation (`agent-session.ts:9164-9481`; daemon ledger implementation).
- Answers are not part of the admission return. Communication uses explicit daemon-routed agent messages or shared files. Deletion tombstones/removes addressability but intentionally does not imply artifact erasure.

## Provider/model abstraction

`packages/ai` separates model metadata (`provider`, `api`, model ID, token/cost capabilities) from API implementations. A registry maps an API identifier to `stream` and `streamSimple` functions and checks API compatibility (`packages/ai/src/types.ts:6-164`; `packages/ai/src/api-registry.ts:23-97`). Built-ins are lazily loaded and registered (`packages/ai/src/providers/register-builtins.ts:324-394`). Extensions can register providers, so known unions are not closed-world catalogs.

## Autonomous mode and gates

Autonomous mode is bounded by continuations, turns, non-cache tokens, and wall time. Configured shell gates run before completion; failure output is returned in a continuation. Repeated failed gates are not rerun against an unchanged Git snapshot (`packages/coding-agent/src/core/autonomous.ts:254-347`). Gate success establishes only command exit success. It does not validate semantic task completion outside the command's coverage.

## Security and trust boundaries

- Model-generated Python, shell commands, extensions, and installed skills execute with the worker user's OS permissions. Kernel/worker separation is lifecycle isolation, not a sandbox.
- Provider credentials stay host-side and Python receives selected metadata/typed capabilities rather than the full auth store.
- Host handlers validate request shapes and recursion policy, while project content and skill instructions can influence privileged model-generated code.
- Harness entries are prompt content and therefore a durable prompt-injection surface. Global mutation expands blast radius across sessions. No independent approval is required for ordinary refinement application in the inspected path.
