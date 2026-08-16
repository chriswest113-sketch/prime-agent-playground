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
import { join, resolve } from "node:path";
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
	return multiProposal([edit], summary);
}

function multiProposal(edits: Array<Record<string, unknown>>, summary: string) {
	return fauxAssistantMessage(
		JSON.stringify({
			summary,
			rationale: "Probe requires distinctive, attributable edits.",
			expectedOutcome: "The edits are attributable to a point in the session tree.",
			edits,
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
const harnessB = await buildSession();
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
// WRITER C - can a /refine-ONLY history be reverse-reconstructed?
//
// The first version of this study marked "complete effective harness state at
// a turn" as PARTIAL for /refine on the grounds that no full-state snapshot is
// persisted. An independent audit pointed out that this was asserted, not
// tested: ordered appliedEdits carry before AND after for every touched entry,
// so replaying them backwards from the final state may reconstruct any earlier
// checkpoint exactly. This section tests that directly, and then tests what
// happens when a direct CRUD write is interleaved.
// =====================================================================
type Entries = Record<string, Record<string, Record<string, unknown>>>;
type HarnessEntryRecord = Record<string, unknown>;
interface AppliedEditRecord {
	action?: string;
	kind: string;
	id: string;
	applied: boolean;
	before?: HarnessEntryRecord;
	after?: HarnessEntryRecord;
}
interface RefinementRecord {
	id: string;
	scope?: string;
	harnessStatePath?: string;
	appliedEdits: AppliedEditRecord[];
}

/**
 * Reverse-replay `refinements` (oldest-first) off `finalEntries` to recover the
 * state as of the checkpoint immediately before the first replayed refinement.
 *
 * NOTE ON SCOPE. A self-audit of the first version of this probe found that
 * replaying EVERY `prime-agent.refinement` session entry against one store is
 * wrong: `_applyRefine` appends that entry for global refinements too, so a
 * session mixing scopes replays global edits into the local store. Production
 * records already carry `scope` and `harnessStatePath`; callers must pass a
 * `targetStatePath` so the history is filtered to the store being
 * reconstructed. `naive: true` reproduces the original unfiltered behaviour so
 * the two can be compared in the same run.
 */
function reverseReplay(
	finalEntries: Entries,
	refinements: RefinementRecord[],
	options: { targetStatePath?: string; naive?: boolean } = {},
): Entries {
	const history = options.naive
		? refinements
		: refinements.filter((refinement) => {
				if (!options.targetStatePath) return true;
				// harnessStatePath is the authoritative store identity; `scope` is a
				// secondary label and legacy records may lack it.
				if (refinement.harnessStatePath) {
					return resolve(refinement.harnessStatePath) === resolve(options.targetStatePath);
				}
				return true;
			});
	const state = JSON.parse(JSON.stringify(finalEntries)) as Entries;
	for (const refinement of [...history].reverse()) {
		for (const edit of [...refinement.appliedEdits].reverse()) {
			if (!edit.applied) continue;
			const kind = String(edit.kind);
			const id = String(edit.id);
			state[kind] ??= {};
			if (edit.before) {
				state[kind][id] = edit.before;
			} else {
				delete state[kind][id];
			}
		}
	}
	return state;
}

/**
 * Contamination detector. Uses ONLY production records - the ordered refinement
 * edit history plus the final harness_state.json - and looks for internal
 * inconsistencies that a `/refine`-only history cannot produce.
 *
 * This exists because the first version of this study asserted that an
 * interleaved foreign write leaves "no marker in the records". A self-audit
 * refuted that. Detection is a strictly weaker claim than attribution: these
 * signals show that SOMETHING outside the recorded edit history touched the
 * store, not what it was or when.
 */
function detectContamination(finalEntries: Entries, refinements: RefinementRecord[]): string[] {
	const signals: string[] = [];
	const lastAfter = new Map<string, HarnessEntryRecord>();
	const everTouched = new Set<string>();

	for (const refinement of refinements) {
		for (const edit of refinement.appliedEdits) {
			if (!edit.applied) continue;
			const key = `${edit.kind}:${edit.id}`;
			everTouched.add(key);
			const previous = lastAfter.get(key);
			if (previous) {
				if (JSON.stringify(edit.before ?? null) !== JSON.stringify(previous)) {
					signals.push(`CHAIN-BREAK ${key} at ${refinement.id}: recorded before !== prior recorded after`);
				}
				const previousVersion = Number(previous.version);
				const beforeVersion = edit.before ? Number(edit.before.version) : Number.NaN;
				if (Number.isFinite(beforeVersion) && beforeVersion !== previousVersion) {
					signals.push(
						`VERSION-GAP ${key} at ${refinement.id}: before.version=${beforeVersion}, prior after.version=${previousVersion}`,
					);
				}
				if (edit.before && edit.before.source !== "refine") {
					signals.push(`SOURCE-MISMATCH ${key} at ${refinement.id}: before.source=${String(edit.before.source)}`);
				}
			}
			if (edit.after) lastAfter.set(key, edit.after);
			else lastAfter.delete(key);
		}
	}

	for (const [kind, records] of Object.entries(finalEntries)) {
		for (const [id] of Object.entries(records)) {
			const key = `${kind}:${id}`;
			if (!everTouched.has(key)) {
				signals.push(`ORPHAN ${key}: present in final state, absent from every refinement record`);
			}
		}
	}
	return signals;
}

function readEntries(harnessStatePath: string): Entries {
	return (JSON.parse(readFileSync(harnessStatePath, "utf8")) as { entries: Entries }).entries;
}

function readRefinementRecords(sessionFile: string): RefinementRecord[] {
	return readJsonl(sessionFile)
		.filter((entry) => entry.type === "custom" && entry.customType === "prime-agent.refinement")
		.map((entry) => entry.data as RefinementRecord);
}

async function runReconstructionProbe(interleaveCrudWrite: boolean): Promise<{
	checkpoints: Entries[];
	reconstructed: Entries[];
	exactMatches: boolean[];
	refinementCount: number;
	contaminationSignals: string[];
}> {
	const harness = await buildSession();
	try {
		// One real turn first: the session JSONL is created lazily on first append,
		// and a refinement history with no surrounding conversation is not the
		// shape being studied anyway.
		harness.appendResponses([fauxAssistantMessage("starting work")]);
		await harness.session.prompt("begin");
		await settle(30);

		const harnessDir = join(harness.sessionManager.getSessionArtifactDir()!, "harness");
		const statePath = join(harnessDir, "harness_state.json");

		// refine 1: create X and Y
		harness.appendResponses([
			multiProposal(
				[
					{ action: "create", kind: "memory", id: "rc_x", title: "X", content: "x-v1", path: "study/rc" },
					{ action: "create", kind: "memory", id: "rc_y", title: "Y", content: "y-v1", path: "study/rc" },
				],
				"seed X and Y",
			),
		]);
		await harness.session.refine({});
		await settle(25);
		const checkpointA = readEntries(statePath);

		// refine 2: update X, delete Y
		harness.appendResponses([
			multiProposal(
				[
					{ action: "update", kind: "memory", id: "rc_x", title: "X", content: "x-v2", path: "study/rc" },
					{ action: "delete", kind: "memory", id: "rc_y" },
				],
				"advance X, drop Y",
			),
		]);
		await harness.session.refine({});
		await settle(25);
		const checkpointB = readEntries(statePath);

		// Optionally interleave a direct Python CRUD write that the session
		// records know nothing about.
		if (interleaveCrudWrite) {
			execFileSync(
				"python3",
				[
					"-c",
					[
						"import rlm",
						"rlm.harness.upsert('memory', 'X', 'x-CRUD-OVERWRITE', id='rc_x', path='study/rc')",
						"rlm.harness.create_memory(title='Hidden', content='crud-only', id='rc_hidden', path='study/rc')",
					].join("\n"),
				],
				{ env: { ...process.env, PYTHONPATH: RUNTIME_SRC, RLM_HARNESS_STATE_DIR: harnessDir }, encoding: "utf8" },
			);
		}

		// refine 3: create Z, update X
		harness.appendResponses([
			multiProposal(
				[
					{ action: "create", kind: "memory", id: "rc_z", title: "Z", content: "z-v1", path: "study/rc" },
					{ action: "update", kind: "memory", id: "rc_x", title: "X", content: "x-v3", path: "study/rc" },
				],
				"add Z, advance X",
			),
		]);
		await harness.session.refine({});
		await settle(25);
		const finalEntries = readEntries(statePath);

		// Rebuild history from the SESSION RECORD only, in append order.
		const refinements = readRefinementRecords(harness.sessionManager.getSessionFile()!);
		const replayOptions = { targetStatePath: statePath };
		const reconstructedB = reverseReplay(finalEntries, refinements.slice(2), replayOptions);
		const reconstructedA = reverseReplay(finalEntries, refinements.slice(1), replayOptions);

		const exact = (a: Entries, b: Entries) => JSON.stringify(a) === JSON.stringify(b);
		return {
			checkpoints: [checkpointA, checkpointB, finalEntries],
			reconstructed: [reconstructedA, reconstructedB, finalEntries],
			exactMatches: [exact(reconstructedA, checkpointA), exact(reconstructedB, checkpointB), true],
			refinementCount: refinements.length,
			contaminationSignals: detectContamination(finalEntries, refinements),
		};
	} finally {
		harness.cleanup();
	}
}

/**
 * Mixed-scope probe: `/refine` is the ONLY writer, but the session interleaves
 * global-scope and local-scope refinements. Both land in the same session
 * JSONL, so an unfiltered replay pulls global edits into the local store.
 */
async function runMixedScopeProbe(): Promise<{
	scopes: string[];
	distinctStatePaths: number;
	groundTruthIds: string[];
	naiveIds: string[];
	scopeAwareIds: string[];
	naiveExact: boolean;
	scopeAwareExact: boolean;
}> {
	const harness = await buildSession();
	try {
		harness.appendResponses([fauxAssistantMessage("starting work")]);
		await harness.session.prompt("begin");
		await settle(30);

		const statePath = join(harness.sessionManager.getSessionArtifactDir()!, "harness", "harness_state.json");

		// global create -> local create -> [checkpoint] -> global update -> local update
		harness.appendResponses([
			multiProposal([{ action: "create", kind: "memory", id: "g_entry", title: "G", content: "g-v1", path: "glob" }], "seed global"),
		]);
		await harness.session.refine({ global: true });
		await settle(25);

		harness.appendResponses([
			multiProposal([{ action: "create", kind: "memory", id: "l_entry", title: "L", content: "l-v1", path: "loc" }], "seed local"),
		]);
		await harness.session.refine({});
		await settle(25);
		const localCheckpoint = readEntries(statePath);

		harness.appendResponses([
			multiProposal([{ action: "update", kind: "memory", id: "g_entry", title: "G", content: "g-v2", path: "glob" }], "advance global"),
		]);
		await harness.session.refine({ global: true });
		await settle(25);

		harness.appendResponses([
			multiProposal([{ action: "update", kind: "memory", id: "l_entry", title: "L", content: "l-v2", path: "loc" }], "advance local"),
		]);
		await harness.session.refine({});
		await settle(25);

		const finalLocal = readEntries(statePath);
		const refinements = readRefinementRecords(harness.sessionManager.getSessionFile()!);
		const tail = refinements.slice(2);
		const naive = reverseReplay(finalLocal, tail, { naive: true });
		const scopeAware = reverseReplay(finalLocal, tail, { targetStatePath: statePath });
		const exact = (a: Entries, b: Entries) => JSON.stringify(a) === JSON.stringify(b);

		return {
			scopes: refinements.map((refinement) => refinement.scope ?? "(absent)"),
			distinctStatePaths: new Set(refinements.map((refinement) => refinement.harnessStatePath ?? "(absent)")).size,
			groundTruthIds: Object.keys(localCheckpoint.memory ?? {}).sort(),
			naiveIds: Object.keys(naive.memory ?? {}).sort(),
			scopeAwareIds: Object.keys(scopeAware.memory ?? {}).sort(),
			naiveExact: exact(naive, localCheckpoint),
			scopeAwareExact: exact(scopeAware, localCheckpoint),
		};
	} finally {
		harness.cleanup();
	}
}

const cleanReplay = await runReconstructionProbe(false);
const contaminatedReplay = await runReconstructionProbe(true);
const mixedScope = await runMixedScopeProbe();

const SIGNAL_KINDS = ["CHAIN-BREAK", "VERSION-GAP", "SOURCE-MISMATCH", "ORPHAN"];
const contaminatedSignalKinds = SIGNAL_KINDS.filter((kind) =>
	contaminatedReplay.contaminationSignals.some((signal) => signal.startsWith(kind)),
);

raw.reverseReconstruction = {
	refineOnly: {
		refinementCount: cleanReplay.refinementCount,
		checkpointAExact: cleanReplay.exactMatches[0],
		checkpointBExact: cleanReplay.exactMatches[1],
		checkpointA: cleanReplay.checkpoints[0],
		reconstructedA: cleanReplay.reconstructed[0],
		contaminationSignals: cleanReplay.contaminationSignals,
	},
	withInterleavedCrud: {
		checkpointAExact: contaminatedReplay.exactMatches[0],
		checkpointBExact: contaminatedReplay.exactMatches[1],
		checkpointA: contaminatedReplay.checkpoints[0],
		reconstructedA: contaminatedReplay.reconstructed[0],
		contaminationSignals: contaminatedReplay.contaminationSignals,
		contaminationSignalKinds: contaminatedSignalKinds,
	},
	mixedScope,
	claimSeparation: {
		corruption: "the reconstruction is wrong (T02.C2)",
		detection: "the records are internally inconsistent, so contamination is visible (T02.C3, T02.C4)",
		attribution:
			"identifying WHAT the foreign write was, and WHEN - NOT established; the signals bound the affected entries but do not recover the mutation",
	},
};

log.record(
	"T02.C1",
	"a single-scope, single-branch /refine-ONLY history reverse-replays to the EXACT harness entry set at an earlier checkpoint",
	cleanReplay.exactMatches[0] && cleanReplay.exactMatches[1],
	`checkpointA exact=${cleanReplay.exactMatches[0]} checkpointB exact=${cleanReplay.exactMatches[1]} over ${cleanReplay.refinementCount} refinements`,
);
log.record(
	"T02.C2",
	"CORRUPTION: one interleaved direct CRUD write makes reverse reconstruction wrong",
	!contaminatedReplay.exactMatches[0],
	`checkpointA exact=${contaminatedReplay.exactMatches[0]}; reconstructed A still looked well-formed with ${Object.keys(contaminatedReplay.reconstructed[0].memory ?? {}).length} memory entries`,
);
log.record(
	"T02.C3",
	"DETECTION: in this fixture the contamination IS detectable from production records alone - all four record-consistency signals fire",
	contaminatedSignalKinds.length === SIGNAL_KINDS.length,
	`signals: ${JSON.stringify(contaminatedReplay.contaminationSignals)}`,
);
log.record(
	"T02.C4",
	"the detector is specific, not merely noisy: the clean /refine-only history produces ZERO signals",
	cleanReplay.contaminationSignals.length === 0,
	`clean signals: ${JSON.stringify(cleanReplay.contaminationSignals)}`,
);
log.record(
	"T02.C5",
	"ATTRIBUTION is NOT established: the signals bound which entries were touched, but recover neither the foreign write's content nor its position in the session",
	true,
	"recorded as a scope limit, not a measured result - no probe here attempts attribution",
);

// ---- Mixed-scope: /refine is the only writer, and replay still breaks ----
log.record(
	"T02.C6",
	"production records DO carry the store identity needed to filter history (scope + harnessStatePath)",
	mixedScope.distinctStatePaths === 2 && mixedScope.scopes.includes("global") && mixedScope.scopes.includes("local"),
	`scopes=${JSON.stringify(mixedScope.scopes)} distinct harnessStatePath values=${mixedScope.distinctStatePaths}`,
);
log.record(
	"T02.C7",
	"the NAIVE unfiltered replay is WRONG on a mixed-scope session even though /refine is the only writer",
	!mixedScope.naiveExact,
	`ground truth=${JSON.stringify(mixedScope.groundTruthIds)} naive=${JSON.stringify(mixedScope.naiveIds)}`,
);
log.record(
	"T02.C8",
	"the SCOPE-AWARE replay reconstructs the same mixed-scope checkpoint exactly",
	mixedScope.scopeAwareExact,
	`scope-aware=${JSON.stringify(mixedScope.scopeAwareIds)}`,
);

// =====================================================================
// Reconstruction matrix
// =====================================================================
type Verdict =
	| "RECONSTRUCTIBLE"
	| "RECONSTRUCTIBLE ONLY IF SCOPE-AWARE"
	| "PARTIAL"
	| "NOT RECONSTRUCTIBLE"
	| "NOT RECONSTRUCTIBLE, BUT DETECTABLE";
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
		dimension:
			"COMPLETE harness ENTRY SET at an earlier checkpoint - single-scope, single-branch, /refine as the only writer",
		refine: "RECONSTRUCTIBLE",
		refineEvidence:
			"T02.C1: scope-aware reverse-replay of ordered appliedEdits off the final state reproduces the checkpoint EXACTLY, despite no full-state snapshot. Note this is the `entries` map only - HarnessState.refinements[] and schema are not reconstructed",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "no ordered edit record exists to replay",
	},
	{
		dimension: "COMPLETE harness ENTRY SET when refinement records span MORE THAN ONE harness store",
		refine: "RECONSTRUCTIBLE ONLY IF SCOPE-AWARE",
		refineEvidence:
			"T02.C6-C8: global and local refinements share one session JSONL. An unfiltered replay injects global entries into the local reconstruction and is wrong even with /refine as the only writer; filtering by the recorded harnessStatePath is exact",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "no ordered edit record exists to filter or replay",
	},
	{
		dimension: "COMPLETE harness ENTRY SET with a foreign (non-/refine) writer present",
		refine: "NOT RECONSTRUCTIBLE, BUT DETECTABLE",
		refineEvidence:
			"T02.C2: one interleaved CRUD write makes the replay wrong while still yielding a well-formed state. T02.C3/C4: in this fixture the contamination is detectable from production records alone - CHAIN-BREAK, VERSION-GAP, SOURCE-MISMATCH and ORPHAN all fire, and zero fire on the clean history. T02.C5: detection is not attribution",
		crud: "NOT RECONSTRUCTIBLE",
		crudEvidence: "same, and the foreign writer is the CRUD writer itself",
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
