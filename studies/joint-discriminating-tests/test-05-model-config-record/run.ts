/**
 * TEST 05 - Effective model / configuration record.
 *
 * Question: exactly what does Prime Agent persist about model and configuration
 * identity, and where is the reproducibility boundary?
 *
 * The probe drives every credential-free configuration transition it can, then
 * persists and RELOADS the session from disk and inventories what survived.
 *
 * Run: npx tsx studies/joint-discriminating-tests/test-05-model-config-record/run.ts
 */

import { readFileSync, rmSync } from "node:fs";
import {
	AssertionLog,
	environmentRecord,
	isolateAgentDir,
	settle,
	writeArtifact,
	writeJsonArtifact,
} from "../_lib/probe.js";

const AGENT_DIR = isolateAgentDir("t05");

const { fauxAssistantMessage } = await import("../../../packages/ai/src/index.js");
const { createHarness } = await import("../../../packages/coding-agent/test/suite/harness.js");
const { SessionManager } = await import("../../../packages/coding-agent/src/core/session-manager.js");
type AssistantMessage = import("../../../packages/ai/src/index.js").AssistantMessage;

const ART = "test-05-model-config-record/artifacts";
const log = new AssertionLog();
const raw: Record<string, unknown> = { environment: environmentRecord() };

const REQUESTED_MODEL = "faux-requested";
const SECOND_MODEL = "faux-second";
const ROUTED_MODEL = "faux-concrete-routed-0925";
const RESPONSE_ID = "resp_T05_FIXED_0001";

const harness = await createHarness({
	persistSession: true,
	provider: "faux",
	models: [
		{ id: REQUESTED_MODEL, name: "Faux Requested", reasoning: true },
		{ id: SECOND_MODEL, name: "Faux Second", reasoning: true },
	],
});

let sessionFile = "";
try {
	const modelA = harness.getModel(REQUESTED_MODEL)!;
	const modelB = harness.getModel(SECOND_MODEL)!;
	sessionFile = harness.sessionManager.getSessionFile()!;

	/**
	 * A response whose concrete/routed model differs from the requested model.
	 * The faux provider overwrites `model` with the requested id (cloneMessage),
	 * but `responseModel` survives structuredClone - which is exactly the field
	 * the type reserves for "concrete chunk.model when different from requested".
	 */
	function routedResponse(text: string): AssistantMessage {
		const message = fauxAssistantMessage(text, { responseId: RESPONSE_ID });
		return { ...message, responseModel: ROUTED_MODEL };
	}

	await harness.session.setModel(modelA);
	harness.session.setThinkingLevel("medium");
	harness.session.setServiceTier("priority");
	await settle(20);

	harness.setResponses([routedResponse("first response under model A")]);
	await harness.session.prompt("turn one");
	await settle(50);

	// Configuration transitions between turns.
	await harness.session.setModel(modelB);
	harness.session.setThinkingLevel("high");
	harness.session.setServiceTier("standard");
	await settle(20);

	harness.appendResponses([fauxAssistantMessage("second response under model B")]);
	await harness.session.prompt("turn two");
	await settle(60);

	raw.liveSessionState = {
		model: harness.session.model ? { provider: harness.session.model.provider, id: harness.session.model.id } : null,
		thinkingLevel: harness.session.thinkingLevel,
		serviceTier: harness.session.serviceTier,
	};

	// Copy the live session file into the study artifacts BEFORE cleanup removes
	// the harness temp dir; the reload below reads only this persisted copy.
	sessionFile = writeArtifact(`${ART}/session.jsonl`, readFileSync(sessionFile, "utf8"));
} finally {
	harness.cleanup();
}

// =====================================================================
// Persist -> reload from disk. Everything below reads ONLY the file.
// =====================================================================
const reloaded = SessionManager.create(process.cwd(), undefined);
reloaded.setSessionFile(sessionFile);
const header = reloaded.getHeader();
const entries = reloaded.getEntries();

const rawLines = readFileSync(sessionFile, "utf8")
	.split("\n")
	.filter((line) => line.trim().length > 0)
	.map((line) => JSON.parse(line) as Record<string, unknown>);

const modelChanges = entries.filter((entry) => entry.type === "model_change");
const thinkingChanges = entries.filter((entry) => entry.type === "thinking_level_change");
const tierChanges = entries.filter((entry) => entry.type === "service_tier_change");
const assistantEntries = rawLines.filter(
	(entry) => entry.type === "message" && (entry.message as { role?: string } | undefined)?.role === "assistant",
);
const assistantMessages = assistantEntries.map((entry) => entry.message as Record<string, unknown>);
const assistantKeys = [...new Set(assistantMessages.flatMap((message) => Object.keys(message)))].sort();
const headerKeys = Object.keys(header ?? {}).sort();

