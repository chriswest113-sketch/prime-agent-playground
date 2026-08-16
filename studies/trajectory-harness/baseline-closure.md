# Baseline-Closure Pass

Date: 2026-08-15 UTC. This pass closes specific runtime gaps without beginning continual-harness A/B experiments.

## Persistent kernel

### Supported provisioning path

The repository-supported entry point is `./scripts/setup-kernel-venv.sh`, which invokes `ensureKernelPython()`. The bootstrap uses `uv`, installs Python 3.11, `ipykernel`, the checkout's `prime-agent-runtime`, `dill`, and the default RLM packages into `~/.prime/agent/kernel-venv`, or a configured `PRIME_AGENT_KERNEL_VENV`. A fully provisioned interpreter may instead be selected with `PRIME_AGENT_KERNEL_PYTHON` (`scripts/setup-kernel-venv.sh`; `packages/coding-agent/src/core/kernel/bootstrap.ts`).

Provisioning was attempted with `PRIME_AGENT_INSTALL_UV=1 ./scripts/setup-kernel-venv.sh`. It failed at `uv python install 3.11` because the environment's network tunnel could not download the repository-selected standalone CPython archive after three retries. The installed system Python 3.12 has `ipykernel` but lacks `dill`, `rlm`, and most default packages. It therefore does not satisfy `ensureKernelPython()`'s supported override validation and was not represented as a fully provisioned Prime Agent kernel environment.

### Highest feasible real-kernel boundary

With `PRIME_AGENT_KERNEL_PYTHON=/root/.pyenv/shims/python3`:

- upstream `test/ipython-bootstrap.test.ts` ran six tests against real kernel processes and passed;
- separate `KernelManager.execute()` calls preserved `study_value` in the same live kernel namespace;
- a fresh kernel process imported the checkout's Python runtime through `PYTHONPATH`, accessed `rlm.harness`, created all four local entry kinds and one global entry, recorded evidence/history, and reloaded those files;
- this confirms same-process namespace persistence and disk-backed harness persistence across a fresh kernel process;
- it does **not** confirm dill snapshot/restore, arbitrary Python-object persistence, or full worker/session restart recovery.

`test/kernel-state-roundtrip.test.ts` still skipped all six tests because its eligibility check requires both `ipykernel` and `dill`. Consequently:

| Requested behavior | Result |
|---|---|
| Variables survive separate executions in one live kernel | **RUNTIME-CONFIRMED** |
| Snapshot/restore into a fresh kernel | **NOT RUNTIME-CONFIRMED**; supported provisioning blocked by network and `dill` unavailable |
| Unpicklable state is skipped/reported | **NOT RUNTIME-CONFIRMED**; only implementation/test definition inspected |
| Harness access from a live kernel | **RUNTIME-CONFIRMED** at direct Python harness CRUD boundary |
| Harness disk state survives disposal and a fresh kernel process | **RUNTIME-CONFIRMED** for the isolated state directories in `live-kernel-probe.ts` |
| IPython namespace survives fresh kernel process without snapshot | **NOT CLAIMED** |
| State survives daemon worker restart | **NOT RUNTIME-CONFIRMED** |

## `/refine` integration boundary

No credentials or external model calls were introduced. The highest successful integration level was a real `AgentSession` using the faux provider/planner boundary with the production application path. `test/suite/agent-session-serialized-refine.test.ts` passed 71 tests. Its non-mocked application case runs production `applyRefinementProposal`, atomic harness persistence, system-prompt rebuild, and `refine_complete` emission, while mocking only the LLM planning result. This is not a real model-driven refinement.

The real-process daemon/JSON-mode refinement test was also attempted and failed before its expected clean CLI exit (`code: 1` rather than `0`). The test captures child stderr without printing it at the failing assertion, so this pass does not attribute a cause. It provides no additional runtime confirmation.

| `/refine` behavior | Highest runtime evidence |
|---|---|
| Prompt creation | Host refinement application tests; not session-level non-mocked apply and not model-driven |
| Memory creation | Production AgentSession apply/persist/prompt-rebuild event path with faux plan |
| Skill creation | Host refinement application tests, including Python reference/argument validation; not executable skill synthesis |
| Subagent-state creation | Host refinement application tests; textual harness spec only, not child spawn |
| Local/global scope | Host storage/merge/planning tests; direct live-kernel local/global harness persistence |
| Evidence/history | Host refinement result/history tests; direct live-kernel `record_refinement` persistence |
| Rollback | Host planning/application tests over before/after snapshots |
| Persistence after reload | Host save/load and history reload tests; direct live-harness state across fresh kernel process |
| Real model-generated proposal | **NOT RUNTIME-CONFIRMED** |
| Daemon real-process `/refine` | **NOT RUNTIME-CONFIRMED** in this pass |

The distinction matters: mechanics and one AgentSession application pipeline are runtime-confirmed, while the empirical quality and reliability of model-selected edits remain unknown.

## Autonomous cleanup triage

The original two assertions are:

1. timeout case, line 458: `expect(await waitForProcessExit(descendantPid)).toBe(true)`;
2. session-abort case, line 488: `expect(await waitForProcessExit(gatePid)).toBe(true)`.

The unmodified suite failed both assertions in the prior pass. For diagnosis only, the test was temporarily instrumented to read `/proc/<pid>/stat`; the file was restored byte-for-byte afterward. Three diagnostic repetitions each failed the same two tests (20 passed, 2 failed). A final after-wait probe showed both reported Node processes in state `Z` with parent PID 1 after the two-second wait.

The timeout descendant was a Node child executing a 60-second timer. The abort PID was the Node gate command writing `gate.pid` and executing a 60-second timer. They had received termination and become zombies; the test helper uses `process.kill(pid, 0)`, which counts zombies as running. Container PID 1 did not reap them within the assertion window. Repository utility code separately defines zombie-aware `isProcessAlive()`, but this test helper does not use it.

Classification: **consistently reproducible, environment-sensitive assertion behavior with an implementation/test-observability mismatch**. The evidence supports “killed but unreaped zombie,” not “still executing.” No production repair was made. This does not invalidate harness-refinement mechanics, but repeated gate subprocesses in this container can accumulate zombie PIDs and make cleanup assertions misleading. Planned experiments using autonomous shell gates must record zombie state separately and bound run counts; this is an execution-environment limitation, not evidence about refinement quality.

## Decision gate

**YES WITH LIMITATIONS.** An independent second investigator can reconstruct the study, locate implementation ownership, rerun the credential-free integration boundaries, and challenge the evidence labels without first resolving additional architectural ambiguity. Remaining limitations are:

1. repository-supported kernel provisioning could not complete because network access to the CPython archive failed;
2. dill snapshot/restore and unpicklable-state behavior are not runtime-confirmed;
3. no real model-driven refinement was executed, so proposal quality and evidence grounding remain unknown;
4. daemon detach/reattach, worker restart, and real-process `/refine` are not runtime-confirmed;
5. autonomous cleanup assertions observe unreaped zombies in this container and require environment-aware interpretation;
6. provider-backed child execution remains source-confirmed rather than runtime-confirmed;
7. upstream/default-branch provenance remains unknown because the checkout has no remote metadata.
