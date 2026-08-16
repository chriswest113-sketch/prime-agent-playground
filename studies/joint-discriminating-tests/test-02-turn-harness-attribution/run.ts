/**
 * TEST 02 - Turn-level harness attribution.
 *
 * Question: how much of the harness mutation timeline can an independent
 * investigator reconstruct from persisted session + harness records?
 *
 * Two writers are compared over the SAME session shape:
 *   A) message A -> TypeScript `/refine` applies one distinctive harness edit -> message B
 *   B) message A -> direct Python `rlm.harness` CRUD mutation           -> message B
 *
 * Run: npx tsx studies/joint-discriminating-tests/test-02-turn-harness-attribution/run.ts
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	AssertionLog,
	environmentRecord,
	isolateAgentDir,
	messageText,
	settle,
	STUDY_ROOT,
	writeArtifact,
	writeJsonArtifact,
} from "../_lib/probe.js";

const AGENT_DIR = isolateAgentDir("t02");

const { fauxAssistantMessage } = await import("../../../packages/ai/src/index.js");
const { createHarness } = await import("../../../packages/coding-agent/test/suite/harness.js");
type Harness = Awaited<ReturnType<typeof createHarness>>;

const ART = "test-02-turn-harness-attribution/artifacts";
const REPO_ROOT = join(STUDY_ROOT, "../..");
const RUNTIME_SRC = join(REPO_ROOT, "prime-agent-runtime/src");

const log = new AssertionLog();
const raw: Record<string, unknown> = { environment: environmentRecord() };

interface JsonlEntry {
	type: string;
	id?: string;
	parentId?: string | null;
	timestamp?: string;
	customType?: string;
	message?: { role?: string; content?: unknown };
	[key: string]: unknown;
}

function readJsonl(path: string): JsonlEntry[] {
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as JsonlEntry);
}

/** Compact, comparable view of a session JSONL for the reconstruction matrix. */
function summarizeJsonl(entries: JsonlEntry[]): Array<Record<string, unknown>> {
	return entries.map((entry, index) => ({
		index,
		type: entry.type,
		id: entry.id,
		parentId: entry.parentId ?? null,
		timestamp: entry.timestamp,
		customType: entry.customType,
		role: entry.message?.role,
		text: entry.message ? messageText(entry.message).slice(0, 120) : undefined,
	}));
}

/**
 * Nothing is queued up front. Each phase appends exactly the response it
 * consumes, so the shared faux queue cannot hand a conversational reply to the
 * /refine planning call.
 */
async function buildSession(): Promise<Harness> {
	const harness = await createHarness({ persistSession: true });
	harness.setResponses([]);
	return harness;
}

/** A /refine proposal reply for the faux provider to return verbatim. */
function proposal(edit: Record<string, unknown>, summary: string) {
	return fauxAssistantMessage(
		JSON.stringify({
			summary,
			rationale: "Probe requires a single distinctive, attributable edit.",
			expectedOutcome: "The edit is attributable to a point in the session tree.",
			edits: [edit],
		}),
	);
}

