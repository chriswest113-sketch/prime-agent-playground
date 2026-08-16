/**
 * TEST 04 - Normalized faux reproducibility.
 *
 * Question: is the faux-provider evaluation surface "nondeterministic", or is it
 * nondeterministic only at the event/identifier framing level while remaining
 * semantically reproducible after principled normalization?
 *
 * Two layers are measured so provider nondeterminism is not confused with
 * session-framing nondeterminism:
 *   Layer P - provider only, fixed Context, N calls in one process.
 *   Layer S - full AgentSession flow, N independent child processes.
 *
 * Nondeterminism claims are MEASURED over N repetitions rather than asserted
 * from a single pair, so a chance coincidence between two runs cannot flip a
 * verdict.
 *
 * Four reproducibility classes are scored separately:
 *   BYTE-LEVEL        - raw traces are byte-identical
 *   IDENTIFIER        - generated ids match
 *   EVENT-FRAME       - the event sequence (including delta segmentation) matches
 *   SEMANTIC SCRIPT   - content/tool/result/harness/outcome match after normalization
 *
 * Run (parent):  npx tsx studies/joint-discriminating-tests/test-04-normalized-reproducibility/run.ts
 * Run (child):   ... run.ts --child <outfile>      (spawned by the parent)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	AssertionLog,
	environmentRecord,
	isolateAgentDir,
	settle,
	writeArtifact,
	writeJsonArtifact,
} from "../_lib/probe.js";

const ART = "test-04-normalized-reproducibility/artifacts";
const childOutPath = process.argv[2] === "--child" ? process.argv[3] : undefined;

/** Repetitions per layer. Enough that identical random segmentation is not a plausible coincidence. */
const LAYER_P_RUNS = 5;
const LAYER_S_RUNS = 3;

const AGENT_DIR = isolateAgentDir(childOutPath ? `t04-child-${process.pid}` : "t04-parent");

const { fauxAssistantMessage, fauxToolCall, streamSimple } = await import("../../../packages/ai/src/index.js");
const { registerFauxProvider } = await import("../../../packages/ai/src/index.js");
const { createHarness } = await import("../../../packages/coding-agent/test/suite/harness.js");
const { Type } = await import("typebox");
type AgentTool = import("@earendil-works/pi-agent-core").AgentTool;
type Context = import("../../../packages/ai/src/index.js").Context;

/**
 * Stream-progress events that exist once per emitted chunk. Their COUNT is a
 * direct function of random chunk segmentation, so collapsing consecutive runs
 * of them is the session-layer equivalent of concatenating deltas. Nothing
 * about their payload is discarded: `message_update` carries no content of its
 * own in this trace, only the fact that a chunk arrived.
 */
const STREAM_PROGRESS_EVENTS = new Set(["message_update"]);

// =====================================================================
// The deterministic script every run executes.
// =====================================================================
const SCRIPT = {
	userTurn1: "step one: echo the marker",
	userTurn2: "step two: summarise",
	echoArg: "T04_MARKER",
	finalText: "Summary: the marker was echoed once.",
	explicitToolCallId: "t04-fixed-tool-id",
};

const echoTool: AgentTool = {
	name: "echo",
	label: "Echo",
	description: "Echo a value back deterministically.",
	parameters: Type.Object({ value: Type.String() }),
	execute: async (_toolCallId: string, params: unknown) => ({
		content: [{ type: "text" as const, text: `echoed:${(params as { value: string }).value}` }],
		details: {},
	}),
};

// =====================================================================
// Normalization. Removes ONLY known volatile framing.
// =====================================================================
const NORMALIZERS: Array<{ name: string; apply: (text: string) => string }> = [
	{
		name: "iso-timestamp",
		apply: (t) => t.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, "<ISO_TS>"),
	},
	{ name: "refine-id", apply: (t) => t.replace(/refine_\d{17}/g, "refine_<TS_ID>") },
	{ name: "faux-random-id", apply: (t) => t.replace(/(?:faux|tool|faux-provider):\d{13}:[a-z0-9]+/g, "<FAUX_ID>") },
	{ name: "temp-session-dir", apply: (t) => t.replace(/pi-suite-\d{13}-[a-z0-9]+/g, "<TMP_SESSION_DIR>") },
	{ name: "study-agent-dir", apply: (t) => t.replace(/joint-study-agentdir-[a-z0-9-]+/g, "<AGENT_DIR>") },
	{ name: "uuid", apply: (t) => t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<UUID>") },
	{ name: "short-entry-id", apply: (t) => t.replace(/"(id|parentId|targetId)":\s*"[0-9a-f]{8}"/g, '"$1":"<ENTRY_ID>"') },
	{ name: "epoch-ms", apply: (t) => t.replace(/\b1[6-9]\d{11}\b/g, "<EPOCH_MS>") },
];

