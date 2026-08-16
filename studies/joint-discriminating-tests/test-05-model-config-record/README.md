# Test 05 — Effective model / configuration record

## Question

Exactly what does Prime Agent persist about model and configuration identity,
and where is the reproducibility boundary?

The brief is explicit that the answer must not be "configuration recorded" or
"configuration absent" — it must be a boundary.

## Hypothesis alternatives

| | Hypothesis |
| --- | --- |
| **H0** | Records are sufficient to establish controlled run equivalence. |
| **H1** | Records establish *nominal* configuration (which provider/model/level was in force) but not *effective* configuration (sampling, snapshot, prompt bytes, harness state). |
| **H2** | Configuration is effectively unrecorded. |

## Design

A persisted session drives every credential-free configuration transition
available, then is **reloaded from disk** and inventoried. Everything after the
reload reads only the file.

Transitions exercised: provider selection, requested model, model change
(model A → model B), thinking-level change (`medium` → `high`), three
service-tier requests, two assistant responses, one response carrying a routed
`responseModel` that differs from the requested model, one response carrying a
provider `responseId`, plus usage and stop reason on both.

**The service-tier sequence deserves its own note.** An earlier version of this
probe passed `"standard"`, which is *not* in the `ServiceTier` union
(`"auto" | "default" | "flex" | "scale" | "priority" | null`); TypeScript would
have rejected it, but `studies/` was outside the repository's `tsconfig`
include, so nothing checked it and the value flowed through at runtime. That
made the original tier evidence invalid. A `studies/joint-discriminating-tests/tsconfig.json`
now type-checks the probes — it surfaced eight diagnostics at `91ce174`
(test-01 ×1, test-02 ×1, test-04 ×5, test-05 ×1) — and the sequence was redone
with valid values to separate three distinct cases:

| Request | Effective | Event written | What is lost |
| --- | --- | --- | --- |
| `flex` | `flex` | `flex` | nothing |
| `priority` | `default` (model lacks fast-mode support) | `default` | **the requested value** — the record says `default`, not `priority` |
| `priority` again | `default` (already current) | **none** | the entire request |

**Representing a routed model without credentials.** The faux provider
overwrites `message.model` with the requested id (`faux.ts:253-263`), but
`structuredClone` preserves `responseModel` — the field the type reserves for
"concrete `chunk.model` when different from the requested `model`"
(`packages/ai/src/types.ts:231`). Setting it on the returned message therefore
represents a genuine routed-vs-requested divergence.

## Source anchors

| Anchor | What it establishes |
| --- | --- |
| `packages/coding-agent/src/core/session-manager.ts:75-85` | `SessionHeader` fields — no provider/model/sampling. |
| `packages/coding-agent/src/core/session-manager.ts:110-124` | `ThinkingLevelChangeEntry`, `ServiceTierChangeEntry`, `ModelChangeEntry{provider, modelId}`. |
| `packages/ai/src/types.ts:225-232` | `AssistantMessage` — `responseModel` and `responseId` are optional. |
| `packages/coding-agent/src/core/agent-session.ts:6852-6874` | `setThinkingLevel` clamps, then persists **only if the effective level changed**. |
| `packages/coding-agent/src/core/agent-session.ts:6876-6900` | `setServiceTier` maps `priority` → `default` when the model lacks fast-mode support, and persists only the effective value on change. |
| `packages/coding-agent/src/core/agent-session.ts:4276-4315` | The system prompt is rebuilt in memory; nothing persists its bytes or a hash. |

## Exact command

```bash
npx tsx studies/joint-discriminating-tests/test-05-model-config-record/run.ts
```

## Raw output

```
[PASS] T05.1: the session reloads from disk -- entries=9
[PASS] T05.2: model changes are persisted as typed change events carrying provider + modelId -- [{"provider":"faux","modelId":"faux-requested"},{"provider":"faux","modelId":"faux-second"}]
[PASS] T05.3: thinking-level changes are persisted as typed change events -- ["medium","high"]
[PASS] T05.4: service-tier changes are persisted as typed change events -- ["flex","default"]
[PASS] T05.4b: CLAMPED request: `priority` was requested but only the effective `default` is recorded -- recorded tiers: ["flex","default"]; requested sequence was ["flex","priority","priority"]
[PASS] T05.4c: NO-OP request: a second `priority` request resolving to the already-current `default` writes no event at all -- three setServiceTier calls produced 2 change event(s)
[PASS] T05.4d: an ACCEPTED tier is recorded verbatim, so the loss is specific to clamping rather than general
[PASS] T05.5: each assistant response records provider, api and the requested model id
[PASS] T05.6: a routed/concrete responseModel that differs from the requested model IS persisted per response when the provider supplies it -- [{"model":"faux-requested","responseModel":"faux-concrete-routed-0925"},{"model":"faux-second","responseModel":null}]
[PASS] T05.7: a provider response id IS persisted per response when the provider supplies one -- ["resp_T05_FIXED_0001",null]
[PASS] T05.8: responseModel / responseId are OPTIONAL: the response that did not supply them records neither
[PASS] T05.9: usage and stopReason are persisted per response
[PASS] T05.abs.*: NOT RECORDED: temperature, seed, topP/topK, model revision/snapshot,
       model catalog hash/version, full effective system prompt, system prompt hash,
       harness snapshot per request, harness hash per request, per-response thinking level,
       per-response service tier, tool versions, skill versions, provider baseUrl per response
```

