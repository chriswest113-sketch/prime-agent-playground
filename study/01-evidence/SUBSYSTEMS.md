# Subsystem Evidence — coverage beyond the refinement loop

Evidence gathered across five subsystems not examined first-hand in `FINDINGS.md`. Each was mapped
against source with `file:line` citations under the same status discipline. Findings that bear on the
research question — determinism, versioning, attribution, comparability — are foregrounded; a full
mechanical description of each subsystem is not the goal.

---

## 1. Evaluation surface — the faux provider and suite harness

The single most important subsystem for anyone asking "how do you test a nondeterministic system."

**What it is.** `registerFauxProvider()` allocates a private FIFO queue (`faux.ts:400`) and registers a
`stream` function into a process-global API registry (`faux.ts:470`). Each request does
`pendingResponses.shift()` (`faux.ts:433`). No HTTP anywhere — `baseUrl` is the sentinel
`http://localhost:0` (`faux.ts:24`). A queued step is either a literal `AssistantMessage` or a factory
closure `(context, options, state, model) => AssistantMessage` (`faux.ts:96-103`) that may branch on the
outgoing context. The queued message is `structuredClone`d, re-stamped, given estimated usage, and
emitted as a synthetic delta stream shaped like a real provider's (`faux.ts:296-389`).

The harness (`test/suite/harness.ts`) assembles the **real** agent — real `Agent`, `AgentSession`,
`ModelRegistry`, `SettingsManager`, `SessionManager`, in-memory — around the fake model, authenticated
with the literal string `"faux-key"`, and records every session event into an array exposed with a typed
filter (`harness.ts:208-227`). That event array is the primary observation surface.

**Determinism is split, and the split is the finding.**

| deterministic | nondeterministic |
|---|---|
| message content (cloned verbatim) | delta boundaries — `Math.random()` chunks of 3-5 chars (`faux.ts:241-251`, `:25-26`) |
| stop reason | `randomId()` = `Date.now()` + `Math.random()` (`faux.ts:132-134`) → api names, registry source ids, tool-call ids |
| usage numbers (`ceil(len/4)`, `faux.ts:128-130`) | message timestamps default to `Date.now()` (`faux.ts:92`, `:260`) |
| | harness temp dirs (`harness.ts:103`) |

**No seed exists anywhere in the repository.** Repo-wide search finds no seeded PRNG and no vitest
sequence/seed control; the only `seed` identifiers are unrelated runtime features (`rlm-ledger.ts:593`,
`daemon-session-summarizer.ts:267`, a Mistral request-id hash at `mistral.ts:182`).

**No cassette/VCR replay of a real trajectory exists** — NOT_FOUND. Searched for
`cassette|nock|vcr|polly|playback`; every `replay` hit is provider message-format replay
(`transform-messages.ts:104`, `anthropic.ts:671`), not recorded-response replay. No `__snapshots__`
directory exists outside `node_modules`.

**No harness scores agent quality** — NOT_FOUND. No pass rate, benchmark, rubric, LLM judge, or
regression metric. Independently corroborates `FINDINGS.md` §2.

**Further limits, each with a comparability cost:**

- **Assertions are structural over author-scripted content, and the exact-string ones are tautological.**
  `agent-session-goal.test.ts:348` asserts `["Still working.", "Goal complete."]` — strings supplied by
  the same test's `setResponses`. Nothing is semantic.
- **Suite tests probe private fields**: `_assistantTurnsSinceAutoRefine` (20 assertions),
  `_pendingRequestedRefine` (17), `_compactAutoRefinePending` (16). Auto-refine mechanics are heavily
  covered; auto-refine *value* is not covered at all.
- **Under-scripting degrades silently.** A run taking one more turn than scripted receives a well-formed
  assistant error turn (`faux.ts:440-449`), not a failure. `state.callCount` counts *attempted* requests,
  so it cannot distinguish a healthy run from an over-running one.
- **Cost is hardcoded to zero** on every faux response; budget enforcement is unexercisable through it.
- **Token counting is `ceil(len/4)` fiction**, and compaction mixes units: the *trigger* uses real
  provider usage totals while the *cut* uses the chars/4 estimate.
- **`promptCache` grows without bound** and silently disables itself when `sessionId` is absent.
- **Real-provider tests never run in CI.** ~20 files under `packages/ai/test/` gate on
  `it.skipIf(!testCase.apiKey)`; the CI matrix (`.github/workflows/ci.yml:67-140`) sets no provider keys.
  The only model-touching coverage that runs in CI is the faux provider. Process-stress and real-kernel
  tests are also excluded from the default run.

`packages/ai/README.md:743` states the intent honestly: "one deterministic scripted flow per
registration."

---

## 2. Model and provider identity — `M_t` is a name, not a version

**Model identity carries no version.** `Model<TApi>` (`packages/ai/src/types.ts:440-472`) has `id`,
`name`, `api`, `provider`, `baseUrl`, `reasoning`, `cost`, `contextWindow`, `maxTokens` — **no revision,
snapshot date, catalog hash, or checksum.** Equality is `a.id === b.id && a.provider === b.provider`
(`models.ts:107`), so a config-overridden model with a different cost table compares equal to the
built-in one.

