# Self-Contained Evidence Bundle

This directory is the evidence artifact. It is local to this checkout and is **not preserved on GitHub**; no remote is configured.

## Repository and study commits

- Baseline before study files: `97b994c3d7c45ca1ae635190e91e9e58ddf2577c`.
- Initial archaeology study: `0fc38f4fabafdf260256e545436dad347e9c0dcc` (`docs(study): add trajectory-driven harness baseline study and runtime logs`).
- Baseline-closure study: `7401ea97b3e1ed56f80dda605e60e46323e40a55` (`docs(study): close baseline runtime gaps`).
- The earlier conversation referenced study commit `6608e84`; that object is not present in the current Git object database (`git cat-file -t 6608e84` fails). The current history exposes `0fc38f4` with the initial study content and baseline parent. This discrepancy is preserved rather than reconciled by inference.

The preservation metadata commit is the next descendant containing this file and `manifest.sha256`. Its identity is discoverable from a copied repository but is not required to apply the reconstruction patch.

## Contents

- baseline and Git provenance: `provenance.md`;
- implementation conclusions: `implementation-map.md` and `baseline-closure.md`;
- classified claim/evidence ledger: `claim-evidence-ledger.md`;
- runtime results and raw outputs: `runtime-reproduction.md`, `runtime/`, and `runtime-closure/`;
- exact commands/outcomes: `exact-commands.md`;
- unresolved questions: `unresolved-questions.md`;
- controlled experimental plan, not yet executed: `experiment-plan.md`;
- reproducible credential-free probe: `live-kernel-probe.ts`;
- integrity inventory: `manifest.sha256`;
- reconstruction material: `reconstruction.patch`.

## Reconstruction

From a checkout at baseline `97b994c3d7c45ca1ae635190e91e9e58ddf2577c`:

```bash
git apply --index studies/trajectory-harness/reconstruction.patch
```

Because the patch is itself carried inside the evidence directory, a recipient outside Git should first copy `reconstruction.patch` to any temporary path, check out the baseline, and run `git apply --index /path/to/reconstruction.patch`. The patch recreates every substantive study file plus this bundle metadata and manifest; it intentionally does not recreate itself, avoiding self-referential patch content.

Verify reconstructed files from the repository root:

```bash
sha256sum -c studies/trajectory-harness/manifest.sha256
```

`manifest.sha256` excludes itself and `reconstruction.patch`. The former cannot contain its own stable digest; the latter is the transport used to reconstruct the manifested content.
