# Test 05 - persisted model/configuration inventory

## RECORDED PER SESSION
- `cwd`
- `id`
- `rlmDepth`
- `timestamp`
- `type`
- `version`

## RECORDED AS CHANGE EVENT
- `model_change` -> `provider`, `modelId`
- `thinking_level_change` -> `thinkingLevel`
- `service_tier_change` -> `serviceTier`

## RECORDED PER ASSISTANT RESPONSE (always)
- `api`
- `content`
- `model`
- `provider`
- `role`
- `stopReason`
- `timestamp`
- `usage`

## RECORDED PER ASSISTANT RESPONSE (only when the provider supplies it)
- `responseId`
- `responseModel`

## NOT RECORDED
- temperature
- seed
- topP / topK sampling params
- model revision / snapshot
- model catalog hash/version
- full effective system prompt
- system prompt hash
- harness snapshot per request
- harness hash per request
- per-response thinking level
- per-response service tier
- tool versions
- skill versions
- provider baseUrl per response

## LATENT / PROVIDER-HIDDEN
- the provider's own default sampling parameters (temperature/top_p/penalties) applied server-side
- the concrete weight snapshot behind an alias model id when the provider does not echo one
- routing decisions inside a gateway that does not populate chunk.model
- server-side prompt-cache state that changes cacheRead/cacheWrite between otherwise identical runs
- provider-side safety/system injections not visible in the request payload
