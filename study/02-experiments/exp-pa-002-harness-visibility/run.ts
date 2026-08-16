/**
 * EXP-PA-002 — How much of an accumulated continual harness can the model still see?
 *
 * Subject: prime-agent @ 97b994c3d7c45ca1ae635190e91e9e58ddf2577c
 * Motivation: EXP-PA-001/H5 showed the prompt view is a hard-capped, alphabetically
 *   selected sample. This quantifies the consequence across growth and naming regimes.
 *
 * Fully deterministic: no LLM, no network. Uses the real `formatHarnessStateForPrompt`.
 *
 * Measures, per condition:
 *   recall@recent  — fraction of the 10 most recently written entries that appear in the prompt
 *   coverage       — fraction of all entries that appear
 *   age_of_visible — how old (in write order) the visible entries are, normalized 0..1
 *                    (0 = oldest write, 1 = newest write)
 */
import {
	formatHarnessStateForPrompt,
	type HarnessEntry,
	type HarnessState,
} from "../../../packages/coding-agent/src/core/refinement/index.js";

function emptyState(): HarnessState {
	return { schema: 1, entries: { prompt: {}, memory: {}, skill: {}, subagent: {} }, refinements: [] };
}

function entry(id: string, title: string, order: number): HarnessEntry {
	return {
		id,
		kind: "memory",
		title,
		content: `lesson learned at step ${order}: avoid the failure mode observed in run ${order}`,
		path: "general",
		scope: "local",
		reference: {},
		arguments: {},
		metadata: {},
		source: "refine",
		created_at: new Date(1_700_000_000_000 + order * 1000).toISOString(),
		updated_at: new Date(1_700_000_000_000 + order * 1000).toISOString(),
		version: 1,
	};
}

/** Naming regimes a real session might plausibly produce. */
const REGIMES: Record<string, (i: number) => { id: string; title: string }> = {
	// Refiner slugs ids from titles. Numeric suffixes are the common case.
	"numbered (lesson_1, lesson_2, ...)": (i) => ({ id: `lesson_${i}`, title: `Lesson ${i}` }),
	// Zero-padded: the only regime where lexical order == write order.
	"zero-padded (lesson_0001, ...)": (i) => ({
		id: `lesson_${String(i).padStart(4, "0")}`,
		title: `Lesson ${String(i).padStart(4, "0")}`,
	}),
	// Descriptive titles, as the refinement prompt actually encourages.
	"descriptive (topic-led)": (i) => {
		const topics = [
			"Always run the project's own test command",
			"Build before running extension tests",
			"Check the daemon protocol version",
			"Do not install deps into the kernel",
			"Env vars do not persist across bash cells",
			"Prefer uv run for python projects",
			"Use %cd not cd for directory changes",
			"Validate JSON before writing state",
			"Worktree snapshot gates skip unchanged runs",
			"Zero-length output means the gate timed out",
		];
		const t = `${topics[i % topics.length]} (${i})`;
		return { id: t.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 80), title: t };
	},
};

const SIZES = [6, 10, 25, 50, 100, 500];
const RECENT_WINDOW = 10;

console.log("EXP-PA-002 — continual harness prompt visibility under growth");
console.log("Real function under test: formatHarnessStateForPrompt (refinement.ts:429)");
console.log("Caps: DEFAULT_OVERVIEW_ENTRY_LIMIT=6, CONTENT_LIMIT=180 chars/entry\n");

const rows: string[] = [];
rows.push(
	"| naming regime | N entries | visible | coverage | recall@recent10 | mean age of visible (0=oldest,1=newest) |",
);
rows.push("|---|---|---|---|---|---|");

for (const [regimeName, make] of Object.entries(REGIMES)) {
	for (const N of SIZES) {
		const state = emptyState();
		const writeOrder: string[] = [];
		for (let i = 1; i <= N; i++) {
			const { id, title } = make(i);
			state.entries.memory[id] = entry(id, title, i);
			writeOrder.push(id);
		}
		const rendered = formatHarnessStateForPrompt(state);
		// Rendered lines look like: `- [local:<id>] <title> (<path>, v1)...`
		const visible = [...rendered.matchAll(/^- \[(?:local|global):([^\]]+)\]/gm)].map((m) => m[1]);
		const visibleSet = new Set(visible);

		const recent = writeOrder.slice(-RECENT_WINDOW);
		const recallRecent = recent.filter((id) => visibleSet.has(id)).length / recent.length;
		const coverage = visible.length / N;
		const ages = visible
			.map((id) => writeOrder.indexOf(id))
			.filter((idx) => idx >= 0)
			.map((idx) => (N === 1 ? 1 : idx / (N - 1)));
		const meanAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : Number.NaN;

		rows.push(
			`| ${regimeName} | ${N} | ${visible.length} | ${(coverage * 100).toFixed(1)}% | ` +
				`${(recallRecent * 100).toFixed(0)}% | ${meanAge.toFixed(3)} |`,
		);
	}
}
console.log(rows.join("\n"));

// ---- Worked illustration at N=100, numbered regime -------------------------
{
	const state = emptyState();
	for (let i = 1; i <= 100; i++) {
		const { id, title } = REGIMES["numbered (lesson_1, lesson_2, ...)"](i);
		state.entries.memory[id] = entry(id, title, i);
	}
	const rendered = formatHarnessStateForPrompt(state);
	const visible = [...rendered.matchAll(/^- \[(?:local|global):([^\]]+)\]/gm)].map((m) => m[1]);
	console.log(`\n--- Worked case: 100 numbered lessons written in order lesson_1..lesson_100 ---`);
	console.log(`Visible to the model : ${visible.join(", ")}`);
	console.log(`Overflow line        : ${/\+(\d+) more memory entries/.exec(rendered)?.[0] ?? "(none)"}`);
	console.log(`Most recent lesson (lesson_100) visible? ${visible.includes("lesson_100")}`);
	console.log(`Rendered prompt size : ${rendered.length} chars for 100 stored lessons`);
	console.log(
		`\nMechanism: sort key is [path, title, id].join("\\0") localeCompare (refinement.ts:467-469),\n` +
			`then .slice(0, 6) (refinement.ts:481). Lexical order of "Lesson 10" < "Lesson 2" means\n` +
			`the visible window is decided by string collation, not by when the lesson was learned.`,
	);
}

// ---- Content truncation ---------------------------------------------------
{
	const state = emptyState();
	const long = "A".repeat(1000);
	state.entries.memory.big = { ...entry("big", "Big", 1), content: long };
	const rendered = formatHarnessStateForPrompt(state);
	const line = rendered.split("\n").find((l) => l.includes("[local:big]")) ?? "";
	const shown = line.length;
	console.log(`\n--- Content truncation ---`);
	console.log(`stored content = ${long.length} chars; rendered entry line = ${shown} chars`);
	console.log(`ends with ellipsis: ${line.trimEnd().endsWith("...")} (DEFAULT_OVERVIEW_CONTENT_LIMIT=180)`);
	console.log(`=> a lesson longer than ~180 chars is never fully visible in the routing view.`);
}