function normalize(value: unknown): string {
	let text = JSON.stringify(value, null, 1);
	for (const normalizer of NORMALIZERS) {
		text = normalizer.apply(text);
	}
	return text;
}

/** Collapse chunk-segmentation framing: consecutive same-index deltas and progress runs. */
function coalesceEvents(events: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
	const out: Array<Record<string, unknown>> = [];
	for (const event of events) {
		const type = String(event.type);
		const previous = out[out.length - 1];
		if (
			type.endsWith("_delta") &&
			previous &&
			previous.type === type &&
			previous.contentIndex === event.contentIndex
		) {
			previous.delta = `${String(previous.delta ?? "")}${String(event.delta ?? "")}`;
			continue;
		}
		if (STREAM_PROGRESS_EVENTS.has(type) && previous && previous.type === type) {
			continue;
		}
		out.push({ ...event });
	}
	return out;
}

function eventTypes(events: Array<Record<string, unknown>>): string[] {
	return events.map((event) => String(event.type));
}

/** True when every element serializes identically. */
function allEqual(values: unknown[]): boolean {
	if (values.length < 2) return true;
	const first = JSON.stringify(values[0]);
	return values.every((value) => JSON.stringify(value) === first);
}

/** Number of distinct serializations - the measure used for nondeterminism claims. */
function distinctCount(values: unknown[]): number {
	return new Set(values.map((value) => JSON.stringify(value))).size;
}

// =====================================================================
// Layer P - provider only.
// =====================================================================
async function layerP(): Promise<Array<Record<string, unknown>>> {
	const registration = registerFauxProvider({ provider: "faux", models: [{ id: "faux-1" }] });
	const model = registration.getModel();
	const context: Context = {
		systemPrompt: "fixed system prompt for layer P",
		messages: [{ role: "user", content: [{ type: "text", text: "fixed user message for layer P" }], timestamp: 0 }],
	};

	async function once(): Promise<Record<string, unknown>> {
		registration.setResponses([
			fauxAssistantMessage(
				[
					{ type: "text", text: "A reasonably long deterministic reply so the chunker has work to do. ".repeat(4) },
					fauxToolCall("echo", { value: SCRIPT.echoArg }),
					fauxToolCall("echo", { value: SCRIPT.echoArg }, { id: SCRIPT.explicitToolCallId }),
				],
				{ stopReason: "toolUse" },
			),
		]);
		const events: Array<Record<string, unknown>> = [];
		const eventStream = streamSimple(model, context, { apiKey: "faux-key" });
		for await (const event of eventStream) {
			events.push(
				JSON.parse(
					JSON.stringify({
						type: event.type,
						contentIndex: (event as { contentIndex?: number }).contentIndex,
						delta: (event as { delta?: string }).delta,
						reason: (event as { reason?: string }).reason,
					}),
				),
			);
		}
		const final = await eventStream.result();
		const toolCalls = final.content
			.filter((block) => block.type === "toolCall")
			.map((block) => ({ id: block.id, name: block.name, arguments: block.arguments }));
		return {
			events,
			coalesced: coalesceEvents(events),
			rawEventTypes: eventTypes(events),
			deltaSegmentation: events
				.filter((event) => String(event.type).endsWith("_delta"))
				.map((event) => String(event.delta ?? "").length),
			finalText: final.content
				.filter((block): block is { type: "text"; text: string } => block.type === "text")
				.map((block) => block.text)
				.join(""),
			toolCalls,
			autoToolId: toolCalls[0].id,
			explicitToolId: toolCalls[1].id,
			toolSemantics: toolCalls.map(({ name, arguments: args }) => ({ name, args })),
			usage: final.usage,
			stopReason: final.stopReason,
			model: final.model,
			provider: final.provider,
			responseId: final.responseId ?? null,
			responseModel: (final as { responseModel?: string }).responseModel ?? null,
		};
	}

	const runs: Array<Record<string, unknown>> = [];
	for (let index = 0; index < LAYER_P_RUNS; index++) {
		runs.push(await once());
	}
	registration.unregister();
	return runs;
}

