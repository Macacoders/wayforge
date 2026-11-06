#!/usr/bin/env python3
"""Prepare fresh single-model evaluation sources offline; never execute a run."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import tempfile

import evaluation_runner as runner
from prepare_comparison import file_hashes, pin_shared_model, workspace_digest
from run_skillsbench_probe import FREE_MODELS


def prepare(manifest_path: Path) -> Path:
    if not runner.EvaluationManifest._within(manifest_path, runner.EVAL_ROOT):
        raise ValueError("Manifest must be inside the ignored evaluation root")
    runner._assert_no_source_symlinks(manifest_path)
    raw = json.loads(manifest_path.read_text())
    manifest = runner.EvaluationManifest.from_dict(raw)
    if manifest.plan.model not in FREE_MODELS:
        raise ValueError("Evaluation preparation requires a declared free model")
    # Verify pins, original digests, required files and markdown before copying.
    # Only JSON model assignments may be repaired, never stale source evidence.
    runner.validate_inputs(manifest, check_models=False)
    destination = Path(tempfile.mkdtemp(prefix="evaluation-sources-", dir=runner.EVAL_ROOT))
    destination.chmod(0o700)
    try:
        for item in raw["variants"]:
            variant = manifest.variants[item["name"]]
            target = destination / variant.name
            shutil.copytree(variant.path, target)
            if runner.EvaluationManifest.workspace_digest(target) != variant.digest:
                raise ValueError("Copied workspace digest does not match manifest")
            pin_shared_model(target / "opencode.jsonc", manifest.plan.model, prune_models=False)
            runner._assert_run_config(target, manifest.plan.model)
            item["workspace"] = str(target)
            item["workspace_digest"] = workspace_digest(file_hashes(target))
        result = destination / "evaluation-run.json"
        result.write_text(json.dumps(raw, indent=2) + "\n")
        result.chmod(0o600)
        return result
    except BaseException:
        shutil.rmtree(destination)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="Existing private evaluation-run manifest")
    args = parser.parse_args()
    print(json.dumps({"manifest": str(prepare(args.manifest)), "status": "prepared_not_run"}))


if __name__ == "__main__":
    main()
