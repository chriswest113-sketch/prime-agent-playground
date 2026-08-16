/**
 * EXTERNAL EVALUATOR QUESTION (bounded, secondary).
 *
 * Question: does the external Verifiers / prime-rl integration close any part of
 * the score -> refinement loop?
 *
 * Scope rule from the brief: record only what is present in this repository or
 * trivially inspectable from existing local material. Anything requiring
 * external repository research is marked DEFERRED.
 *
 * This probe does two mechanical things:
 *   1. Inventories every in-repo Verifiers/prime-rl reference and classifies it.
 *   2. Runtime-tests the ONE inbound channel that could carry an evaluator
 *      signal into refinement (`refine({instructions})`) and records its shape.
 *
 * Run: npx tsx studies/joint-discriminating-tests/external-evaluator/run.ts
 */

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
	AssertionLog,
	environmentRecord,
	isolateAgentDir,
	messageText,
	STUDY_ROOT,
	writeJsonArtifact,
} from "../_lib/probe.js";

const AGENT_DIR = isolateAgentDir("ext");

const { fauxAssistantMessage } = await import("../../../packages/ai/src/index.js");
const { createHarness } = await import("../../../packages/coding-agent/test/suite/harness.js");
type Context = import("../../../packages/ai/src/index.js").Context;

const ART = "external-evaluator/artifacts";
const REPO_ROOT = join(STUDY_ROOT, "../..");
const log = new AssertionLog();
const raw: Record<string, unknown> = { environment: environmentRecord() };

// ---------------------------------------------------------------------
// 1. In-repo reference inventory.
// ---------------------------------------------------------------------
function ripgrep(pattern: string, globs: string[]): string[] {
	try {
		return execFileSync(
			"grep",
			["-rn", "-E", pattern, ...globs.flatMap((glob) => ["--include", glob]), REPO_ROOT, "--exclude-dir=node_modules", "--exclude-dir=studies", "--exclude-dir=.git"],
			{ encoding: "utf8" },
		)
			.split("\n")
			.filter(Boolean)
			.map((line) => line.replace(`${REPO_ROOT}/`, ""));
	} catch {
		return [];
	}
}

const verifiersRefs = ripgrep("verifiers|prime-rl|prime_rl|vf-prime|vf_prime", ["*.ts", "*.py", "*.md", "*.json", "*.toml", "*.sh", "*.yml", "*.yaml"]);
const rewardRefs = ripgrep('"reward"|reward_|rewardScore|"score"[^a-zA-Z]', ["*.ts"]).filter(
	(line) => !/fuzzyFilterScored|session-view-search|model-selector|rlm-runtime/.test(line),
);
const pythonAdapterFiles = ripgrep("load_environment|vf\\.Environment|verifiers as vf", ["*.py", "*.toml"]);

/** Classify every hit so "a mention" is never mistaken for "an integration". */
const classified = verifiersRefs.map((line) => {
	const path = line.split(":")[0];
	let kind: string;
	if (path.startsWith("packages/coding-agent/skills/") || path.startsWith("packages/coding-agent/docs/")) {
		kind = "DOCUMENTATION (prose describing external tools reachable via the `prime` CLI)";
	} else if (path.endsWith("README.md") || path.includes("CHANGELOG")) {
		kind = "PROJECT PROSE";
	} else if (path.includes("acp-meta.ts")) {
		kind = "OUTBOUND TELEMETRY SURFACE (ACP `_meta` payload a verifiers-aware client may read)";
	} else if (path.includes("autonomous.ts") && line.includes("vf-prime-agent")) {
		kind = "CO-DEPLOYMENT ARTIFACT (git pathspec excluding a verifiers working directory from gate snapshots)";
	} else if (path.includes("autonomous.ts")) {
		kind = "PROMPT PROSE (continuation text naming an external verifier/evaluator)";
	} else if (path.startsWith("packages/coding-agent/test/")) {
		kind = "TEST REFERENCE";
	} else {
		kind = "OTHER";
	}
	return { line, kind };
});

const kinds = [...new Set(classified.map((entry) => entry.kind))].sort();
/** Kinds that are, by construction, not an integration. Anything outside this set needs a human look. */
const NON_INTEGRATION_KINDS = new Set([
	"DOCUMENTATION (prose describing external tools reachable via the `prime` CLI)",
	"PROJECT PROSE",
	"OUTBOUND TELEMETRY SURFACE (ACP `_meta` payload a verifiers-aware client may read)",
	"CO-DEPLOYMENT ARTIFACT (git pathspec excluding a verifiers working directory from gate snapshots)",
	"PROMPT PROSE (continuation text naming an external verifier/evaluator)",
	"TEST REFERENCE",
]);
const unclassified = kinds.filter((kind) => !NON_INTEGRATION_KINDS.has(kind));