// =====================================================================
// Layer S - a full AgentSession flow (one process = one run).
// =====================================================================
async function layerS(): Promise<Record<string, unknown>> {
	const harness = await createHarness({ persistSession: true, tools: [echoTool] });
	const providerRequests: Array<{ systemPromptLength: number; userTexts: number }> = [];
	try {
		harness.setResponses([
			(context: Context) => {
				providerRequests.push({
					systemPromptLength: (context.systemPrompt ?? "").length,
					userTexts: context.messages.filter((message) => message.role === "user").length,
				});
				return fauxAssistantMessage([fauxToolCall("echo", { value: SCRIPT.echoArg })], { stopReason: "toolUse" });
			},
			(context: Context) => {
				providerRequests.push({
					systemPromptLength: (context.systemPrompt ?? "").length,
					userTexts: context.messages.filter((message) => message.role === "user").length,
				});
				return fauxAssistantMessage(SCRIPT.finalText);
			},
		]);
		await harness.session.prompt(SCRIPT.userTurn1);
		await settle(60);

		harness.appendResponses([
			fauxAssistantMessage(
				JSON.stringify({
					summary: "Record the T04 marker lesson",
					rationale: "Deterministic probe proposal.",
					expectedOutcome: "Marker recorded.",
					edits: [
						{
							action: "create",
							kind: "memory",
							id: "t04_marker",
							title: "T04 marker",
							content: "T04_MARKER was echoed successfully.",
							path: "study/t04",
							reason: "probe",
						},
					],
				}),
			),
		]);
		const refineResult = await harness.session.refine({ instructions: "probe: deterministic edit" });
		await settle(40);

		harness.appendResponses([fauxAssistantMessage("acknowledged")]);
		await harness.session.prompt(SCRIPT.userTurn2);
		await settle(60);

		const sessionFile = harness.sessionManager.getSessionFile()!;
		const harnessStatePath = join(harness.sessionManager.getSessionArtifactDir()!, "harness", "harness_state.json");

		return {
			events: harness.events.map((event) =>
				JSON.parse(
					JSON.stringify({
						type: event.type,
						contentIndex: (event as { contentIndex?: number }).contentIndex,
						delta: (event as { delta?: string }).delta,
					}),
				),
			),
			messages: JSON.parse(JSON.stringify(harness.session.messages)),
			sessionJsonl: readFileSync(sessionFile, "utf8"),
			harnessState: JSON.parse(readFileSync(harnessStatePath, "utf8")),
			refinement: JSON.parse(JSON.stringify(refineResult)),
			providerRequests,
			sessionFile,
			tempDir: harness.tempDir,
		};
	} finally {
		harness.cleanup();
	}
}

// =====================================================================
// Child mode: emit one Layer S trace and exit.
// =====================================================================
if (childOutPath) {
	const trace = await layerS();
	const { mkdirSync, writeFileSync } = await import("node:fs");
	const { dirname } = await import("node:path");
	mkdirSync(dirname(childOutPath), { recursive: true });
	writeFileSync(childOutPath, JSON.stringify(trace, null, 2), "utf8");
	rmSync(AGENT_DIR, { recursive: true, force: true });
	process.exit(0);
}

// =====================================================================
// Parent mode.
// =====================================================================
const log = new AssertionLog();
const raw: Record<string, unknown> = {
	environment: environmentRecord(),
	script: SCRIPT,
	repetitions: { layerP: LAYER_P_RUNS, layerS: LAYER_S_RUNS },
};