**The catalog is an untimestamped build artifact.** `models.generated.ts` carries no generation marker
of any kind. The generator fetches live third-party catalogs at author time — models.dev
(`generate-models.ts:874`), OpenRouter (`:741`), Vercel AI Gateway (`:815`), Prime Inference (`:647`) —
and **each fetch is wrapped in try/catch that logs and returns an empty/partial list** (`:652`, `:659`,
`:807`, `:866`). A generation run during an upstream outage silently produces a smaller catalog that is
indistinguishable from a complete one.

> This was confirmed the hard way: running the project's own `npm run build` offline regenerated the
> catalog from 20,733 lines to 2,103 with no error. See `study/02-experiments/INCIDENTS.md` (INC-001).
> Source analysis and accidental empirical demonstration agree.

**No sampling determinism surface at all.** `StreamOptions` (`types.ts:78-142`) exposes `temperature`,
`maxTokens`, `serviceTier`, `cacheRetention`, transport and retry knobs — **no `top_p`, `top_k`, `seed`,
`frequency_penalty`, or `stop`.** And `temperature` is plumbed but **never populated by the agent**:
every request runs at the provider's server-side default, a provider-controlled variable that can change
with no client-visible signal.

**Silent config divergences that make two labelled-identical runs differ:**

- `maxTokens` is capped at a hardcoded 32,000 regardless of a model's declared limit (some declare
  128,000). Length-limited completions are misattributed to the model.
- `xhigh` and `max` thinking levels **collapse to `high`** on token-budget providers — two runs labelled
  with different effort produce identical requests.
- `clampThinkingLevel` degrades silently, **including all the way to `off`** on a non-reasoning model,
  with nothing recording the downgrade.
- Model selection is **fuzzy substring matching** preferring un-dated aliases by highest `localeCompare`.
  `--model opus` binds to whichever entry sorts highest in the installed catalog; the same CLI invocation
  across two package versions can select different models.
- The Codex catalog is gated on a **hardcoded client version string** that must be manually bumped.
- Anthropic cache pricing is detected by **float-equality heuristic** on the price table (exactly 1.25×
  input); a catalog regeneration that changes the ratio silently drops the model off that path.
- Provider stream implementations live in a **mutable module-global registry** (`api-registry.ts:40`,
  `:66`, `:96`); an extension can replace an implementation mid-process and nothing in the message or
  session file records which one ran.
- Model registries and auth caches are **time-based and process-global** — "a run started six minutes
  later can see a different model set."

**What is well done:** per-turn cost is computed from the price table and attached to
`AssistantMessage.usage.cost`; Anthropic 5m/1h cache-write pricing is blended from the provider-reported
breakdown; the routed/concrete model id is captured separately when the provider echoes a different one.
Cost accounting is real, but **session totals are recomputed on demand from in-memory messages, never
checkpointed** — so after compaction they are only as good as the loaded window, and usage subtraction
clamps at zero, absorbing drift silently rather than surfacing it.

---

## 3. Sessions and compaction — the transcript is the strongest artifact in the system

**Append-only by construction.** `_appendEntry` → `appendFileSync` (`session-manager.ts:1472-1482`).
Full-file rewrites occur only on migration, corruption reset, `flushNow()`, and fork. Entries form a tree
via `id`/`parentId`; `branch(id)` is non-destructive in-place branching.

**Compaction is lossy for the model, not for the record.** Trigger is
`contextTokens > contextWindow - reserveTokens` (`compaction.ts:229-233`), defaults
`{enabled:true, reserveTokens:16384, keepRecentTokens:20000}`. A `CompactionEntry` is **appended**
carrying `summary`, `firstKeptEntryId`, and `tokensBefore`; nothing is deleted. Context assembly walks
`parentId` from leaf to root and emits `[summary, ...entries from firstKeptEntryId onward]`
(`session-manager.ts:554-588`). **The dropped span is therefore exactly reconstructible after the fact.**

This is the system's best property for empirical work, and it is worth stating plainly against the
weaknesses elsewhere.

**But the loss is not measured, and the summarizer's own view is lossy:**

- `CompactionEntry` records `tokensBefore` but **no `tokensAfter`, no dropped-entry count, no dropped-token
  count** — compression ratio must be recomputed by replay.
- The summarizer sees tool results **truncated to 2,000 chars**, images dropped, non-text blocks filtered.
  A long output that drove a decision can be invisible to the summarizer though present in the transcript
  — second-order loss.
- **An empty or whitespace summary is accepted silently**; only `stopReason === "error"` throws. A refused
  summarization can commit a near-empty entry that permanently replaces the dropped span in context.
- **Only the last compaction on a path is honored**; older summaries survive only transitively as text the
  update prompt was *asked* (not guaranteed) to carry forward.
