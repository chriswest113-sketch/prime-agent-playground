# Execution envelope

Recorded before any probe was written, and re-verified after the final run.

## Repository state

| Fact | Value |
| --- | --- |
| HEAD at start | `97b994c3d7c45ca1ae635190e91e9e58ddf2577c` |
| HEAD at end (pre-commit) | `97b994c3d7c45ca1ae635190e91e9e58ddf2577c` |
| Baseline this branch was cut from | `97b994c3d7c45ca1ae635190e91e9e58ddf2577c` (the common study baseline) |
| Study branch | `study/joint-prime-agent-discriminating-tests` |
| Working branch in this session | `claude/prime-agent-discriminating-tests-mxkbla` |
| Relationship between the two | Both refs, and `origin/*` for both, pointed at the identical baseline SHA at session start; the study commit is pushed to both |
| Clean/dirty at start | Clean (`git status --porcelain` empty) |
| Dirty at end | Only `studies/` (untracked, this study) |
| Package version | `prime-agent` 0.7.2, `@earendil-works/pi-coding-agent` 0.7.2 |

Branches deliberately **not** touched: `main`, `ai-optimization-lab`,
`codex/conduct-independent-implementation-study`,
`claude/prime-agent-reference-study-96e84w`. Neither prior study was merged,
read into this branch, or copied here.

## Runtime versions

| Component | Version |
| --- | --- |
| OS | `Linux 6.18.5-fc-v20 x86_64 GNU/Linux` |
| Node | `v22.22.2` |
| npm | `10.9.7` |
| Python | `3.11.15` |
| tsx (probe runner) | `4.23.1` |
| TypeScript (declared) | `^7.0.2` |
| vitest (declared, coding-agent) | `^4.1.10` |

## Provider credentials

**No provider credentials are present.** Every probe records its own view of the
credential surface in `artifacts/raw-result.json` under
`environment.providerCredentialsPresent`; all entries are `false` in every run:

```
ANTHROPIC_API_KEY, ANTHROPIC_OAUTH_TOKEN, OPENAI_API_KEY, GEMINI_API_KEY,
GROQ_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY, KIMI_API_KEY,
ZAI_API_KEY, PRIME_API_KEY  -> all unset
```

`ANTHROPIC_BASE_URL` **is** set in this container, but it belongs to the outer
Claude Code harness, not to Prime Agent, and no probe reads it. Every probe
drives Prime Agent through the in-repo faux provider
(`packages/ai/src/providers/faux.ts`) with a synthetic `"faux-key"`, so no
network call to any model provider occurs.

## Differences from the original baseline environment

1. **`node_modules` was absent and had to be installed.** `npm install
   --no-audit --no-fund` added 351 packages. This is required to run anything at
   all; the baseline tree ships without an install.
2. **npm 10.9.7 rewrote `package-lock.json`** during that install, stripping
   `libc` fields that a newer npm had written (57 deletions). This is an
   artifact of the container's npm version, not of the study. **It was reverted
   with `git checkout -- package-lock.json` and is not part of the commit.**
3. **No built `dist/` output exists** for any workspace package. Probes import
   TypeScript source directly through `tsx` rather than building, so this does
   not affect results — but it does mean the probes exercise source, not the
   packaged build.
4. **`prime-agent-runtime` is not pip-installed.** Probes reach `rlm.harness` via
   `PYTHONPATH=prime-agent-runtime/src`. `rlm/__init__.py` imports cleanly
   without `ipykernel`/`nest-asyncio`/`tyro`, so the harness CRUD surface is
   exercisable, but **no IPython kernel is available** — see
   `unresolved.md` for what that forecloses.
5. **The container is not the baseline's own CI environment.** Kernel, npm
   version, and absence of a GPU/model endpoint all differ from a developer
   workstation.

## Isolation guarantees

- Every probe calls `isolateAgentDir()`, which sets
  `PRIME_AGENT_CODING_AGENT_DIR` to a throwaway temp directory **before** any
  production module resolves `getAgentDir()`. The operator's real
  `~/.prime/agent` is never read or written.
- Sessions use the coding-agent test harness's own temp directories, removed on
  cleanup.
- Probes live entirely under `studies/joint-discriminating-tests/`. **No
  production source file was modified, instrumented, or patched at any point.**
  The final `git status` shows `studies/` as the only change.
- Probes are standalone `tsx` scripts, not vitest tests, so the repository's own
  test boundary is untouched. (They *import* the coding-agent test harness
  `packages/coding-agent/test/suite/harness.ts` as a library; they do not add to
  or alter the suite.)

## Type-checking the probes

`studies/` is outside the repository's `tsconfig` `include` and biome
`files.includes`, so `npm run check` does **not** examine the probes. That gap
hid a real defect in the first round (an invalid `ServiceTier` literal in Test
05, which invalidated that probe's service-tier evidence). A local
`studies/joint-discriminating-tests/tsconfig.json` now covers them:

```bash
npx tsgo --noEmit -p studies/joint-discriminating-tests/tsconfig.json
```

Clean as of the current commit.

## Reproducing

```bash
npm install --no-audit --no-fund      # then: git checkout -- package-lock.json
npx tsgo --noEmit -p studies/joint-discriminating-tests/tsconfig.json
bash studies/joint-discriminating-tests/run-all.sh
```

Each probe exits non-zero if any assertion fails. Console output per probe is
captured to `<probe>/artifacts/console-output.txt`.