// ---- Layer P ----
const pRuns = await layerP();
const pDistinctRaw = distinctCount(pRuns);
const pDistinctSegmentation = distinctCount(pRuns.map((run) => run.deltaSegmentation));
const pCoalescedEqual = allEqual(pRuns.map((run) => run.coalesced));
const pFinalTextEqual = allEqual(pRuns.map((run) => run.finalText));
const pUsageEqual = allEqual(pRuns.map((run) => run.usage));
const pToolSemanticsEqual = allEqual(pRuns.map((run) => run.toolSemantics));
const pDistinctAutoIds = distinctCount(pRuns.map((run) => run.autoToolId));
const pExplicitIdEqual = allEqual(pRuns.map((run) => run.explicitToolId));

raw.layerP = {
	runs: LAYER_P_RUNS,
	distinctRawTraces: pDistinctRaw,
	distinctDeltaSegmentations: pDistinctSegmentation,
	deltaSegmentations: pRuns.map((run) => run.deltaSegmentation),
	coalescedEventFrameEqual: pCoalescedEqual,
	finalTextEqual: pFinalTextEqual,
	usageEqual: pUsageEqual,
	usage: pRuns[0].usage,
	toolSemanticsEqual: pToolSemanticsEqual,
	distinctAutoGeneratedToolIds: pDistinctAutoIds,
	explicitToolIdEqual: pExplicitIdEqual,
	autoToolIds: pRuns.map((run) => run.autoToolId),
	responseId: pRuns[0].responseId,
	responseModel: pRuns[0].responseModel,
};

log.record(
	"T04.P1",
	`Layer P BYTE-LEVEL: raw provider traces are NOT identical across ${LAYER_P_RUNS} runs`,
	pDistinctRaw === LAYER_P_RUNS,
	`distinct raw traces = ${pDistinctRaw}/${LAYER_P_RUNS}`,
);
log.record(
	"T04.P2",
	`Layer P EVENT-FRAME: delta segmentation is volatile (Math.random chunking) across ${LAYER_P_RUNS} runs`,
	pDistinctSegmentation > 1,
	`distinct segmentations = ${pDistinctSegmentation}/${LAYER_P_RUNS}`,
);
log.record(
	"T04.P3",
	"Layer P EVENT-FRAME: after concatenating deltas, every run's event frame is identical",
	pCoalescedEqual,
);
log.record(
	"T04.P4",
	"Layer P IDENTIFIER: auto-generated tool-call ids are distinct in every run",
	pDistinctAutoIds === LAYER_P_RUNS,
	`distinct auto ids = ${pDistinctAutoIds}/${LAYER_P_RUNS}`,
);
log.record("T04.P5", "Layer P IDENTIFIER: explicitly supplied tool-call ids are stable", pExplicitIdEqual);
log.record("T04.P6", "Layer P SEMANTIC: terminal assistant text is identical in every run", pFinalTextEqual);
log.record("T04.P7", "Layer P SEMANTIC: tool-call semantics (name + arguments) are identical", pToolSemanticsEqual);
log.record("T04.P8", "Layer P SEMANTIC: usage totals are identical for a fixed context", pUsageEqual);

