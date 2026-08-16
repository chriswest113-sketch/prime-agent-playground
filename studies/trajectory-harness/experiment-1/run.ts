import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import {
	getHarnessStatePath,
	getLocalHarnessStateDir,
	loadHarnessState,
	REFINEMENT_CUSTOM_TYPE,
} from "../../../packages/coding-agent/src/core/refinement/index.js";
import { createHarness, type Harness } from "../../../packages/coding-agent/test/suite/harness.js";

interface RunRecord {
	runId: string;
	condition: "A-disabled" | "B-local" | "C-global";
	agentDir: string;
	sessionFile?: string;
	localStatePath?: string;
	globalStatePath: string;
	refinementIds: string[];
	promptIncluded: boolean;
	rollbackApplied: boolean;
	stateHashes: Record<string, string>;
}

const root = mkdtempSync(join(tmpdir(), "prime-agent-experiment-1-"));
const outputDir = join(process.cwd(), "studies", "trajectory-harness", "experiment-1", "artifacts");
const originalAgentDir = process.env.PRIME_AGENT_CODING_AGENT_DIR;

function semanticHashFile(path: string | undefined): string | undefined {
	if (!path || !existsSync(path)) return undefined;
	const volatileKeys = new Set(["id", "parentId", "timestamp", "created_at", "updated_at", "harnessStatePath", "rollbackOf"]);
	const normalize = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(normalize);
		if (value && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value)
					.filter(([key]) => !volatileKeys.has(key))
					.map(([key, item]) => [key, normalize(item)]),
			);
		}
		return value;
	};
	const text = readFileSync(path, "utf8");
	const parsed = path.endsWith(".jsonl")
		? text
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as Record<string, unknown>)
				.filter((entry) => entry.type === "message" || (entry.type === "custom" && entry.customType === REFINEMENT_CUSTOM_TYPE))
				.map((entry) => {
					if (entry.type === "message") {
						const message = entry.message as Record<string, unknown>;
						return { type: "message", role: message.role, content: message.content, stopReason: message.stopReason };
					}
					if (entry.type === "custom" && entry.customType === REFINEMENT_CUSTOM_TYPE) {
						const data = entry.data as { appliedEdits?: Array<Record<string, unknown>> };
						return {
							type: "refinement",
							appliedEdits: (data.appliedEdits ?? []).map((edit) => ({
								action: edit.action,
								kind: edit.kind,
								applied: edit.applied,
								error: edit.error,
								before: normalize(edit.before),
								after: normalize(edit.after),
							})),
						};
					}
					return normalize(entry);
				})
		: (JSON.parse(text) as unknown);
	const semantic =
		!path.endsWith(".jsonl") && parsed && typeof parsed === "object" && "entries" in parsed
			? { schema: (parsed as { schema?: unknown }).schema, entries: normalize((parsed as { entries: unknown }).entries) }
			: normalize(parsed);
	return createHash("sha256").update(JSON.stringify(semantic)).digest("hex");
}

function gitEvidenceOutsideStudy(): string {
	return execFileSync(
		"git",
		[
			"status",
			"--porcelain=v1",
			"--untracked-files=all",
			"--",
			".",
			":(exclude)studies/trajectory-harness/experiment-1",
		],
		{ encoding: "utf8" },
	);
}

async function seedTrajectory(harness: Harness): Promise<void> {
	harness.setResponses([
		fauxAssistantMessage("I used the guessed command `npm test`; it failed because this repository forbids that command."),
		fauxAssistantMessage("I repeated `npm test`; the same policy failure occurred again."),
	]);
	await harness.session.prompt("Validate the repository using npm test.");
	await harness.session.prompt("Retry the same validation approach.");
}

function proposal(scope: "local" | "global") {
	return fauxAssistantMessage(
		JSON.stringify({
			summary: `Record the repeated validation-policy failure in ${scope} scope`,
			rationale: "Two trajectory turns repeated the forbidden npm test command and reported the same policy failure.",
			expectedOutcome: "The next turn sees a supplemental prompt note directing it to repository-approved checks.",
			edits: [
				{
					action: "create",
					kind: "prompt",
					id: "experiment_1_validation_policy",
					title: "Experiment 1 validation policy",
					content: "For the experiment fixture, do not run npm test; use only the repository-approved targeted check.",
					path: "study/experiment-1",
					metadata: { scope, trajectoryEvidence: ["turn-1", "turn-2"] },
					reason: "The same incorrect command was selected twice.",
				},
			],
		}),
	);
}

