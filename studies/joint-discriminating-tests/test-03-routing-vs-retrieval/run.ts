/**
 * TEST 03 - Routing visibility vs programmatic retrieval.
 *
 * Question: when harness entries accumulate beyond what the default system-prompt
 * summary renders, is the omitted content ABSOLUTELY INVISIBLE, or is it merely
 * absent from the default routing summary while remaining retrievable?
 *
 * Five separable claims are scored independently:
 *   1 stored
 *   2 included in the default routing summary
 *   3 programmatically retrievable
 *   4 spontaneously retrieved by an agent   <- NOT TESTED HERE (needs a real model)
 *   5 successfully used during a task       <- NOT TESTED HERE (needs a real model)
 *
 * Run: npx tsx studies/joint-discriminating-tests/test-03-routing-vs-retrieval/run.ts
 */

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
	AssertionLog,
	environmentRecord,
	isolateAgentDir,
	settle,
	STUDY_ROOT,
	writeArtifact,
	writeJsonArtifact,
} from "../_lib/probe.js";

const AGENT_DIR = isolateAgentDir("t03");
const GLOBAL_HARNESS_DIR = join(AGENT_DIR, "harness");

const { fauxAssistantMessage, fauxToolCall } = await import("../../../packages/ai/src/index.js");
const { createHarness } = await import("../../../packages/coding-agent/test/suite/harness.js");
const { formatHarnessStateForPrompt, loadHarnessState } = await import(
	"../../../packages/coding-agent/src/core/refinement/index.js"
);
type Context = import("../../../packages/ai/src/index.js").Context;

const ART = "test-03-routing-vs-retrieval/artifacts";
const REPO_ROOT = join(STUDY_ROOT, "../..");
const RUNTIME_SRC = join(REPO_ROOT, "prime-agent-runtime/src");

const HIDDEN_FACT = "HIDDEN_HARNESS_FACT_83D2";
const HIDDEN_ID = "zz_late_sorting_fact";
/** DEFAULT_OVERVIEW_ENTRY_LIMIT in refinement.ts. */
const DEFAULT_LIMIT = 6;
const MEMORY_COUNT = 14;

const log = new AssertionLog();
const raw: Record<string, unknown> = { environment: environmentRecord() };

function python(source: string, env: Record<string, string> = {}): string {
	return execFileSync("python3", ["-c", source], {
		env: { ...process.env, PYTHONPATH: RUNTIME_SRC, RLM_GLOBAL_HARNESS_STATE_DIR: GLOBAL_HARNESS_DIR, ...env },
		encoding: "utf8",
	});
}

// ---------------------------------------------------------------------
// Phase 1 - accumulate more entries than the default summary can render.
// The hidden fact is placed where the default subset cannot reach it:
// formatHarnessStateForPrompt sorts by [path, title, id] and slices the
// first `maxEntriesPerKind`, so a late-sorting path/title is outside it.
// ---------------------------------------------------------------------
const seedSource = [
	"import rlm",
	`for i in range(${MEMORY_COUNT}):`,
	"    rlm.harness.create_memory(",
	"        title=f'Routine lesson {i:02d}',",
	"        content=f'Filler harness memory number {i:02d} used to force accumulation.',",
	"        id=f'aa_filler_{i:02d}',",
	"        path=f'aaa/filler',",
	"        global_=True,",
	"    )",
	"entry = rlm.harness.create_memory(",
	`    title='ZZ late sorting fact',`,
	`    content='${HIDDEN_FACT} = the deploy key lives in vault path ops/prime/deploy.',`,
	`    id='${HIDDEN_ID}',`,
	"    path='zzz/late',",
	"    global_=True,",
	")",
	"print(entry.id)",
].join("\n");
const seededId = python(seedSource).trim();

const globalState = loadHarnessState(GLOBAL_HARNESS_DIR, "global");
const storedEntry = globalState.entries.memory[HIDDEN_ID];

log.record("T03.1", "claim 1 STORED: the hidden fact is persisted in harness state", Boolean(storedEntry), `id=${seededId}`);

// ---------------------------------------------------------------------
// Phase 2 - the ACTUAL system prompt sent to the provider.
// ---------------------------------------------------------------------
const harness = await createHarness({ persistSession: true });
let sentSystemPrompt = "";
let toolObservedFullListing = "";

/**
 * A retrieval tool wired to the real production loader. Scripting the model's
 * decision to call it is unavoidable with a faux provider - so this measures
 * whether recovery through the agent tool loop WORKS, not whether a model would
 * choose to do it (claim 4, untested).
 */
