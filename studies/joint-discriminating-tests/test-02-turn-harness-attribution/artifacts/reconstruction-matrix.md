| Dimension | `/refine` (TypeScript writer) | Evidence | Direct `rlm.harness` CRUD (Python writer) | Evidence |
| --- | --- | --- | --- | --- |
| position in the session tree | **RECONSTRUCTIBLE** | custom entry `prime-agent.refinement` carries id + parentId on the message spine | **NOT RECONSTRUCTIBLE** | no session entry is written at all |
| timestamp / ordering | **RECONSTRUCTIBLE** | entry.timestamp plus append order plus the refine_<UTC> id | **PARTIAL** | entry.updated_at is wall-clock only; it cannot be ordered against session entries with certainty |
| before state of the edited entry | **RECONSTRUCTIBLE** | appliedEdits[].before (null for a create, populated for update/delete) | **NOT RECONSTRUCTIBLE** | upsert overwrites in place; no prior value is retained anywhere |
| after state of the edited entry | **RECONSTRUCTIBLE** | appliedEdits[].after is a full entry snapshot | **PARTIAL** | current harness_state.json shows the latest value only; superseded values are lost |
| which messages preceded the mutation | **RECONSTRUCTIBLE** | message entries appended before the refinement entry | **NOT RECONSTRUCTIBLE** | no anchor exists in the session file to split before/after |
| which messages followed the mutation | **RECONSTRUCTIBLE** | message entries descending from the refinement entry | **NOT RECONSTRUCTIBLE** | same - no anchor |
| harness state applying to message A (edited entry only) | **RECONSTRUCTIBLE** | appliedEdits[].before gives the pre-mutation value of every touched entry | **NOT RECONSTRUCTIBLE** | no before value is recorded |
| harness state applying to message B (edited entry only) | **RECONSTRUCTIBLE** | appliedEdits[].after plus harness_state.json | **PARTIAL** | only if no later writer touched the same entry |
| COMPLETE effective harness state at message A / message B | **PARTIAL** | per-edit before/after only; no full-state snapshot or hash is persisted per turn, and a concurrent CRUD writer is invisible | **NOT RECONSTRUCTIBLE** | no snapshot, no event, no anchor |
| effective system prompt actually sent with each request | **NOT RECONSTRUCTIBLE** | assistant message entries record no systemPrompt and no prompt hash | **NOT RECONSTRUCTIBLE** | same |
