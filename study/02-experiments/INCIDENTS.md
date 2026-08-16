# Experimental Incidents

Deviations, contaminations, and invalidated measurements. Recorded because an
unrecorded failed measurement is worse than no measurement.

---

## INC-001 — `npm run build` silently contaminated the baseline

**When:** during test-baseline establishment.
**What I did:** ran `npm run build` to test the hypothesis that extension-loader test
failures were caused by missing `dist/` output.

**What actually happened:**

1. `npm run build` **failed**. `packages/ai` does not compile at this commit in this
   environment: `src/models.ts(20,82): error TS2536: Type 'TProvider' cannot be used to
   index type ...` (three occurrences), under `tsgo` (TypeScript 7.0.0-dev native preview,
   pinned in `package.json` devDependencies). Build stopped at `packages/ai`; therefore
   `packages/agent/dist` and `packages/coding-agent/dist` were **never produced**, and the
   extension-loader failures were never actually addressed.

2. **I misread the exit status.** My command was
   `npm run build > log 2>&1; echo "BUILD_EXIT=$?"; tail -5 log`, and I took the harness's
   "exit code 0" (the exit of `tail`) as the build's status. I stated in an earlier draft of
   `FINDINGS.md` that "`npm run build` succeeds (exit 0)". **That was wrong** and is corrected
   in §9 of the current version.

3. **The build mutated tracked source.** `packages/ai`'s build script is
   `npm run generate-models && tsgo -p tsconfig.build.json`. `generate-models` regenerated
   `packages/ai/src/models.generated.ts` **before** the compile failed. In this
   network-restricted environment the generator produced a drastically reduced catalog:
   **20,733 lines → 2,103 lines (-20,006 / +2,103)**. `package-lock.json` was also modified
   (by the earlier `npm install`).

**Why this matters beyond hygiene:** `AGENTS.md` explicitly forbids editing
`models.generated.ts` by hand and directs changes through `scripts/generate-models.ts`. But
the *generator itself* is a network-dependent, non-hermetic step wired into the default build.
Running the project's own documented build command in a restricted environment silently
rewrites the model catalog that the model-registry and model-selection tests assert against.
This is a live example of a hidden variable (`M_t`, the provider/model catalog) mutating as a
side effect of an unrelated action, with no version stamp and no warning.

**Remediation:**
- `git checkout -- packages/ai/src/models.generated.ts package-lock.json` — verified restored
  to 20,733 lines, `git status` clean apart from untracked `study/`.
- `rm -rf packages/ai/dist packages/tui/dist` — partial build artifacts removed.
- Baseline commit `97b994c` re-verified intact.

**Invalidated measurement:** the "post-build" full-suite run
(21 files / 141 tests failed) is **VOID**. It measured a tree with a gutted model catalog,
partial `dist/` output, and heavy CPU contention from five concurrent subagents on 4 cores.
It must not be compared to the pre-build run. Specifically:
- `model-registry.test.ts` (10 failures) and `4649-subagent-model-selection.test.ts` failures
  are explained by the gutted catalog, not by any property of the code.
- 22 × `Error: Timed out waiting for condition` in `agent-session-recursion.test.ts` are
  explained by CPU starvation, not by a defect.

**Retained as valid:** the pre-build run (11 files / 64 tests failed, 4,091 passed, 264s) on a
clean tree at `97b994c` with `npm install` only. See `TEST_BASELINE.md`.

**Lesson for the study protocol:** check `git status` after *any* command that could touch the
tree, and never read `$?` through a pipeline or a trailing command.