log.record("T05.1", "the session reloads from disk", Boolean(header) && entries.length > 0, `entries=${entries.length}`);
log.record(
	"T05.2",
	"model changes are persisted as typed change events carrying provider + modelId",
	modelChanges.length >= 2 && modelChanges.every((entry) => "provider" in entry && "modelId" in entry),
	JSON.stringify(modelChanges.map((entry) => ({ provider: (entry as never)["provider"], modelId: (entry as never)["modelId"] }))),
);
log.record(
	"T05.3",
	"thinking-level changes are persisted as typed change events",
	thinkingChanges.length > 0,
	JSON.stringify(thinkingChanges.map((entry) => (entry as never)["thinkingLevel"])),
);
log.record(
	"T05.4",
	"service-tier changes are persisted as typed change events",
	tierChanges.length > 0,
	JSON.stringify(tierChanges.map((entry) => (entry as never)["serviceTier"])),
);
log.record(
	"T05.4b",
	"only the EFFECTIVE (clamped) service tier is recorded: the requested `priority` tier left no trace",
	!tierChanges.some((entry) => (entry as never)["serviceTier"] === "priority"),
	`recorded tiers: ${JSON.stringify(tierChanges.map((entry) => (entry as never)["serviceTier"]))}; "priority" was requested`,
);
log.record(
	"T05.4c",
	"change events are emitted only on an effective change, so a no-op request is unrecorded",
	tierChanges.length === 1,
	`two setServiceTier calls produced ${tierChanges.length} change event(s)`,
);
log.record(
	"T05.5",
	"each assistant response records provider, api and the requested model id",
	assistantMessages.every((message) => message.provider && message.api && message.model),
	JSON.stringify(assistantMessages.map((message) => ({ provider: message.provider, api: message.api, model: message.model }))),
);
log.record(
	"T05.6",
	"a routed/concrete responseModel that differs from the requested model IS persisted per response when the provider supplies it",
	assistantMessages.some((message) => message.responseModel === ROUTED_MODEL && message.model !== ROUTED_MODEL),
	JSON.stringify(assistantMessages.map((message) => ({ model: message.model, responseModel: message.responseModel ?? null }))),
);
log.record(
	"T05.7",
	"a provider response id IS persisted per response when the provider supplies one",
	assistantMessages.some((message) => message.responseId === RESPONSE_ID),
	JSON.stringify(assistantMessages.map((message) => message.responseId ?? null)),
);
log.record(
	"T05.8",
	"responseModel / responseId are OPTIONAL: the response that did not supply them records neither",
	assistantMessages.some((message) => !("responseModel" in message) && !("responseId" in message)),
);
log.record(
	"T05.9",
	"usage and stopReason are persisted per response",
	assistantMessages.every((message) => message.usage && message.stopReason),
);

// ---- absence checks, over the entire persisted file ----
const wholeFile = readFileSync(sessionFile, "utf8");
const absent: Record<string, boolean> = {};
function checkAbsent(label: string, pattern: RegExp): void {
	absent[label] = !pattern.test(wholeFile);
}
checkAbsent("temperature", /"temperature"/);
checkAbsent("seed", /"seed"/);
checkAbsent("topP / topK sampling params", /"top[_]?[PpKk]"/);
checkAbsent("model revision / snapshot", /"model(Revision|Snapshot|Version)"/i);
checkAbsent("model catalog hash/version", /"(catalog|modelCatalog)(Hash|Version)"/i);
checkAbsent("full effective system prompt", /"systemPrompt"/);
checkAbsent("system prompt hash", /"(systemPromptHash|promptHash)"/i);
checkAbsent("harness snapshot per request", /"harnessSnapshot"/i);
checkAbsent("harness hash per request", /"harnessHash"/i);
checkAbsent("per-response thinking level", /"message":\{[^}]*"thinkingLevel"/);
checkAbsent("per-response service tier", /"message":\{[^}]*"serviceTier"/);
checkAbsent("tool versions", /"toolVersion"/i);
checkAbsent("skill versions", /"skillVersion"/i);
checkAbsent("provider baseUrl per response", /"baseUrl"/);

raw.absenceChecks = absent;
for (const [label, isAbsent] of Object.entries(absent)) {
	log.record(`T05.abs.${label.replace(/[^a-z0-9]+/gi, "_")}`, `NOT RECORDED: ${label}`, isAbsent);
}

