# Unresolved Questions

1. **Kernel restoration:** Which real-world namespace objects survive worker restart, and how often do silently skipped names matter to task completion?
2. **Daemon continuity:** Does detach, supervisor restart, worker restart, and reattach preserve queued prompts, kernel state, harness state, schedules, and retained children together under controlled failure injection?
3. **Refinement causality:** Does a refinement improve later performance relative to the identical trajectory with refinement disabled, or merely correlate with a trajectory that was already improving?
4. **Evidence integrity:** Can a reviewer trace each refinement to exact transcript entries, tool results, failures, and validation outcomes? Current records do not require these links.
5. **Promotion:** What prevents a persuasive but wrong local lesson from being promoted globally? The inspected flow has immediate scoped application rather than candidate/review/promotion.
6. **Independent review:** Does using a separate model or fresh-context reviewer reduce self-confirming refinements enough to justify added cost?
7. **Generalization:** Do gains persist on held-out task variants, new sessions, different repositories, and different model/provider combinations?
8. **Accumulation:** How do prompt length, conflicts, stale facts, and instruction priority behave as harness entries accumulate? The overview truncates entries/content, which may make stored state present but behaviorally inactive.
9. **Rollback efficacy:** Can rollback restore behavior after downstream entries were derived from a bad refinement, or only restore the immediate record?
10. **Skill semantics:** Harness skill entries reference already installed callables. What process turns a learned procedure into reviewed executable code, and how is that code versioned with its evidence?
11. **Subagent reuse:** Are textual subagent specifications invoked consistently, and does retained child context outperform clean independent children?
12. **Compaction interaction:** Does refining before versus after compaction change which evidence is retained and the quality of edits?
13. **Autonomous process cleanup:** Are the two observed process-exit failures container-specific timing artifacts or a reproducible process-tree termination defect?
14. **Trust:** Which principals can write local/global harness files, session JSONL, skills, and extensions, and are permissions/symlink boundaries consistently enforced?
15. **Telemetry suitability:** Existing aggregate telemetry mentions tokens, turns, retries, and compactions, but does it preserve experiment assignment, refinement lineage, rollback, and held-out outcomes without leaking sensitive trajectory content?
16. **Upstream provenance:** No remote or tracking metadata exists in this checkout. Which upstream commit/branch, if any, corresponds to the baseline?
