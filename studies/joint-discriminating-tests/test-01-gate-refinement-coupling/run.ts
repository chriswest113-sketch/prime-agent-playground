/**
 * TEST 01 - Gate -> refinement transcript coupling.
 *
 * Question: can an autonomous quality-gate failure reach the /refine refiner,
 * and if so by what mechanism?
 *
 * Hypotheses under test:
 *   H0 NO CONNECTION                       - gate output never reaches the refiner request.
 *   H1 UNTYPED TRANSCRIPT-MEDIATED         - gate output reaches the refiner only as
 *                                            conversation text, with no typed field and no
 *                                            mechanical validation of gate outcome.
 *   H2 MECHANICALLY LINKED                 - a typed gate result is passed to refinement
 *                                            and/or the gate is re-validated after refinement.
 *
 * Run: npx tsx studies/joint-discriminating-tests/test-01-gate-refinement-coupling/run.ts
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

const AGENT_DIR = isolateAgentDir("t01");

const { fauxAssistantMessage } = await import("../../../packages/ai/src/index.js");
const { createHarness } = await import("../../../packages/coding-agent/test/suite/harness.js");
type Context = import("../../../packages/ai/src/index.js").Context;

const SENTINEL = "JOINT_GATE_SENTINEL_7F31";
const ART = "test-01-gate-refinement-coupling/artifacts";

const scratch = join(tmpdir(), `joint-study-t01-${process.pid}`);
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
const gateLogPath = join(scratch, "gate-invocations.log");

/**
 * Deliberately failing gate. Runs under `shell: true` with no args, appends one
 * line per invocation so gate executions can be counted across phases, and
 * prints the sentinel on stdout so the sentinel can only have reached the
 * refiner through gate output.
 */
const GATE_COMMAND = `printf '%s\\n' "${SENTINEL} assertion failed in verify_reward()" ; printf 'ran\\n' >> ${JSON.stringify(gateLogPath)} ; exit 3`;

function gateInvocationCount(): number {
	if (!existsSync(gateLogPath)) return 0;
	return readFileSync(gateLogPath, "utf8").split("\n").filter(Boolean).length;
}

const log = new AssertionLog();
const raw: Record<string, unknown> = { environment: environmentRecord(), sentinel: SENTINEL, gateCommand: GATE_COMMAND };

const harness = await createHarness({
	persistSession: true,
	autonomous: {
		enabled: true,
		maxContinuations: 1,
		gates: { commands: [GATE_COMMAND], maxRetries: 3, timeoutMs: 30_000 },
	},
});

/** Every provider request the faux provider saw, in order. */
interface CapturedRequest {
	index: number;
	systemPromptFirstLine: string;
	systemPromptLength: number;
	userTexts: string[];
}
const captured: CapturedRequest[] = [];
function capture(context: Context): void {
	captured.push({
		index: captured.length,
		systemPromptFirstLine: (context.systemPrompt ?? "").split("\n")[0] ?? "",
		systemPromptLength: (context.systemPrompt ?? "").length,
		userTexts: context.messages
			.filter((message) => message.role === "user")
			.map((message) => messageText(message)),
	});
}

let refinerRequest: { systemPrompt: string; userPrompt: string } | undefined;