## Inventory

### RECORDED PER SESSION
`type`, `version`, `id`, `timestamp`, `cwd`, `rlmDepth` (and optionally
`parentSession`, `git`). **No provider, model, or sampling configuration.**

### RECORDED AS CHANGE EVENT
| Entry | Fields |
| --- | --- |
| `model_change` | `provider`, `modelId` |
| `thinking_level_change` | `thinkingLevel` |
| `service_tier_change` | `serviceTier` |

Append-only and tree-positioned, so the *effective* configuration in force at
any entry is reconstructible by walking the branch. Critically, these record the
**effective value after clamping, and only when it actually changes**. Three
distinct outcomes, now separated (T05.4b–T05.4d):

- an **accepted** value is recorded verbatim;
- a **clamped** value still produces an event, but records the post-clamp value
  — the requested value is lost, so `priority` is indistinguishable from a
  direct `default` request;
- a **no-op** (clamped onto the already-current value) produces no event at all.

No *rejection* path was exercised; the earlier phrasing "clamped or rejected
requests leave no record" conflated the clamp and no-op cases and overstated
both. An audit was right to flag this.

### RECORDED PER ASSISTANT RESPONSE (always)
`role`, `content`, `api`, `provider`, `model`, `usage`, `stopReason`, `timestamp`

### RECORDED PER ASSISTANT RESPONSE (only when the provider supplies it)
`responseModel`, `responseId`

### NOT RECORDED
temperature · seed · topP/topK sampling params · model revision/snapshot · model
catalog hash/version · full effective system prompt · system prompt hash ·
harness snapshot per request · harness hash per request · per-response thinking
level · per-response service tier · tool versions · skill versions · provider
baseUrl per response

### LATENT / PROVIDER-HIDDEN
- the provider's own default sampling parameters applied server-side
- the concrete weight snapshot behind an alias model id when the provider does
  not echo one
- routing decisions inside a gateway that does not populate `chunk.model`
- server-side prompt-cache state that changes `cacheRead`/`cacheWrite` between
  otherwise identical runs
- provider-side safety/system injections not visible in the request payload

## Result — the reproducibility boundary

**H1.** RUNTIME-CONFIRMED.

**Reconstructible from the records:** which provider and requested model id was
in force at each point in the session tree; which thinking level and service
tier were in force; the concrete routed model *when the provider echoed one*;
the provider response id *when supplied*; per-response usage and stop reason.

**Not reconstructible from the records:** the *requested* value behind any
clamped configuration change, and the fact that a no-op request was made at all; the exact bytes of the system prompt sent
with any request; the harness state in force at any specific request;
temperature, top_p, seed; the model weight revision behind the model id; the
model catalog version the id was resolved against; tool and skill versions.

**Consequence:** the records are sufficient to say *which nominal configuration*
a turn ran under, and insufficient to establish that two runs were
*controlled-equivalent*.

## What this result DOES establish

- A field-level inventory, verified after a real persist-and-reload cycle, of
  what does and does not survive.
- That routed `responseModel` and provider `responseId` **are** persisted when
  present — so the per-response model-identity surface is better than "absent",
  but is provider-conditional.
- That change events capture *effective*, not *requested*, values — a real gap
  for reconstruction, since a clamped request is indistinguishable from a
  request never made.

## What this result DOES NOT establish

- That real providers populate `responseModel`/`responseId`. The faux provider
  was made to supply them precisely to test the *recording* path; whether any
  given real provider does is untested here.
- That the absent fields are absent by design, or that adding them would be
  correct. Only their absence **from the persisted session artifact** is
  established — not from every artifact the repository writes.
- Anything about *rejected* configuration requests. Only accepted, clamped and
  no-op tier requests were exercised.
- That real providers populate `responseModel`. It was injected into the
  synthetic response precisely to test the persistence path, not observed from
  real routing.
- Anything about configuration recorded outside the session file (settings
  files, daemon state, extension state). Only the session JSONL and its reload
  were inventoried.
- Anything about RLM child sessions, whose configuration is written by a
  different code path (`agent-session.ts:9056-9058`).