// =====================================================================
// Inventory
// =====================================================================
const inventory = {
	RECORDED_PER_SESSION: {
		fields: headerKeys,
		note: "session header: id, timestamp, cwd, optional parentSession/rlmDepth/git. No provider, model, or sampling configuration.",
	},
	RECORDED_AS_CHANGE_EVENT: {
		model_change: { fields: ["provider", "modelId"], count: modelChanges.length },
		thinking_level_change: { fields: ["thinkingLevel"], count: thinkingChanges.length },
		service_tier_change: { fields: ["serviceTier"], count: tierChanges.length },
		note: "Change events are append-only and tree-positioned, so the configuration in force at any entry is reconstructible by walking the branch. They record the EFFECTIVE value after clamping, and only when it actually changes - a rejected or no-op request leaves no record.",
	},
	RECORDED_PER_ASSISTANT_RESPONSE: {
		alwaysPresent: assistantKeys.filter((key) =>
			assistantMessages.every((message) => key in message),
		),
		sometimesPresent: assistantKeys.filter((key) => !assistantMessages.every((message) => key in message)),
		note: "responseModel and responseId are recorded only when the provider supplies them.",
	},
	NOT_RECORDED: Object.entries(absent)
		.filter(([, isAbsent]) => isAbsent)
		.map(([label]) => label),
	LATENT_PROVIDER_HIDDEN: [
		"the provider's own default sampling parameters (temperature/top_p/penalties) applied server-side",
		"the concrete weight snapshot behind an alias model id when the provider does not echo one",
		"routing decisions inside a gateway that does not populate chunk.model",
		"server-side prompt-cache state that changes cacheRead/cacheWrite between otherwise identical runs",
		"provider-side safety/system injections not visible in the request payload",
	],
};

// Reproducibility boundary derived strictly from the checks above.
const boundary = {
	reconstructibleFromRecords: [
		"which provider and which requested model id was in force at each point in the session tree",
		"which thinking level and service tier were in force at each point",
		"the concrete routed model for a response, WHEN the provider echoed one",
		"the provider response id, WHEN the provider supplied one",
		"per-response token usage and stop reason",
	],
	notReconstructibleFromRecords: [
		"a configuration value that was REQUESTED but clamped or rejected (only the effective value is recorded)",
		"the exact bytes of the system prompt sent with any request",
		"the harness state in force at any specific request (no snapshot or hash)",
		"sampling configuration: temperature, top_p, seed",
		"the model weight revision/snapshot behind the model id",
		"the model catalog version the id was resolved against",
		"tool and skill versions active during the run",
	],
	consequence:
		"Records are sufficient to say WHICH NOMINAL CONFIGURATION a turn ran under, and insufficient to establish that two runs were CONTROLLED-EQUIVALENT.",
};

raw.inventory = inventory;
raw.reproducibilityBoundary = boundary;
raw.assistantMessages = assistantMessages;
raw.headerKeys = headerKeys;
raw.changeEvents = { modelChanges, thinkingChanges, tierChanges };
raw.assertions = log.entries;

writeJsonArtifact(`${ART}/raw-result.json`, raw);
writeArtifact(
	`${ART}/inventory.md`,
	[
		"# Test 05 - persisted model/configuration inventory",
		"",
		"## RECORDED PER SESSION",
		...headerKeys.map((key) => `- \`${key}\``),
		"",
		"## RECORDED AS CHANGE EVENT",
		"- `model_change` -> `provider`, `modelId`",
		"- `thinking_level_change` -> `thinkingLevel`",
		"- `service_tier_change` -> `serviceTier`",
		"",
		"## RECORDED PER ASSISTANT RESPONSE (always)",
		...inventory.RECORDED_PER_ASSISTANT_RESPONSE.alwaysPresent.map((key) => `- \`${key}\``),
		"",
		"## RECORDED PER ASSISTANT RESPONSE (only when the provider supplies it)",
		...inventory.RECORDED_PER_ASSISTANT_RESPONSE.sometimesPresent.map((key) => `- \`${key}\``),
		"",
		"## NOT RECORDED",
		...inventory.NOT_RECORDED.map((label) => `- ${label}`),
		"",
		"## LATENT / PROVIDER-HIDDEN",
		...inventory.LATENT_PROVIDER_HIDDEN.map((label) => `- ${label}`),
	].join("\n"),
);

rmSync(AGENT_DIR, { recursive: true, force: true });
console.log(`\nall assertions passed: ${log.allPassed}`);
process.exit(log.allPassed ? 0 : 1);