// =====================================================================
// WRITER A - TypeScript /refine
// =====================================================================
const harnessA = await buildSession();
let refineRecord: Record<string, unknown> = {};
try {
	// Setup refinement (before message A) creates v1 of the entry, so the
	// distinctive between-A-and-B edit can be an UPDATE and therefore exercise
	// before-state reconstruction. A create edit legitimately has no before value.
	harnessA.appendResponses([
		proposal(
			{
				action: "create",
				kind: "memory",
				id: "t02_distinctive_edit",
				title: "T02 distinctive edit",
				content: "T02_HARNESS_EDIT_MARKER_V1 seeded before message A.",
				path: "study/t02",
				reason: "probe setup",
			},
			"Seed the T02 entry before message A",
		),
	]);
	const setupResult = await harnessA.session.refine({ instructions: "probe: seed entry" });
	await settle(30);

	harnessA.appendResponses([fauxAssistantMessage("assistant reply to message A (refine)")]);
	await harnessA.session.prompt("message A: establish the baseline");
	await settle(40);

	harnessA.appendResponses([
		proposal(
			{
				action: "update",
				kind: "memory",
				id: "t02_distinctive_edit",
				title: "T02 distinctive edit",
				content: "T02_HARNESS_EDIT_MARKER_A1 written by the TypeScript /refine writer between A and B.",
				path: "study/t02",
				reason: "probe",
			},
			"Record the distinctive T02 harness edit",
		),
	]);
	const refineResult = await harnessA.session.refine({ instructions: "probe: one distinctive edit" });
	await settle(30);

	harnessA.appendResponses([fauxAssistantMessage("assistant reply to message B (refine)")]);
	await harnessA.session.prompt("message B: after the refinement");
	await settle(60);

	const sessionFileA = harnessA.sessionManager.getSessionFile()!;
	const artifactDirA = harnessA.sessionManager.getSessionArtifactDir()!;
	const harnessStatePathA = join(artifactDirA, "harness", "harness_state.json");
	const entriesA = readJsonl(sessionFileA);
	const summaryA = summarizeJsonl(entriesA);

	const refinementEntries = entriesA.filter(
		(entry) => entry.type === "custom" && entry.customType === "prime-agent.refinement",
	);
	// The distinctive between-A-and-B mutation, identified by the id the apply
	// phase returned - not merely "the first refinement entry".
	const refineEntry = refinementEntries.find(
		(entry) => (entry.data as { id?: string } | undefined)?.id === refineResult.id,
	);
	const refineIndex = refineEntry ? entriesA.indexOf(refineEntry) : -1;
	const messageEntries = entriesA.filter((entry) => entry.type === "message");
	const before = messageEntries.filter((entry) => entriesA.indexOf(entry) < refineIndex);
	const after = messageEntries.filter((entry) => entriesA.indexOf(entry) > refineIndex);

	const persistedRefinement = refineEntry?.data as
		| {
				id: string;
				appliedEdits: Array<Record<string, unknown>>;
				harnessStatePath?: string;
				scope?: string;
		  }
		| undefined;
	const persistedEdit = persistedRefinement?.appliedEdits?.[0];

	// Parent-chain reconstruction: does the refinement entry sit on the message
	// spine, with message-B entries descending from it?
	const byId = new Map(entriesA.filter((entry) => entry.id).map((entry) => [entry.id!, entry]));
	function ancestors(id: string | null | undefined): string[] {
		const chain: string[] = [];
		let cursor = id ?? null;
		while (cursor) {
			chain.push(cursor);
			cursor = byId.get(cursor)?.parentId ?? null;
		}
		return chain;
	}
	const firstAfterId = after[0]?.id;
	const refineOnSpine = Boolean(refineEntry?.id && firstAfterId && ancestors(firstAfterId).includes(refineEntry.id));

	const harnessStateA = JSON.parse(readFileSync(harnessStatePathA, "utf8")) as {
		entries: Record<string, Record<string, Record<string, unknown>>>;
		refinements: Array<Record<string, unknown>>;
	};

	refineRecord = {
		sessionFile: sessionFileA,
		harnessStatePath: harnessStatePathA,
		jsonlEntryTypes: [...new Set(entriesA.map((entry) => entry.type))],
		jsonlSummary: summaryA,
		refinementEntry: refineEntry,
		refinementEntryIndex: refineIndex,
		messagesBeforeRefinement: before.map((entry) => messageText(entry.message).slice(0, 80)),
		messagesAfterRefinement: after.map((entry) => messageText(entry.message).slice(0, 80)),
		refinementOnMessageSpine: refineOnSpine,
		persistedBeforeState: persistedEdit?.before ?? null,
		persistedAfterState: persistedEdit?.after ?? null,
		harnessStateEntry: harnessStateA.entries.memory?.t02_distinctive_edit,
		harnessStateRefinements: harnessStateA.refinements,
		refineResultId: refineResult.id,
		setupRefineResultId: setupResult.id,
		refinementEntryCount: refinementEntries.length,
		setupCreateEditHadBeforeKey: "before" in (setupResult.appliedEdits[0] as object),
	};

	log.record(
		"T02.A0",
		"a create edit records NO before key (correct: nothing existed), so before-state reconstruction must be tested with an update",
		!("before" in JSON.parse(JSON.stringify(setupResult.appliedEdits[0]))),
	);

	log.record("T02.A1", "the /refine mutation is recorded in the session JSONL", Boolean(refineEntry));
	log.record(
		"T02.A2",
		"the refinement entry has a tree position (id + parentId) and a timestamp",
		Boolean(refineEntry?.id && refineEntry?.parentId !== undefined && refineEntry?.timestamp),
		`id=${refineEntry?.id} parentId=${refineEntry?.parentId} ts=${refineEntry?.timestamp}`,
	);
	log.record(
		"T02.A3",
		"messages before and after the refinement are separable by tree/append order",
		before.length > 0 && after.length > 0,
		`before=${before.length} after=${after.length}`,
	);
	log.record(
		"T02.A4",
		"post-refinement messages descend from the refinement entry in the parent chain",
		refineOnSpine,
	);
	log.record(
		"T02.A5",
		"the refinement record carries an explicit before state for the edited entry",
		persistedEdit !== undefined && "before" in persistedEdit,
		`before=${JSON.stringify(persistedEdit?.before ?? null)}`,
	);
	log.record(
		"T02.A6",
		"the refinement record carries an explicit after state for the edited entry",
		Boolean(persistedEdit?.after),
	);
	log.record(
		"T02.A7",
		"the refinement record does NOT contain a full harness snapshot (only per-edit before/after)",
		persistedEdit !== undefined && !("harnessSnapshot" in (persistedRefinement ?? {})),
		`RefinementResult keys: ${JSON.stringify(Object.keys(persistedRefinement ?? {}).sort())}`,
	);

	// Is a complete effective system prompt / harness hash recorded per request?
	const assistantEntries = entriesA.filter((entry) => entry.type === "message" && entry.message?.role === "assistant");
	const assistantKeys = [...new Set(assistantEntries.flatMap((entry) => Object.keys(entry.message as object)))].sort();
	refineRecord.assistantMessageKeys = assistantKeys;
	log.record(
		"T02.A8",
		"no assistant message entry records the effective system prompt or a harness hash",
		!assistantKeys.some((key) => /systemPrompt|harness|promptHash/i.test(key)),
		`assistant message keys: ${JSON.stringify(assistantKeys)}`,
	);

	writeArtifact(`${ART}/writer-a-session.jsonl`, readFileSync(sessionFileA, "utf8"));
	writeArtifact(`${ART}/writer-a-harness_state.json`, readFileSync(harnessStatePathA, "utf8"));
} finally {
	harnessA.cleanup();
}

