# Baseline Runtime Reproduction

Date: 2026-08-15 UTC. Working directory for commands: `/workspace/prime-agent-playground/packages/coding-agent`. No provider APIs, API keys, paid tokens, or interactive TUI were used.

## Results

| Mechanism | Exact command | Result | Interpretation |
|---|---|---|---|
| Harness CRUD, scope merge, evidence records, rollback, conflict checks | `npx tsx ../../node_modules/vitest/dist/cli.js --run test/refinement.test.ts` | PASS: 1 file, 59 tests | Runtime-confirms the pure host-side refinement mechanics covered by this suite. |
| Kernel snapshot/revival | `npx tsx ../../node_modules/vitest/dist/cli.js --run test/kernel-state-roundtrip.test.ts` | SKIP: 1 file, 6 tests | No candidate from `PRIME_AGENT_KERNEL_PYTHON` or the managed kernel venv could import both `ipykernel` and `dill`. Persistent-kernel revival remains implementation-confirmed only. |
| Autonomous continuation and gates | `npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/agent-session-autonomous.test.ts` | FAIL: 20 passed, 2 failed | Timeout and abort cases did not observe descendant process exit within the test bound. Preserve as negative evidence; do not recast as a pass. |
| Session tree and branching | `npx tsx ../../node_modules/vitest/dist/cli.js --run test/session-manager/tree-traversal.test.ts` | PASS: 1 file, 31 tests | Runtime-confirms append parent chains, in-file branches, active-path context, and branched-session copying covered by the suite. |

Every invocation also emitted npm warnings that `http-proxy` is an unknown environment config and `min-release-age` is unknown to the installed npm. These warnings did not fail the passing suites but indicate this environment's npm does not enforce the repository's stated minimum-release-age setting.

Raw output is retained in `runtime/`. Exit codes are embedded at the end of each log.

## Not reproduced and why

- **Provider-backed RLM child execution:** would require configured credentials/model service. Source was inspected; no external calls were made.
- **Live `/refine` proposal generation:** would require a model. The deterministic application/storage path was exercised with faux/mocked completion behavior.
- **Daemon detach/reattach and restart recovery:** not run in this first baseline because it risks disturbing shared resident services and requires a controlled temporary agent home/process namespace.
- **Compaction semantic fidelity:** existing mechanics were inspected, but correctness requires task-specific retention checks, not merely a unit-suite pass.
- **Cross-session global harness influence:** storage/merge behavior was tested; model behavior under injected global entries was not.

## Reproduction limitations

The tests establish behavior of the checked-out code under their fixtures. They do not establish empirical task improvement, provider invariance, adversarial safety, recovery under real crashes, or semantic equivalence between summarized and full trajectories.

## Baseline-closure update

The repository-supported kernel bootstrap was attempted and blocked by the environment's network tunnel. A system interpreter with `ipykernel` enabled narrower real-kernel tests but did not satisfy the full supported environment because `dill` and default runtime packages were absent. Same-kernel namespace persistence and fresh-kernel harness-file reload are now runtime-confirmed; dill snapshot/restore remains unconfirmed. The AgentSession serialized-refinement suite passed 71 tests with faux planning and production apply/persist/prompt-rebuild behavior. See `baseline-closure.md` for bounded conclusions and `exact-commands.md` for commands.
