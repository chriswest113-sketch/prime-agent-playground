#!/usr/bin/env bash
# Re-run every joint discriminating-test probe and capture raw console output.
#
#   bash studies/joint-discriminating-tests/run-all.sh
#
# Each probe exits non-zero if any of its assertions fail. Probes are
# credential-free: they use the in-repo faux provider and an isolated agent
# config dir, and they never write to the operator's real ~/.prime/agent.
# pipefail matters: each probe's output is piped through `tee`, and without it the
# pipeline would report tee's exit status and silently mask a failing probe.
set -u
set -o pipefail

cd "$(dirname "$0")/../.." || exit 1

PROBES=(
	"test-01-gate-refinement-coupling"
	"test-02-turn-harness-attribution"
	"test-03-routing-vs-retrieval"
	"test-04-normalized-reproducibility"
	"test-05-model-config-record"
	"external-evaluator"
)

status=0

# Type-check first. `studies/` is outside the repository's own tsconfig include
# and biome globs, so `npm run check` never looks at these probes; skipping this
# step once already let an invalid ServiceTier literal through and invalidated a
# probe's evidence.
echo "=============================================================="
echo "TYPECHECK: studies/joint-discriminating-tests"
echo "=============================================================="
if npx tsgo --noEmit -p studies/joint-discriminating-tests/tsconfig.json; then
	echo "-> typecheck: PASS"
else
	echo "-> typecheck: FAIL"
	status=1
fi
echo

for probe in "${PROBES[@]}"; do
	echo "=============================================================="
	echo "RUN: ${probe}"
	echo "=============================================================="
	out="studies/joint-discriminating-tests/${probe}/artifacts/console-output.txt"
	mkdir -p "$(dirname "${out}")"
	if npx tsx "studies/joint-discriminating-tests/${probe}/run.ts" 2>&1 | tee "${out}"; then
		echo "-> ${probe}: PASS"
	else
		echo "-> ${probe}: FAIL"
		status=1
	fi
	echo
done

echo "=============================================================="
echo "overall: $([ "${status}" -eq 0 ] && echo PASS || echo FAIL)"
exit "${status}"