// =====================================================================
// WRITER B - direct Python rlm.harness CRUD
// =====================================================================
const harnessB = await buildSession("crud");
let crudRecord: Record<string, unknown> = {};
try {
	await harnessB.session.prompt("message A: establish the baseline");
	await settle(40);

	const sessionFileB = harnessB.sessionManager.getSessionFile()!;
	const artifactDirB = harnessB.sessionManager.getSessionArtifactDir()!;
	const harnessDirB = join(artifactDirB, "harness");
	const jsonlBeforeCrud = readJsonl(sessionFileB);

	// Direct CRUD writer, exactly as the kernel would drive it: the local harness
	// store is addressed through RLM_HARNESS_STATE_DIR, the same env var
	// agent-session.ts sets for the RLM kernel.
	const pythonSource = [
		"import json, rlm",
		"entry = rlm.harness.create_memory(",
		"    title='T02 distinctive edit',",
		"    content='T02_HARNESS_EDIT_MARKER_B1 written by the direct Python CRUD writer.',",
		"    id='t02_distinctive_edit',",
		"    path='study/t02',",
		")",
		"print(json.dumps({'id': entry.id, 'source': entry.source, 'version': entry.version,",
		"                  'created_at': entry.created_at, 'updated_at': entry.updated_at,",
		"                  'scope': entry.scope}))",
	].join("\n");
	const pythonOut = execFileSync("python3", ["-c", pythonSource], {
		env: {
			...process.env,
			PYTHONPATH: RUNTIME_SRC,
			RLM_HARNESS_STATE_DIR: harnessDirB,
		},
		encoding: "utf8",
	});
	const crudEntryInfo = JSON.parse(pythonOut.trim()) as Record<string, unknown>;

	harnessB.appendResponses([fauxAssistantMessage("assistant reply to message B (crud)")]);
	await harnessB.session.prompt("message B: after the CRUD mutation");
	await settle(60);

	const jsonlAfter = readJsonl(sessionFileB);
	const newEntries = jsonlAfter.slice(jsonlBeforeCrud.length);
	const harnessStatePathB = join(harnessDirB, "harness_state.json");
	const harnessStateB = JSON.parse(readFileSync(harnessStatePathB, "utf8")) as {
		entries: Record<string, Record<string, Record<string, unknown>>>;
		refinements: Array<Record<string, unknown>>;
	};
	const crudEntry = harnessStateB.entries.memory?.t02_distinctive_edit;

	const anyHarnessEntryInJsonl = jsonlAfter.some((entry) => {
		const text = JSON.stringify(entry);
		return text.includes("T02_HARNESS_EDIT_MARKER_B1") || text.includes("t02_distinctive_edit");
	});

	crudRecord = {
		sessionFile: sessionFileB,
		harnessStatePath: harnessStatePathB,
		pythonStdout: crudEntryInfo,
		jsonlSummary: summarizeJsonl(jsonlAfter),
		jsonlEntryTypesAfterCrud: [...new Set(newEntries.map((entry) => entry.type))],
		anyHarnessEntryInJsonl,
		harnessStateEntry: crudEntry,
		harnessStateRefinements: harnessStateB.refinements,
	};

	log.record(
		"T02.B1",
		"the direct Python CRUD mutation persisted to the session-local harness store",
		Boolean(crudEntry),
		`source=${String(crudEntry?.source)} version=${String(crudEntry?.version)}`,
	);
	log.record(
		"T02.B2",
		"the direct CRUD mutation appends NO entry to the session JSONL",
		!anyHarnessEntryInJsonl,
	);
	log.record(
		"T02.B3",
		"the direct CRUD mutation records NO refinement event in harness_state.json",
		harnessStateB.refinements.length === 0,
		`refinements=${harnessStateB.refinements.length}`,
	);
	log.record(
		"T02.B4",
		"the CRUD-written entry retains a wall-clock timestamp but no session-tree anchor",
		Boolean(crudEntry?.updated_at) && !("parentId" in (crudEntry ?? {})) && !("session_id" in (crudEntry ?? {})),
		`entry keys: ${JSON.stringify(Object.keys(crudEntry ?? {}).sort())}`,
	);
	log.record(
		"T02.B5",
		"the CRUD-written entry carries no before state (prior value is unrecoverable from records)",
		crudEntry !== undefined && !("before" in crudEntry),
	);
	log.record(
		"T02.B6",
		"writer identity survives only as the coarse `source` field, not as an actor/turn id",
		crudEntry?.source === "agent",
		`source=${String(crudEntry?.source)}`,
	);

	writeArtifact(`${ART}/writer-b-session.jsonl`, readFileSync(sessionFileB, "utf8"));
	writeArtifact(`${ART}/writer-b-harness_state.json`, readFileSync(harnessStatePathB, "utf8"));
} finally {
	harnessB.cleanup();
}