async function runCondition(condition: RunRecord["condition"], batchRoot: string): Promise<RunRecord> {
	const runId = `experiment-1-${condition}`;
	const runRoot = join(batchRoot, runId);
	const agentDir = join(runRoot, "agent-home");
	mkdirSync(agentDir, { recursive: true });
	process.env.PRIME_AGENT_CODING_AGENT_DIR = agentDir;
	const harness = await createHarness({ persistSession: true });
	try {
		await seedTrajectory(harness);
		let refinementIds: string[] = [];
		let rollbackApplied = false;
		if (condition !== "A-disabled") {
			harness.setResponses([proposal(condition === "C-global" ? "global" : "local")]);
			const result = await harness.session.refine({ global: condition === "C-global" });
			refinementIds = [result.id];
			if (!result.appliedEdits.every((edit) => edit.applied)) {
				throw new Error(`${condition} refinement did not apply cleanly`);
			}
		}

		const promptIncluded = harness.session.agent.state.systemPrompt.includes("Experiment 1 validation policy");
		if (condition === "A-disabled" ? promptIncluded : !promptIncluded) {
			throw new Error(`${condition} prompt inclusion mismatch`);
		}

		const localDir = getLocalHarnessStateDir(harness.sessionManager.getSessionArtifactDir());
		const localStatePath = localDir ? getHarnessStatePath(localDir) : undefined;
		const globalStatePath = getHarnessStatePath(join(agentDir, "harness"));
		const refinementEntries = harness.sessionManager
			.getEntries()
			.filter((entry) => entry.type === "custom" && entry.customType === REFINEMENT_CUSTOM_TYPE);
		if (refinementEntries.length !== refinementIds.length) {
			throw new Error(`${condition} refinement lineage mismatch`);
		}

		if (condition !== "A-disabled") {
			const localCount = localDir ? Object.keys(loadHarnessState(localDir, "local").entries.prompt).length : 0;
			const globalCount = Object.keys(loadHarnessState(join(agentDir, "harness"), "global").entries.prompt).length;
			if (condition === "B-local" && (localCount !== 1 || globalCount !== 0)) {
				throw new Error("local condition leaked into global state");
			}
			if (condition === "C-global" && (localCount !== 0 || globalCount !== 1)) {
				throw new Error("global condition leaked into local state");
			}
			const rollback = await harness.session.refine({ rollbackId: refinementIds[0] });
			refinementIds.push(rollback.id);
			rollbackApplied = rollback.appliedEdits.every((edit) => edit.applied);
			const selectedDir = condition === "C-global" ? join(agentDir, "harness") : localDir;
			if (!selectedDir || Object.keys(loadHarnessState(selectedDir, condition === "C-global" ? "global" : "local").entries.prompt).length !== 0) {
				throw new Error(`${condition} rollback did not restore empty prompt state`);
			}
		}

		await harness.session.disposeAsync();
		const sessionFile = harness.sessionManager.getSessionFile();
		const archivedRuntime = join(runRoot, "session-runtime");
		cpSync(harness.tempDir, archivedRuntime, { recursive: true });
		const archivedSessionFile = sessionFile?.replace(harness.tempDir, archivedRuntime);
		const archivedLocalStatePath = localStatePath?.replace(harness.tempDir, archivedRuntime);
		return {
			runId,
			condition,
			agentDir,
			...(archivedSessionFile ? { sessionFile: archivedSessionFile } : {}),
			...(archivedLocalStatePath ? { localStatePath: archivedLocalStatePath } : {}),
			globalStatePath,
			refinementIds,
			promptIncluded,
			rollbackApplied,
			stateHashes: Object.fromEntries(
				[
					["session", semanticHashFile(sessionFile)],
					["localHarness", semanticHashFile(localStatePath)],
					["globalHarness", semanticHashFile(globalStatePath)],
				].filter((item): item is [string, string] => typeof item[1] === "string"),
			),
		};
	} finally {
		harness.cleanup();
	}
}

try {
	const before = gitEvidenceOutsideStudy();
	const primaryRoot = join(root, "primary");
	const replicationRoot = join(root, "replication");
	const records = [];
	const replicationRecords = [];
	for (const condition of ["A-disabled", "B-local", "C-global"] as const) {
		records.push(await runCondition(condition, primaryRoot));
		replicationRecords.push(await runCondition(condition, replicationRoot));
	}
	for (const record of records) {
		const replication = replicationRecords.find((item) => item.condition === record.condition)!;
		if (JSON.stringify(record.stateHashes) !== JSON.stringify(replication.stateHashes)) {
			throw new Error(`${record.condition} semantic state hashes were not reproducible: ${JSON.stringify({ primary: record.stateHashes, replication: replication.stateHashes })}`);
		}
	}
	const after = gitEvidenceOutsideStudy();
	if (before !== after) throw new Error("experiment mutated the worktree outside its isolated study path");

	const a = records.find((record) => record.condition === "A-disabled")!;
	const b = records.find((record) => record.condition === "B-local")!;
	const c = records.find((record) => record.condition === "C-global")!;
	if (existsSync(a.globalStatePath) || existsSync(a.localStatePath ?? "")) throw new Error("disabled condition wrote harness state");
	if (b.agentDir === c.agentDir) throw new Error("local and global conditions shared an agent home");

	rmSync(outputDir, { recursive: true, force: true });
	mkdirSync(outputDir, { recursive: true });
	for (const record of records) {
		cpSync(join(primaryRoot, record.runId), join(outputDir, record.runId), { recursive: true });
	}
	const portableRecords = records.map((record) => ({
		...record,
		agentDir: record.agentDir.replace(primaryRoot, "<experiment-root>"),
		sessionFile: record.sessionFile?.replace(primaryRoot, "<experiment-root>"),
		localStatePath: record.localStatePath?.replace(primaryRoot, "<experiment-root>"),
		globalStatePath: record.globalStatePath.replace(primaryRoot, "<experiment-root>"),
	}));
	writeFileSync(
		join(outputDir, "result.json"),
		`${JSON.stringify({ experiment: 1, baseline: "7b69442ed56d3d72e30ab81fc71d2e79a30807de", records: portableRecords }, null, 2)}\n`,
	);
	console.log(JSON.stringify({ status: "pass", records: portableRecords }, null, 2));
} finally {
	if (originalAgentDir === undefined) delete process.env.PRIME_AGENT_CODING_AGENT_DIR;
	else process.env.PRIME_AGENT_CODING_AGENT_DIR = originalAgentDir;
	rmSync(root, { recursive: true, force: true });
}