raw.inRepoInventory = {
	totalReferences: verifiersRefs.length,
	kinds,
	unclassifiedKinds: unclassified,
	classified,
	pythonAdapterFiles,
	rewardOrScoreSymbolsInCodingAgentSource: rewardRefs,
};

log.record(
	"EXT.1",
	"no version-matched Verifiers/prime-rl adapter, environment module, or consumer exists in this repository",
	pythonAdapterFiles.length === 0 && unclassified.length === 0,
	`python adapter files: ${JSON.stringify(pythonAdapterFiles)}; every one of the ${verifiersRefs.length} references falls into a known non-integration kind: ${JSON.stringify(kinds)}`,
);
log.record(
	"EXT.2",
	"the coding-agent source contains no reward/score concept at all",
	rewardRefs.length === 0,
	`hits: ${JSON.stringify(rewardRefs)}`,
);

// ---------------------------------------------------------------------
// 2. The only inbound channel: refine({instructions}).
// ---------------------------------------------------------------------
const harness = await createHarness({ persistSession: true });
let refinerUserPrompt = "";
try {
	harness.setResponses([fauxAssistantMessage("worked on the task")]);
	await harness.session.prompt("do the task");

	harness.appendResponses([
		(context: Context) => {
			refinerUserPrompt = context.messages
				.filter((message) => message.role === "user")
				.map((message) => messageText(message))
				.join("\n");
			return fauxAssistantMessage(
				JSON.stringify({ summary: "no-op", rationale: "probe", expectedOutcome: "none", edits: [] }),
			);
		},
	]);
	// The shape an external evaluator would have to use to feed a score back in.
	await harness.session.refine({ instructions: "evaluator reward=0.25 on task ext_probe_task" });
} finally {
	harness.cleanup();
}

const instructionsBlock =
	refinerUserPrompt.match(/<user_refine_instructions>\n([\s\S]*?)\n<\/user_refine_instructions>/)?.[1] ?? "";
const blocks = (refinerUserPrompt.match(/<([a-z_]+)>/g) ?? []).map((tag) => tag.slice(1, -1));

raw.inboundChannel = {
	refinerRequestBlocks: blocks,
	instructionsBlock,
	scoreCarriedAsFreeText: instructionsBlock.includes("reward=0.25"),
	typedScoreFieldPresent: /"?(reward|score)"?\s*[:=]/.test(JSON.stringify(blocks)),
};

log.record(
	"EXT.3",
	"an evaluator signal can only enter refinement as untyped free text inside <user_refine_instructions>",
	instructionsBlock.includes("reward=0.25") && !blocks.some((block) => /reward|score/.test(block)),
	`blocks: ${JSON.stringify(blocks)}`,
);
log.record(
	"EXT.4",
	"the refiner request has no typed score/reward field",
	!blocks.some((block) => /reward|score/i.test(block)),
);

raw.verdict = {
	inRepoAdapter: "ABSENT",
	scoreToRefinementClosure:
		"NOT CLOSED IN THIS REPOSITORY. The only inbound path is untyped free text via refine({instructions}); the only outbound path is ACP `_meta`, which reports autonomous gate state and refinement completion as two SEPARATE, unlinked payloads.",
	deferred:
		"DEFERRED - EXTERNAL REFERENCE STUDY REQUIRED: whether the external Verifiers / prime-rl side constructs such a loop cannot be determined from this repository. Establishing it requires reading version-matched PrimeIntellect-ai/verifiers and PrimeIntellect-ai/prime-rl, which is out of scope for this phase.",
	whatThisDoesNotEstablish: [
		"that no such loop exists anywhere - only that no part of it is implemented or consumed here",
		"anything about the external harness's own behaviour",
		"architectural intent (deliberately not inferred from comments)",
	],
};
raw.assertions = log.entries;
writeJsonArtifact(`${ART}/raw-result.json`, raw);
rmSync(AGENT_DIR, { recursive: true, force: true });

console.log(`\nall assertions passed: ${log.allPassed}`);
process.exit(log.allPassed ? 0 : 1);