// =====================================================================
// Reconstruction matrix
// =====================================================================
type Verdict = "RECONSTRUCTIBLE" | "PARTIAL" | "NOT RECONSTRUCTIBLE";
interface Row {
	dimension: string;
	refine: Verdict;
	refineEvidence: string;
	crud: Verdict;
	crudEvidence: string;
}

const matrix: Row[] = [
	{
		dimension: "position in the session tree",
		refine: "RECONSTRUCTIBLE",
		refineEvidence: "custom entry `prime-agent.refinement` carries id + parentId on the message spine",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "no session entry is written at all",
	},
	{
		dimension: "timestamp / ordering",
		refine: "RECONSTRUCTIBLE",
		refineEvidence: "entry.timestamp plus append order plus the refine_<UTC> id",
		crud: "PARTIAL",
		crudEvidence: "entry.updated_at is wall-clock only; it cannot be ordered against session entries with certainty",
	},
	{
		dimension: "before state of the edited entry",
		refine: "RECONSTRUCTIBLE",
		refineEvidence: "appliedEdits[].before (null for a create, populated for update/delete)",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "upsert overwrites in place; no prior value is retained anywhere",
	},
	{
		dimension: "after state of the edited entry",
		refine: "RECONSTRUCTIBLE",
		refineEvidence: "appliedEdits[].after is a full entry snapshot",
		crud: "PARTIAL",
		crudEvidence: "current harness_state.json shows the latest value only; superseded values are lost",
	},
	{
		dimension: "which messages preceded the mutation",
		refine: "RECONSTRUCTIBLE",
		refineEvidence: "message entries appended before the refinement entry",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "no anchor exists in the session file to split before/after",
	},
	{
		dimension: "which messages followed the mutation",
		refine: "RECONSTRUCTIBLE",
		refineEvidence: "message entries descending from the refinement entry",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "same - no anchor",
	},
	{
		dimension: "harness state applying to message A (edited entry only)",
		refine: "RECONSTRUCTIBLE",
		refineEvidence: "appliedEdits[].before gives the pre-mutation value of every touched entry",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "no before value is recorded",
	},
	{
		dimension: "harness state applying to message B (edited entry only)",
		refine: "RECONSTRUCTIBLE",
		refineEvidence: "appliedEdits[].after plus harness_state.json",
		crud: "PARTIAL",
		crudEvidence: "only if no later writer touched the same entry",
	},
	{
		dimension: "COMPLETE effective harness state at message A / message B",
		refine: "PARTIAL",
		refineEvidence:
			"per-edit before/after only; no full-state snapshot or hash is persisted per turn, and a concurrent CRUD writer is invisible",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "no snapshot, no event, no anchor",
	},
	{
		dimension: "effective system prompt actually sent with each request",
		refine: "NOT RECONSTRUCTIBLE",
		refineEvidence: "assistant message entries record no systemPrompt and no prompt hash",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "same",
	},
];

raw.writerA_refine = refineRecord;
raw.writerB_crud = crudRecord;
raw.reconstructionMatrix = matrix;
raw.assertions = log.entries;

const matrixMd = [
	"| Dimension | `/refine` (TypeScript writer) | Evidence | Direct `rlm.harness` CRUD (Python writer) | Evidence |",
	"| --- | --- | --- | --- | --- |",
	...matrix.map(
		(row) =>
			`| ${row.dimension} | **${row.refine}** | ${row.refineEvidence} | **${row.crud}** | ${row.crudEvidence} |`,
	),
].join("\n");
writeArtifact(`${ART}/reconstruction-matrix.md`, matrixMd);
writeJsonArtifact(`${ART}/raw-result.json`, raw);

if (existsSync(AGENT_DIR)) {
	const { rmSync } = await import("node:fs");
	rmSync(AGENT_DIR, { recursive: true, force: true });
}

console.log(`\nall assertions passed: ${log.allPassed}`);
process.exit(log.allPassed ? 0 : 1);