try {
	harness.setResponses([
		(context) => {
			capture(context);
			return fauxAssistantMessage("Implemented the reward function. Task complete.");
		},
		(context) => {
			capture(context);
			return fauxAssistantMessage("Re-checked the reward function and adjusted the tolerance.");
		},
		// Third provider call is the /refine planning call issued by planRefinement().
		(context) => {
			capture(context);
			refinerRequest = {
				systemPrompt: context.systemPrompt ?? "",
				userPrompt: context.messages
					.filter((message) => message.role === "user")
					.map((message) => messageText(message))
					.join("\n"),
			};
			return fauxAssistantMessage(
				JSON.stringify({
					summary: "Record the reward-function tolerance lesson",
					rationale: "Trajectory shows a repeated failure in the reward function check.",
					expectedOutcome: "Future turns check tolerance before declaring completion.",
					edits: [
						{
							action: "create",
							kind: "memory",
							id: "t01_probe_memory",
							title: "Reward tolerance lesson",
							content: "Check reward tolerance before declaring completion.",
							path: "study/t01",
							reason: "probe",
						},
					],
				}),
			);
		},
	]);

	// ---- Phase 1: drive a real autonomous gate failure into the trajectory ----
	await harness.session.prompt("implement the reward function and finish");
	await settle(50);

	const gateRunsAfterPrompt = gateInvocationCount();
	const conversationMessages = harness.session.messages;
	const userTexts = conversationMessages.filter((m) => m.role === "user").map((m) => messageText(m));
	const continuationText = userTexts.find((text) => text.includes(SENTINEL));

	raw.phase1 = {
		gateInvocations: gateRunsAfterPrompt,
		autonomousStatus: harness.session.getAutonomousStatus(),
		userTexts,
		assistantTexts: conversationMessages.filter((m) => m.role === "assistant").map((m) => messageText(m)),
	};

	log.record(
		"T01.1",
		"the deliberately failing gate actually executed",
		gateRunsAfterPrompt > 0,
		`gate invocations = ${gateRunsAfterPrompt}`,
	);
	log.record(
		"T01.2",
		"the gate-failure continuation carrying the sentinel entered the session trajectory as a user message",
		Boolean(continuationText),
		continuationText ? `continuation length ${continuationText.length}` : "no user message contained the sentinel",
	);

	// ---- Phase 2: invoke the refinement planning boundary ----
	const gateRunsBeforeRefine = gateInvocationCount();
	const refineResult = await harness.session.refine({ instructions: "probe: capture the refiner request" });
	const gateRunsAfterRefine = gateInvocationCount();

	const conversationBlock = refinerRequest?.userPrompt.match(/<conversation>\n([\s\S]*?)\n<\/conversation>/)?.[1] ?? "";
	const harnessBlock =
		refinerRequest?.userPrompt.match(/<current_harness_state>\n([\s\S]*?)\n<\/current_harness_state>/)?.[1] ?? "";
	const historyBlock =
		refinerRequest?.userPrompt.match(/<refinement_history>\n([\s\S]*?)\n<\/refinement_history>/)?.[1] ?? "";

	raw.phase2 = {
		refinerRequestCaptured: Boolean(refinerRequest),
		refinerSystemPromptLength: refinerRequest?.systemPrompt.length ?? 0,
		refinerUserPromptLength: refinerRequest?.userPrompt.length ?? 0,
		refinerBlocksPresent: (refinerRequest?.userPrompt.match(/<[a-z_]+>/g) ?? []).map((tag) => tag),
		sentinelInFullRefinerRequest: refinerRequest?.userPrompt.includes(SENTINEL) ?? false,
		sentinelInConversationBlock: conversationBlock.includes(SENTINEL),
		sentinelInHarnessStateBlock: harnessBlock.includes(SENTINEL),
		sentinelInRefinementHistoryBlock: historyBlock.includes(SENTINEL),
		sentinelInRefinerSystemPrompt: refinerRequest?.systemPrompt.includes(SENTINEL) ?? false,
		gateInvocationsBeforeRefine: gateRunsBeforeRefine,
		gateInvocationsAfterRefine: gateRunsAfterRefine,
	};

	log.record(
		"T01.3",
		"the refiner planning request was captured through the faux provider (no credentials used)",
		Boolean(refinerRequest),
	);
	log.record(
		"T01.4",
		"the gate sentinel appears inside the <conversation> block supplied to the refiner",
		conversationBlock.includes(SENTINEL),
	);
	log.record(
		"T01.5",
		"the sentinel reaches the refiner ONLY through <conversation>, not through a dedicated gate field",
		conversationBlock.includes(SENTINEL) &&
			!harnessBlock.includes(SENTINEL) &&
			!historyBlock.includes(SENTINEL) &&
			!(refinerRequest?.systemPrompt.includes(SENTINEL) ?? false),
	);
	log.record(
		"T01.6",
		"C: the autonomous gate is NOT re-run as part of refinement",
		gateRunsAfterRefine === gateRunsBeforeRefine,
		`before=${gateRunsBeforeRefine} after=${gateRunsAfterRefine}`,
	);

	// ---- Phase 3: typed-identity inspection of the refinement record ----
	const resultJson = JSON.parse(JSON.stringify(refineResult)) as Record<string, unknown>;
	const resultKeys = Object.keys(resultJson).sort();
	const editKeys = [
		...new Set((refineResult.appliedEdits ?? []).flatMap((edit) => Object.keys(edit as object))),
	].sort();
	const gateShapedKeys = [...resultKeys, ...editKeys].filter((key) => /gate|attempt|exit|verif/i.test(key));
	const serializedResult = JSON.stringify(resultJson);

	raw.phase3 = {
		refinementResultKeys: resultKeys,
		appliedEditKeys: editKeys,
		gateShapedKeys,
		sentinelInRefinementResult: serializedResult.includes(SENTINEL),
		refinementResult: resultJson,
	};

	log.record(
		"T01.7",
		"B: the persisted RefinementResult carries no gate-typed field",
		gateShapedKeys.length === 0,
		`gate-shaped keys: ${JSON.stringify(gateShapedKeys)}`,
	);
	log.record(
		"T01.8",
		"B: the RefinementResult does not record the gate outcome that preceded it",
		!serializedResult.includes(SENTINEL),
	);

	// ---- Phase 4: source-anchored cross-reference scan ----
	const refinementSource = readFileSync(
		join(STUDY_ROOT, "../../packages/coding-agent/src/core/refinement/refinement.ts"),
		"utf8",
	);
	const autonomousSource = readFileSync(
		join(STUDY_ROOT, "../../packages/coding-agent/src/core/autonomous.ts"),
		"utf8",
	);
	const gateSymbolsInRefinement = [
		"AgentAutonomousGateFailure",
		"lastGateFailure",
		"gateAttempts",
		"AutonomousGateResult",
		"refreshAutonomousQualityGates",
		"buildAutonomousGateFailureContinuation",
	].filter((symbol) => refinementSource.includes(symbol));
	const refinementSymbolsInAutonomous = [
		"RefinementResult",
		"planRefinement",
		"refineHarness",
		"HarnessState",
		"REFINEMENT_CUSTOM_TYPE",
	].filter((symbol) => autonomousSource.includes(symbol));

	raw.phase4 = {
		gateSymbolsReferencedByRefinementModule: gateSymbolsInRefinement,
		refinementSymbolsReferencedByAutonomousModule: refinementSymbolsInAutonomous,
		refinementImportsFromAutonomous: /from\s+"\.\.\/autonomous\.js"/.test(refinementSource),
		autonomousImportsFromRefinement: /from\s+"\.\/refinement/.test(autonomousSource),
	};

	log.record(
		"T01.9",
		"B: neither module imports or references the other's types (no static typed linkage)",
		gateSymbolsInRefinement.length === 0 && refinementSymbolsInAutonomous.length === 0,
		`refinement->gate: ${JSON.stringify(gateSymbolsInRefinement)}; autonomous->refinement: ${JSON.stringify(refinementSymbolsInAutonomous)}`,
	);

	// ---- Phase 5: D - the influence channel is text only ----
	// The refiner's own reply is unconstrained by the gate: the same request text
	// can produce any proposal. Demonstrate that the applied edit is whatever the
	// (faux) refiner said, not something derived from the gate result.
	const applied = refineResult.appliedEdits.filter((edit) => edit.applied);
	raw.phase5 = {
		appliedEditIds: applied.map((edit) => `${edit.action} ${edit.kind}:${edit.id}`),
		refinerProposalDrivenByModelReply: true,
	};
	log.record(
		"T01.10",
		"D: the applied edits come from the refiner reply, so gate text can only influence refinement probabilistically",
		applied.length === 1 && applied[0].id === "t01_probe_memory",
		`applied: ${JSON.stringify(raw.phase5.appliedEditIds)}`,
	);

	if (refinerRequest) {
		writeArtifact(`${ART}/refiner-request-system-prompt.txt`, refinerRequest.systemPrompt);
		writeArtifact(`${ART}/refiner-request-user-prompt.txt`, refinerRequest.userPrompt);
		writeArtifact(`${ART}/refiner-request-conversation-block.txt`, conversationBlock);
	}
	writeJsonArtifact(`${ART}/provider-requests.json`, captured);
} finally {
	harness.cleanup();
	rmSync(scratch, { recursive: true, force: true });
	rmSync(AGENT_DIR, { recursive: true, force: true });
}

raw.assertions = log.entries;
writeJsonArtifact(`${ART}/raw-result.json`, raw);
console.log(`\nall assertions passed: ${log.allPassed}`);
process.exit(log.allPassed ? 0 : 1);
