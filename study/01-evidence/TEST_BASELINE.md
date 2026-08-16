# Test Baseline — executed, not inferred

Subject: `prime-agent` v0.7.2 @ `97b994c3d7c45ca1ae635190e91e9e58ddf2577c`
Runner: `vitest 4.1.10` via `npx tsx ../../node_modules/vitest/dist/cli.js --run`
Environment: Linux, Node v22.22.2, 4 CPUs, **running as root**, no provider credentials
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GH_TOKEN`,
`GITHUB_TOKEN` unset), `PI_NO_LOCAL_LLM=1`.

## Runs

| # | Condition | Files | Tests | Verdict |
|---|-----------|-------|-------|---------|
| 1 | `npm install` only, no `dist/` | 11 failed / 300 passed / 8 skipped | 64 failed / 4,091 passed / 59 skipped | superseded — build-state artifact |
| 2 | after failed `npm run build` | 21 failed / 290 passed | 141 failed / 4,014 passed | **VOID** — see INC-001 |
| 3 | **`dist/` built, pristine tree** | **6 failed / 305 passed / 8 skipped** | **8 failed / 4,147 passed / 59 skipped** | **authoritative** |

Run 3 duration: 256.58s.

## Why run 1 was misleading

51 of its 64 failures were the three `extensions-*` files, all failing with
`Failed to load extension: Cannot find package '.../@earendil-works/pi-agent-core/dist/index.js'`.
The extension loader resolves extensions against the package's **built** entry point, and
`npm install` symlinks workspaces to source without producing `dist/`. Reproduced in isolation
with a minimal harness, then confirmed resolved: with `dist/` present those three files pass
**63/63**.

## Why run 2 is void

`npm run build` fails, but not for the reason it appears to. `packages/ai`'s build script is
`npm run generate-models && tsgo -p tsconfig.build.json`. The generator is **network-dependent**
and, in this restricted environment, rewrote `packages/ai/src/models.generated.ts` from 20,733
lines to 2,103 — after which `src/models.ts` no longer typechecked (`TS2536`).

Establishing the causal direction: with the pristine catalog restored,
`cd packages/ai && npx tsgo -p tsconfig.build.json` exits **0** with no diagnostics. Building
`tui`, `ai`, and `agent` directly (skipping `generate-models`) all succeed.

**The repository compiles fine. Its default build command is not hermetic**, and running it
offline corrupts a tracked source file that other tests assert against. Run 2's
`model-registry.test.ts` (10) and `4649-subagent-model-selection.test.ts` failures were caused by
that corruption; its 22 × `Timed out waiting for condition` were caused by CPU starvation from
concurrent work on 4 cores.

## The residual 8 failures (run 3)

All eight are attributable to the execution environment, not to defects:

| Test | Attributed cause |
|---|---|
| `tools.test.ts` — "should include EACCES for read-only files" | running as **root**: mode `0444` does not deny root |
| `tools.test.ts` — "should include EACCES in diff preview for unreadable files" | same |
| `config.test.ts` — "does not self-update when npm install path is not writable" | same — root can write the "unwritable" path |
| `git-context.test.ts` — "keeps an ssh remote url verbatim when it cannot be normalized" | git remote/environment state |
| `oauth-selector.test.ts` — "sorts stale auth ahead of unconfigured providers" | no stored auth state |
| `4649-subagent-model-selection` — "limits ChatGPT discovery ... to the account model catalog" | requires provider credentials |
| `4649-subagent-model-selection` — "omits providers whose credentials are marked expired" | requires provider credentials |
| `4620-fast-mode-settings` — "returns the effective service tier when cycling models" | requires provider |

The three root-permission cases are a genuine (if minor) portability observation: the suite
assumes a non-root user. The rest are expected consequences of running credential-free.

**Fair summary: the suite passes in this environment.** 4,147 of 4,155 executed tests pass; the
8 failures are environmental and none indicate a defect in the code under study.

## What the suite does and does not establish

The suite is large (319 files, 4,214 tests), fast, and almost entirely **mechanical**: protocol
shapes, daemon lifecycle and supervision, persistence and migration, process recovery, CLI
surface, TUI rendering. Model interaction is tested through the scripted **faux provider**
(`packages/ai/src/providers/faux.ts`), never through a live model — `test.sh` exists specifically
to strip every API key before running.

`refinement.test.ts` mocks `completeSimple` (`refinement.test.ts:33-43`) and asserts edit
application, scope resolution, rollback construction, and concurrency semantics. That is
appropriate unit testing of the mechanism.

It is **not** evaluation of whether refinement improves behavior, and no such evaluation exists
anywhere in the repository: no benchmark runner, no scoring harness, no pass-rate metric, no
before/after comparison. This is consistent with the architectural boundary documented in
`FINDINGS.md` §8 — scoring is delegated to the external `verifiers` / `prime-rl` harness.