const harnessLookupTool: AgentTool = {
	name: "harness_lookup",
	label: "Harness lookup",
	description: "List the full continual harness state, unbounded.",
	parameters: Type.Object({}),
	execute: async () => {
		const state = loadHarnessState(GLOBAL_HARNESS_DIR, "global");
		const listing = formatHarnessStateForPrompt(state, { maxEntriesPerKind: 1000, maxContentLength: 4000 });
		toolObservedFullListing = listing;
		return { content: [{ type: "text", text: listing }], details: {} };
	},
};

const toolHarness = await createHarness({ persistSession: true, tools: [harnessLookupTool] });

try {
	harness.setResponses([
		(context: Context) => {
			sentSystemPrompt = context.systemPrompt ?? "";
			return fauxAssistantMessage("noted");
		},
	]);
	await harness.session.prompt("what do you know?");
	await settle(40);

	const harnessSection = sentSystemPrompt.slice(sentSystemPrompt.indexOf("# Continual Harness State"));
	const renderedMemoryIds = [...harnessSection.matchAll(/- \[global:([a-z0-9_]+)\]/g)].map((match) => match[1]);
	const overflowLine = harnessSection.match(/- \+(\d+) more memory entries/);

	raw.defaultSummary = {
		systemPromptLength: sentSystemPrompt.length,
		harnessSectionLength: harnessSection.length,
		defaultEntryLimit: DEFAULT_LIMIT,
		memoryEntriesStored: Object.keys(globalState.entries.memory).length,
		memoryEntriesRendered: renderedMemoryIds.length,
		renderedMemoryIds,
		overflowLine: overflowLine?.[0] ?? null,
		hiddenFactInSystemPrompt: sentSystemPrompt.includes(HIDDEN_FACT),
		hiddenIdInSystemPrompt: sentSystemPrompt.includes(HIDDEN_ID),
	};

	log.record(
		"T03.2",
		`the default summary renders only ${DEFAULT_LIMIT} of ${MEMORY_COUNT + 1} stored memory entries`,
		renderedMemoryIds.length === DEFAULT_LIMIT,
		`rendered=${renderedMemoryIds.length} stored=${Object.keys(globalState.entries.memory).length}`,
	);
	log.record(
		"T03.3",
		"claim 2 NOT IN DEFAULT ROUTING SUMMARY: the hidden fact is absent from the system prompt actually sent",
		!sentSystemPrompt.includes(HIDDEN_FACT) && !sentSystemPrompt.includes(HIDDEN_ID),
	);
	log.record(
		"T03.4",
		"the omission is signalled, not silent: an explicit overflow count is rendered",
		Boolean(overflowLine),
		overflowLine?.[0] ?? "no overflow line",
	);

	// -----------------------------------------------------------------
	// Phase 3 - programmatic retrieval paths (claim 3).
	// -----------------------------------------------------------------
	const adjustableOverview = formatHarnessStateForPrompt(globalState, { maxEntriesPerKind: 1000 });
	const pyList = python(
		`import rlm, json
rows = rlm.harness.list('memory', global_=True)
print(json.dumps({'count': len(rows), 'hit': any('${HIDDEN_FACT}' in r.content for r in rows)}))`,
	);
	const pyGet = python(
		`import rlm, json
e = rlm.harness.get('memory', '${HIDDEN_ID}', global_=True)
print(json.dumps({'found': e is not None, 'hit': bool(e and '${HIDDEN_FACT}' in e.content)}))`,
	);
	const pySnapshot = python(
		`import rlm, json
snap = rlm.harness.snapshot(global_=True)
print(json.dumps({'hit': '${HIDDEN_FACT}' in json.dumps(snap)}))`,
	);
	const pyOverviewDefault = python(
		`import rlm, json
text = rlm.harness.overview(global_=True)
print(json.dumps({'hit': '${HIDDEN_FACT}' in text, 'len': len(text)}))`,
	);
	const pyOverviewBounded = python(
		`import rlm, json
text = rlm.harness.overview(global_=True, max_entries_per_kind=${DEFAULT_LIMIT})
print(json.dumps({'hit': '${HIDDEN_FACT}' in text, 'len': len(text)}))`,
	);
	const pyGetHarnessState = python(
		`import rlm, json
state = rlm.get_harness_state(global_=True)
print(json.dumps({'hit': '${HIDDEN_FACT}' in json.dumps(state.snapshot())}))`,
	);

	const retrieval = {
		tsLoadHarnessState: JSON.stringify(globalState).includes(HIDDEN_FACT),
		tsAdjustableOverview: adjustableOverview.includes(HIDDEN_FACT),
		pythonList: JSON.parse(pyList),
		pythonGet: JSON.parse(pyGet),
		pythonSnapshot: JSON.parse(pySnapshot),
		pythonOverviewDefault20: JSON.parse(pyOverviewDefault),
		pythonOverviewBounded6: JSON.parse(pyOverviewBounded),
		pythonGetHarnessState: JSON.parse(pyGetHarnessState),
	};
	raw.retrieval = retrieval;

	log.record("T03.5", "claim 3 RETRIEVABLE via TypeScript loadHarnessState()", retrieval.tsLoadHarnessState);
	log.record(
		"T03.6",
		"claim 3 RETRIEVABLE via the same renderer with a raised entry limit (adjustable overview)",
		retrieval.tsAdjustableOverview,
	);
	log.record("T03.7", "claim 3 RETRIEVABLE via Python rlm.harness.list()", retrieval.pythonList.hit);
	log.record("T03.8", "claim 3 RETRIEVABLE via Python rlm.harness.get()", retrieval.pythonGet.hit);
	log.record("T03.9", "claim 3 RETRIEVABLE via Python rlm.harness.snapshot()", retrieval.pythonSnapshot.hit);
	log.record("T03.10", "claim 3 RETRIEVABLE via Python rlm.get_harness_state()", retrieval.pythonGetHarnessState.hit);
	log.record(
		"T03.11",
		"the Python overview() default (20/kind) DOES surface the fact - the bound differs from the TS prompt renderer's 6/kind",
		retrieval.pythonOverviewDefault20.hit,
	);
	log.record(
		"T03.12",
		"bounding, not storage, is what hides the fact: the same Python overview at limit 6 also omits it",
		!retrieval.pythonOverviewBounded6.hit,
	);

	// -----------------------------------------------------------------
	// Phase 4 - end-to-end recovery through the agent tool loop.
	// This scripts the model's decision (faux provider), so it establishes
	// recoverability, NOT spontaneous retrieval.
	// -----------------------------------------------------------------
	let toolTurnSystemPrompt = "";
	toolHarness.setResponses([
		(context: Context) => {
			toolTurnSystemPrompt = context.systemPrompt ?? "";
			return fauxAssistantMessage([fauxToolCall("harness_lookup", {}, { id: "t03-lookup" })], {
				stopReason: "toolUse",
			});
		},
		fauxAssistantMessage(`Recovered: ${HIDDEN_FACT}`),
	]);
	await toolHarness.session.prompt("inspect the FULL continual harness state and report the hidden fact");
	await settle(60);

	const toolMessages = toolHarness.session.messages;
	const toolResultText = JSON.stringify(toolMessages.filter((message) => message.role === "toolResult"));

	raw.agentLoopRecovery = {
		scriptedDecision: true,
		toolCallExecuted: toolObservedFullListing.length > 0,
		hiddenFactInToolResult: toolResultText.includes(HIDDEN_FACT),
		hiddenFactInToolTurnSystemPrompt: toolTurnSystemPrompt.includes(HIDDEN_FACT),
		note: "The faux provider supplies the tool call, so this measures the retrieval path through the agent loop, not model behaviour.",
	};

	log.record(
		"T03.13",
		"claim 3 (end-to-end): a tool call inside the agent loop recovers the hidden fact into the conversation",
		toolResultText.includes(HIDDEN_FACT),
	);
	log.record(
		"T03.14",
		"the tool turn's own system prompt still omitted the fact (recovery came from the tool, not the prompt)",
		!toolTurnSystemPrompt.includes(HIDDEN_FACT),
	);

	writeArtifact(`${ART}/default-system-prompt.txt`, sentSystemPrompt);
	writeArtifact(`${ART}/default-harness-section.txt`, harnessSection);
	writeArtifact(`${ART}/adjustable-overview.txt`, adjustableOverview);
	writeArtifact(`${ART}/tool-observed-full-listing.txt`, toolObservedFullListing);
	writeArtifact(`${ART}/python-overview-default.txt`, python(`import rlm; print(rlm.harness.overview(global_=True))`));
} finally {
	harness.cleanup();
	toolHarness.cleanup();
}

raw.untestedClaims = {
	claim4_spontaneouslyRetrievedByAgent: "NOT TESTED - requires a real model; the faux provider's decisions are authored by the probe.",
	claim5_successfullyUsedDuringTask: "NOT TESTED - requires a real model and a held-out task.",
};
raw.assertions = log.entries;
writeJsonArtifact(`${ART}/raw-result.json`, raw);
rmSync(AGENT_DIR, { recursive: true, force: true });

console.log(`\nall assertions passed: ${log.allPassed}`);
process.exit(log.allPassed ? 0 : 1);