// ---- Layer S ----
const scratch = join(tmpdir(), `joint-study-t04-${process.pid}`);
const self = new URL(import.meta.url).pathname;
const traces: Array<Record<string, unknown>> = [];
for (let index = 0; index < LAYER_S_RUNS; index++) {
	const out = join(scratch, `run-${index}.json`);
	execFileSync("npx", ["tsx", self, "--child", out], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	traces.push(JSON.parse(readFileSync(out, "utf8")) as Record<string, unknown>);
}

const allEvents = traces.map((trace) => trace.events as Array<Record<string, unknown>>);
const sDistinctRaw = distinctCount(traces);
const sRawEventTypesDistinct = distinctCount(allEvents.map((events) => eventTypes(events)));
const sMessageUpdateCounts = allEvents.map(
	(events) => eventTypes(events).filter((type) => type === "message_update").length,
);
const sNormalizedWholeEqual = allEqual(traces.map((trace) => normalize(trace)));
const sEventTypesEqual = allEqual(allEvents.map((events) => eventTypes(coalesceEvents(events))));
const sEventFrameEqualBeforeCoalesce = allEqual(allEvents.map((events) => normalize(events)));
const sCoalescedEqual = allEqual(allEvents.map((events) => normalize(coalesceEvents(events))));

function assistantTexts(trace: Record<string, unknown>): string[] {
	return (trace.messages as Array<{ role: string; content: unknown }>)
		.filter((message) => message.role === "assistant")
		.map((message) =>
			(Array.isArray(message.content) ? message.content : [])
				.filter((block: { type?: string }) => block.type === "text")
				.map((block: { text?: string }) => block.text ?? "")
				.join(""),
		);
}
function toolSemantics(trace: Record<string, unknown>): unknown {
	return (trace.messages as Array<{ role: string; content: unknown }>)
		.filter((message) => message.role === "assistant")
		.flatMap((message) => (Array.isArray(message.content) ? message.content : []))
		.filter((block: { type?: string }) => block.type === "toolCall")
		.map((block: { name?: string; arguments?: unknown }) => ({ name: block.name, arguments: block.arguments }));
}
function toolResults(trace: Record<string, unknown>): unknown {
	return (trace.messages as Array<{ role: string; content?: unknown; toolName?: string }>)
		.filter((message) => message.role === "toolResult")
		.map((message) => ({ toolName: message.toolName, content: message.content }));
}
function harnessSemantics(trace: Record<string, unknown>): unknown {
	const state = trace.harnessState as { entries: Record<string, Record<string, Record<string, unknown>>> };
	return Object.fromEntries(
		Object.entries(state.entries).map(([kind, records]) => [
			kind,
			Object.fromEntries(
				Object.entries(records).map(([id, entry]) => [
					id,
					{
						title: entry.title,
						content: entry.content,
						path: entry.path,
						version: entry.version,
						source: entry.source,
					},
				]),
			),
		]),
	);
}
interface UsageRow {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
}
function usageTotals(trace: Record<string, unknown>): UsageRow[] {
	return (trace.messages as Array<{ role: string; usage?: UsageRow }>)
		.filter((message) => message.role === "assistant")
		.map((message) => message.usage!)
		.filter(Boolean);
}
function outputTokens(trace: Record<string, unknown>): number[] {
	return usageTotals(trace).map((usage) => usage.output);
}
function inputTokens(trace: Record<string, unknown>): number[] {
	return usageTotals(trace).map((usage) => usage.input);
}
/** Lengths of the system prompts actually sent, per scripted provider request. */
function systemPromptLengths(trace: Record<string, unknown>): number[] {
	return (trace.providerRequests as Array<{ systemPromptLength: number }>).map((request) => request.systemPromptLength);
}
function outcomes(trace: Record<string, unknown>): unknown {
	const refinement = trace.refinement as { appliedEdits: Array<Record<string, unknown>> };
	return {
		appliedEdits: refinement.appliedEdits.map((edit) => ({
			action: edit.action,
			kind: edit.kind,
			id: edit.id,
			applied: edit.applied,
			error: edit.error ?? null,
		})),
		stopReasons: (trace.messages as Array<{ role: string; stopReason?: string }>)
			.filter((message) => message.role === "assistant")
			.map((message) => message.stopReason),
	};
}

const semantic = {
	terminalAssistantContent: allEqual(traces.map(assistantTexts)),
	toolCallSemantics: allEqual(traces.map(toolSemantics)),
	toolResults: allEqual(traces.map(toolResults)),
	harnessSemanticState: allEqual(traces.map(harnessSemantics)),
	usageOutputTokens: allEqual(traces.map(outputTokens)),
	outcomes: allEqual(traces.map(outcomes)),
};

/**
 * Input-token accounting is measured and DIAGNOSED rather than asserted equal.
 * The faux provider estimates input tokens from the serialized prompt
 * (`estimateTokens` = ceil(chars/4), faux.ts:128-130), and the system prompt
 * embeds `messagesPath` - a temp session path whose random suffix varies in
 * LENGTH between runs. So input tokens can differ by +/-1 purely from framing.
 *
 * The discriminating question is therefore not "are input tokens equal" but
 * "is any inequality explained by prompt-length framing, or does it indicate
 * semantic drift". Runs whose system prompts are the same length must report
 * the same input tokens; if they do, framing is the whole story.
 */
const inputTokensEqual = allEqual(traces.map(inputTokens));
const promptLengths = traces.map(systemPromptLengths);
const promptLengthsEqual = allEqual(promptLengths);
const inputDeltas = (() => {
	const perTurn = inputTokens(traces[0]).map((_, turn) => traces.map((trace) => inputTokens(trace)[turn]));
	return perTurn.map((values) => Math.max(...values) - Math.min(...values));
})();
/**
 * Necessary condition of the framing account: equal prompt lengths must imply
 * equal input tokens. Satisfying it is consistent with framing being the cause;
 * it does not by itself exclude other contributors. Establishing sole causation
 * would need a direct intervention (e.g. pinning the session path length).
 */
const framingExplainsInputVariance = traces.every((traceA, indexA) =>
	traces.every((traceB, indexB) => {
		if (indexA >= indexB) return true;
		const samePromptLengths =
			JSON.stringify(systemPromptLengths(traceA)) === JSON.stringify(systemPromptLengths(traceB));
		if (!samePromptLengths) return true;
		return JSON.stringify(inputTokens(traceA)) === JSON.stringify(inputTokens(traceB));
	}),
);

raw.layerS = {
	runs: LAYER_S_RUNS,
	distinctRawTraces: sDistinctRaw,
	distinctRawEventTypeSequences: sRawEventTypesDistinct,
	messageUpdateCounts: sMessageUpdateCounts,
	normalizedWholeTraceEqual: sNormalizedWholeEqual,
	coalescedEventTypeSequenceEqual: sEventTypesEqual,
	normalizedEventFrameEqualBeforeCoalescing: sEventFrameEqualBeforeCoalesce,
	coalescedEventFrameEqual: sCoalescedEqual,
	semantic,
	usagePerRun: traces.map(usageTotals),
	usageInputTokens: {
		equal: inputTokensEqual,
		perRun: traces.map(inputTokens),
		perTurnMaxDelta: inputDeltas,
		systemPromptLengthsPerRun: promptLengths,
		systemPromptLengthsEqual: promptLengthsEqual,
		framingExplainsVariance: framingExplainsInputVariance,
		diagnosis:
			"Mechanistic account, consistent with the observations but not proven sole cause: faux estimateTokens = ceil(chars/4) over the serialized prompt; the system prompt embeds the temp session path, whose random suffix varies in length between runs, so input tokens can cross a quantisation boundary by +/-1.",
		causationCaveat:
			"The probe tests a NECESSARY condition (equal prompt length => equal input tokens). No intervention pinning path length was performed, so sole causation is not experimentally established.",
	},
	tempDirs: traces.map((trace) => trace.tempDir),
	tempDirLengths: traces.map((trace) => String(trace.tempDir).length),
	normalizersApplied: NORMALIZERS.map((normalizer) => normalizer.name),
	segmentationNormalization:
		"consecutive same-index *_delta events concatenated; consecutive message_update progress runs collapsed",
	notNormalized: [
		"assistant text content",
		"tool names and arguments",
		"tool result content",
		"harness entry titles/content/paths/versions",
		"stop reasons",
		"applied-edit outcomes",
		"usage numbers",
	],
};

log.record(
	"T04.S1",
	`Layer S BYTE-LEVEL: all ${LAYER_S_RUNS} raw session traces differ`,
	sDistinctRaw === LAYER_S_RUNS,
	`distinct raw traces = ${sDistinctRaw}/${LAYER_S_RUNS}`,
);
log.record(
	"T04.S1b",
	"Layer S EVENT-FRAME (observation, not a pass condition): per-chunk progress event counts across runs",
	true,
	`message_update counts = ${JSON.stringify(sMessageUpdateCounts)}; distinct raw event-type sequences = ${sRawEventTypesDistinct}/${LAYER_S_RUNS}`,
);
log.record(
	"T04.S2",
	"Layer S EVENT-FRAME: after collapsing chunk-segmentation framing, every run's event TYPE sequence is identical",
	sEventTypesEqual,
);
log.record(
	"T04.S4",
	"Layer S EVENT-FRAME: after coalescing, every run's normalized event frame is identical",
	sCoalescedEqual,
);
log.record("T04.S5", "Layer S SEMANTIC: terminal assistant content is identical", semantic.terminalAssistantContent);
log.record("T04.S6", "Layer S SEMANTIC: tool-call semantics are identical", semantic.toolCallSemantics);
log.record("T04.S7", "Layer S SEMANTIC: tool results are identical", semantic.toolResults);
log.record("T04.S8", "Layer S SEMANTIC: harness semantic state is identical", semantic.harnessSemanticState);
log.record("T04.S9", "Layer S SEMANTIC: assertions/outcomes are identical", semantic.outcomes);
log.record(
	"T04.S10a",
	"Layer S SEMANTIC: OUTPUT token accounting is identical across runs",
	semantic.usageOutputTokens,
	`output tokens per run: ${JSON.stringify(traces.map(outputTokens))}`,
);
log.record(
	"T04.S10b",
	"Layer S (observation, not a pass condition): INPUT token accounting across runs",
	true,
	`input tokens per run: ${JSON.stringify(traces.map(inputTokens))}; per-turn max delta: ${JSON.stringify(inputDeltas)}; system prompt lengths: ${JSON.stringify(promptLengths)}`,
);
log.record(
	"T04.S10c",
	"Layer S: the INPUT token variance is CONSISTENT WITH prompt-length framing rather than semantic drift - runs with equal system-prompt lengths report equal input tokens. This is a necessary condition of the framing account, not proof of sole causation",
	framingExplainsInputVariance,
	`inputTokensEqual=${inputTokensEqual} promptLengthsEqual=${promptLengthsEqual}`,
);
log.record(
	"T04.S11",
	"Layer S: whole-trace normalization is NOT claimed to produce equality - residual differences are reported, not normalized away",
	true,
	`normalizedWholeTraceEqual=${sNormalizedWholeEqual} (false is expected: chunk-segmentation framing survives the field normalizers)`,
);

for (let index = 0; index < traces.length; index++) {
	writeArtifact(`${ART}/layer-s-run-${index}.json`, JSON.stringify(traces[index], null, 2));
	writeArtifact(`${ART}/layer-s-run-${index}.normalized.json`, normalize(traces[index]));
	writeArtifact(
		`${ART}/layer-s-run-${index}.coalesced-events.json`,
		normalize(coalesceEvents(allEvents[index])),
	);
}
writeJsonArtifact(`${ART}/layer-p-traces.json`, pRuns);

raw.classification = {
	BYTE_LEVEL: "NOT REPRODUCIBLE (every raw trace differs at both layers)",
	IDENTIFIER:
		"NOT REPRODUCIBLE by default (auto-generated tool-call ids, session UUIDs, faux api ids, refine_<UTC> ids); REPRODUCIBLE when ids are supplied explicitly",
	EVENT_FRAME:
		"NOT REPRODUCIBLE at chunk-segmentation level; REPRODUCIBLE once chunk-segmentation framing is collapsed (deltas concatenated, progress runs coalesced)",
	SEMANTIC_SCRIPT: Object.values(semantic).every(Boolean)
		? `REPRODUCIBLE for terminal content, tool semantics, tool results, harness semantic state, output-token accounting and outcomes. INPUT-token accounting is ENVIRONMENT-DEPENDENT: observed per-turn deltas ${JSON.stringify(inputDeltas)}, consistent with and mechanistically explained by prompt-length framing (${framingExplainsInputVariance ? "necessary condition holds" : "necessary condition FAILS"}); sole causation not established by this implication alone.`
		: `PARTIAL: ${JSON.stringify(semantic)}`,
};
raw.assertions = log.entries;
writeJsonArtifact(`${ART}/raw-result.json`, raw);
rmSync(scratch, { recursive: true, force: true });
rmSync(AGENT_DIR, { recursive: true, force: true });

console.log(`\nclassification: ${JSON.stringify(raw.classification, null, 2)}`);
console.log(`\nall assertions passed: ${log.allPassed}`);
process.exit(log.allPassed ? 0 : 1);
