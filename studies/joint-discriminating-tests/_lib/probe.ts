/**
 * Shared helpers for the joint discriminating-test probes.
 *
 * These probes are deliberately NOT vitest tests in the production suite. They
 * run as standalone `tsx` scripts inside `studies/joint-discriminating-tests/`
 * so the study never mutates the repository's own test boundary. They import
 * production source directly (no instrumentation, no patching) and write raw
 * artifacts next to each probe.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Absolute path to `studies/joint-discriminating-tests/`. */
export const STUDY_ROOT = join(import.meta.dirname, "..");

/**
 * Point the agent's global config dir at a throwaway location BEFORE any
 * production module reads it. `getAgentDir()` is called lazily, but
 * `getGlobalHarnessStateDir()` resolves at call time, so setting the env var at
 * probe start is sufficient and keeps the operator's real `~/.prime/agent`
 * untouched.
 */
export function isolateAgentDir(label: string): string {
	const dir = join(tmpdir(), `joint-study-agentdir-${label}-${process.pid}`);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	process.env.PRIME_AGENT_CODING_AGENT_DIR = dir;
	return dir;
}

export function writeArtifact(relativePath: string, contents: string): string {
	const path = join(STUDY_ROOT, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");
	return path;
}

export function writeJsonArtifact(relativePath: string, value: unknown): string {
	return writeArtifact(relativePath, JSON.stringify(value, null, 2));
}

/** Environment facts recorded with every probe run so results stay auditable. */
export function environmentRecord(): Record<string, unknown> {
	return {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		cwd: process.cwd(),
		agentDirEnv: process.env.PRIME_AGENT_CODING_AGENT_DIR,
		providerCredentialsPresent: providerCredentialSummary(),
	};
}

/**
 * Credential-free is a claim this study makes repeatedly, so record the actual
 * probe-visible provider key surface rather than asserting it.
 */
export function providerCredentialSummary(): Record<string, boolean> {
	const names = [
		"ANTHROPIC_API_KEY",
		"ANTHROPIC_OAUTH_TOKEN",
		"OPENAI_API_KEY",
		"GEMINI_API_KEY",
		"GROQ_API_KEY",
		"XAI_API_KEY",
		"OPENROUTER_API_KEY",
		"MISTRAL_API_KEY",
		"KIMI_API_KEY",
		"ZAI_API_KEY",
		"PRIME_API_KEY",
	];
	return Object.fromEntries(names.map((name) => [name, Boolean(process.env[name])]));
}

export interface Assertion {
	id: string;
	claim: string;
	pass: boolean;
	detail?: string;
}

export class AssertionLog {
	readonly entries: Assertion[] = [];

	record(id: string, claim: string, pass: boolean, detail?: string): void {
		this.entries.push({ id, claim, pass, detail });
		const mark = pass ? "PASS" : "FAIL";
		console.log(`[${mark}] ${id}: ${claim}${detail ? ` -- ${detail}` : ""}`);
	}

	get allPassed(): boolean {
		return this.entries.every((entry) => entry.pass);
	}
}

/** Text of an agent message regardless of string/blocks representation. */
export function messageText(message: unknown): string {
	if (!message || typeof message !== "object" || !("content" in message)) {
		return "";
	}
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.filter((block): block is { type: "text"; text: string } => {
			return Boolean(block) && typeof block === "object" && (block as { type?: string }).type === "text";
		})
		.map((block) => block.text)
		.join("\n");
}

export async function settle(ms = 30): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
