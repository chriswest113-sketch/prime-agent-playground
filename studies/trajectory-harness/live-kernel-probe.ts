import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { KernelManager } from "../../packages/coding-agent/src/core/kernel/index.js";

const python = process.env.PRIME_AGENT_KERNEL_PYTHON;
if (!python) throw new Error("PRIME_AGENT_KERNEL_PYTHON is required");

const root = mkdtempSync(join(tmpdir(), "prime-agent-study-kernel-"));
const localDir = join(root, "local-harness");
const globalDir = join(root, "global-harness");
const runtimeSrc = resolve("prime-agent-runtime/src");
const env = {
	PYTHONPATH: runtimeSrc,
	RLM_HARNESS_STATE_DIR: localDir,
	RLM_GLOBAL_HARNESS_STATE_DIR: globalDir,
};

try {
	const manager = new KernelManager({ python, cwd: root, env });
	try {
		const first = await manager.execute("study_value = 41");
		const second = await manager.execute("print(study_value + 1)");
		if (first.status !== "ok" || second.stdout.trim() !== "42") {
			throw new Error(`separate execution persistence failed: ${JSON.stringify({ first, second })}`);
		}
		const harness = await manager.execute(`
from rlm.harness import get_harness_state
h = get_harness_state()
h.create_prompt_note("Prompt", "Prompt content", id="prompt_probe")
h.create_memory("Memory", "Memory content", id="memory_probe")
h.create_skill("Skill", "Skill content", id="skill_probe", reference={"type":"python","import":"probe","callable":"run"}, arguments={})
h.create_subagent("Subagent", "Subagent content", id="subagent_probe")
h.record_refinement("live kernel probe", ["created four local kinds"], evidence="separate live-kernel execution", outcome="state file written")
h.create_memory("Global", "Global content", id="global_probe", global_=True)
print(len(h.list()), len(h.list(global_=True)))
`);
		if (harness.status !== "ok" || harness.stdout.trim() !== "4 1") {
			throw new Error(`live harness access failed: ${JSON.stringify(harness)}`);
		}
	} finally {
		await manager.dispose();
	}

	const reloaded = new KernelManager({ python, cwd: root, env });
	try {
		const reload = await reloaded.execute(`
from rlm.harness import get_harness_state
h = get_harness_state()
print(sorted((entry.kind, entry.id) for entry in h.list()))
print([(event.trigger, event.evidence, event.outcome) for event in h.refinements])
print([(entry.kind, entry.id) for entry in h.list(global_=True)])
`);
		if (reload.status !== "ok") throw new Error(`fresh-kernel harness reload failed: ${JSON.stringify(reload)}`);
		console.log(JSON.stringify({
			python,
			separateExecutionValue: 42,
			freshKernelHarnessOutput: reload.stdout.trim().split("\n"),
			localState: JSON.parse(readFileSync(join(localDir, "harness_state.json"), "utf8")),
			globalState: JSON.parse(readFileSync(join(globalDir, "harness_state.json"), "utf8")),
		}, null, 2));
	} finally {
		await reloaded.dispose();
	}
} finally {
	rmSync(root, { recursive: true, force: true });
}