- Summarization `max_tokens` is a fixed fraction of `reserveTokens`, so lowering `reserveTokens` to delay
  compaction simultaneously shrinks the summary budget — two knobs coupled in a non-obvious direction.
- `CompactionDetails.readFiles` is **dead data** — no code path populates it.

**Durability edge cases:** malformed JSONL lines are silently skipped **with no counter or marker**, so a
torn append removes an entry and orphans its children; a file parsing to zero entries is truncated and
replaced; migration mutates the original in place with no pre-migration copy; a session from a *future*
version loads unmigrated with no warning; `src/migrations.ts` swallows every error and reports success.

**Forking, as an A/B mechanism, is real but sharp-edged.** A persisted fork writes a new file containing
only the root→leaf path with `parentSession` provenance; sibling branches are not copied. In-memory
`createBranchedSession` is **destructive** — it replaces the live session's entries with the single path
(asserted at `test/session-manager/tree-traversal.test.ts:452-456`). A `SessionManager` holds exactly one
`leafId`, so concurrent A/B requires separate managers and files.

**No re-execution engine exists.** "Replay" in this codebase means daemon UI event replay. A session file
is a transcript of what happened, not a program that can be re-run. Combined with the absence of a seed,
**a compaction is an irreversible, non-reproducible transformation.**

---

## 4. Process topology and the RLM spawn ledger — where the engineering rigor went

The spawn ledger (`src/modes/daemon/rlm-ledger.ts`, HEAD commit #1387) is an append-only versioned JSONL
log with **append-time invariant enforcement** ("never write what the reader rejects"), forward-compatible
skipping of unknown ops at `v:1` while `v!==1` fails loudly, tolerance of one torn final line with
truncation before the next append (interior malformed lines stay fail-closed), canonicalised session paths,
and documented multi-writer `O_APPEND` semantics. Depth monotonicity is verified only between
ledger-known depths, dropping a contradictory edge rather than failing the whole family.

This is careful, well-tested durable-log engineering — `test/rlm-ledger.test.ts` covers seeding, torn
writes, UTF-8 truncation, races, bounds, orphans, and forward compatibility.

**The observation worth carrying forward:** that discipline was applied to *process identity*, not to the
*learning* state. The harness store, by contrast, is a whole-file overwrite with a second unjournaled
writer (`FINDINGS.md` §5). The codebase demonstrably knows how to build an auditable append-only log; it
did not build one for the thing it calls self-improvement.

---

## 5. Skills — capability without provenance

**Discovery** is two layers that do not share a code path: path resolution in `PackageManager`
(project → user → builtin, first-wins by path, `package-manager.ts:2207-2274`, `:2336-2338`) and a
filesystem walk in `skills.ts:280-387`. A directory containing `SKILL.md` is a terminal skill root —
nested `SKILL.md` files below it are unreachable (`skills.ts:327`).

**Loading is asymmetric, and this is the right design:** skill **descriptions** are loaded eagerly into
the system prompt at session start; skill **bodies** are loaded lazily on invocation. Description/body
separation is plain YAML frontmatter vs. remainder.

**But there is no provenance of any kind:**

- **No per-skill versioning.** "Which version of the `pdf` skill was in effect for this run?" is
  unanswerable from anything the system records.
- **No skill usage telemetry** — no counter, no event, no log of which skill was consulted. You cannot
  compute skill hit rate, cannot tell whether a skill helped, and cannot attribute an outcome to a skill.
- **Skills are namespaced only by a flat global name** — no source prefix, no `builtin:` qualifier.
- **The roster is a function of ambient auth state**: bundled websearch is off unless enabled, and
  MCP-backed builtins auto-disable based on login state. *Two runs on the same commit with the same
  settings can see different skill sets.*
- The bundled-skills path is **build-shape-dependent**, so the effective builtin set varies with how the
  binary was produced.

**Failure modes are warnings, not errors, throughout:** malformed skill names still ship to the model; an
over-length description (`MAX_DESCRIPTION_LENGTH=1024`) warns and is emitted in full; a Python skill whose
package files are missing degrades silently to a markdown skill; two skills sharing a Python import name
leave the second advertised in the prompt but unregistered for kernel bootstrap; `disable-model-invocation`
uses strict boolean equality, so YAML `"true"` (quoted string) silently means false. Discovery has several
silent-skip paths (`.gitignore`/`.ignore`/`.fdignore` matchers, dotfiles, `node_modules`), so a skill can
vanish from a run with no user-visible diagnostic.

**Prompt cost grows linearly and unboundedly** with installed skill count — description tokens are spent
on every request for every visible skill, with no cap and no truncation.

**Trust boundary: there is none.** No sandbox, signature check, allowlist, or content scan on any skill;
the only control is filesystem trust. Consistent with the README's accurate "not a security sandbox"
warning. Harness-authored skills (`rlm.harness.create_skill`) accept arbitrary content with **no
execution-surface validation** — a model can persist an entry naming any importable module and any call
pattern, and that entry is summarised into future prompts. This is a distinct mechanism from filesystem
skills and shares none of their discovery or validation path.
