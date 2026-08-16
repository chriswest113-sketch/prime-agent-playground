# Baseline-Closure Commands and Outcomes

Commands were run on 2026-08-15 UTC. Raw output is under `runtime-closure/`.

| Working directory | Command | Outcome |
|---|---|---|
| repository root | `git switch -c study/baseline-closure` | Created isolated closure branch from study commit `0fc38f4`. |
| repository root | `PRIME_AGENT_INSTALL_UV=1 ./scripts/setup-kernel-venv.sh` | Failed: `uv python install 3.11` exited 1. |
| repository root | `/root/.local/bin/uv python install 3.11` | Failed after three retries: network tunnel could not download the standalone CPython archive. |
| `packages/coding-agent` | `PRIME_AGENT_KERNEL_PYTHON=/root/.pyenv/shims/python3 npx tsx ../../node_modules/vitest/dist/cli.js --run test/kernel-state-roundtrip.test.ts` | Exit 0 with 1 file/6 tests skipped; interpreter lacks `dill`. |
| `packages/coding-agent` | `PRIME_AGENT_KERNEL_PYTHON=/root/.pyenv/shims/python3 npx tsx ../../node_modules/vitest/dist/cli.js --run test/ipython-bootstrap.test.ts` | Exit 0; 6 passed, including real-kernel cases. |
| repository root | `PRIME_AGENT_KERNEL_PYTHON=/root/.pyenv/shims/python3 npx tsx studies/trajectory-harness/live-kernel-probe.ts` | Exit 0; same-kernel variable persistence and fresh-kernel harness reload passed. |
| `packages/coding-agent` | `npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/agent-session-serialized-refine.test.ts` | Exit 0; 71 passed. |
| `packages/coding-agent` | `npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/daemon-serialized-refine-process.test.ts` | Exit 1; expected CLI code 0, received 1. |
| `packages/coding-agent` | `npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/agent-session-autonomous.test.ts` (temporary `/proc` diagnostics, repeated three times) | Each run: 20 passed, 2 failed; observed timeout descendant as zombie every run and abort gate as running immediately in two runs/zombie in one. |
| `packages/coding-agent` | same autonomous command with temporary diagnostics after the two-second wait | 20 passed, 2 failed; both target PIDs were zombies parented to PID 1. |
| `packages/coding-agent` | `cmp -s /tmp/agent-session-autonomous.test.ts.baseline2 test/suite/agent-session-autonomous.test.ts` | Passed; diagnostic mutation reverted byte-for-byte. |

The bootstrap's first failure suppresses the nested `uv` stderr. The direct `uv` invocation was used only to expose the cause; it is the same repository-selected installer command, not an alternative environment.
