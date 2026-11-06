#!/usr/bin/env python3
"""Prepare a paired, offline SkillsBench comparison from a pinned probe install.

This copies only installed project files into ignored disposable workspaces.
It does not start Docker, BenchFlow, OpenCode, or a model. The one ablation
removes delivery-policy/SKILL.md from the variant copy only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile


REPO = Path(__file__).resolve().parents[2]
EVAL_ROOT = REPO / "temp/benchmark-testing"
MODEL = "opencode/big-pickle"
OPENCODE_VERSION = "1.18.35"
SKILL_PATH = Path(".opencode/skills/delivery-policy/SKILL.md")


def within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def pin_shared_model(path: Path, model: str = MODEL, *, prune_models: bool = True) -> None:
    """Apply the same evaluation-only model pin to both disposable variants."""
    raw = path.read_text()
    if raw.startswith("//"):
        raw = raw.partition("\n")[2]
    config = json.loads(raw)
    if not isinstance(config, dict):
        raise ValueError("Prepared config must be an object")
    if config.get("enabled_providers") != ["opencode"] or config.get("default_agent") != "delivery":
        raise ValueError("Unexpected prepared OpenCode config")
    model_id = model.partition("/")[2]
    provider = config.get("provider", {}).get("opencode", {})
    models = provider.get("models", {})
    if prune_models and model_id not in models:
        raise ValueError("Prepared config does not define the selected model")
    config["model"] = model
    config["small_model"] = model
    agents = config.get("agent")
    if not isinstance(agents, dict):
        raise ValueError("Prepared config has no agent models")
    for agent in agents.values():
        if not isinstance(agent, dict):
            raise ValueError("Prepared agent config must be an object")
        if "model" in agent:
            agent["model"] = model
    if prune_models:
        provider["models"] = {model_id: models[model_id]}
    path.write_text(json.dumps(config, indent=2) + "\n")


def file_hashes(root: Path) -> dict[str, str]:
    files = {}
    for path in root.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"Symlink is not allowed in a comparison workspace: {path}")
        if path.is_file():
            files[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return files


def workspace_digest(files: dict[str, str]) -> str:
    canonical = json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(canonical).hexdigest()


def prepare(manifest_path: Path) -> dict[str, object]:
    manifest_path = manifest_path.resolve()
    if not within(manifest_path, EVAL_ROOT):
        raise ValueError("Probe manifest must be inside the ignored evaluation root")
    source = json.loads(manifest_path.read_text())
    workspace = Path(source["workspace"]).resolve()
    if not within(workspace, EVAL_ROOT) or not workspace.is_dir():
        raise ValueError("Prepared workspace is missing or outside the evaluation root")
    benchmark_sha = source.get("skillsbench_sha")
    wayforge_sha = source.get("wayforge_sha")
    if not all(
        isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value)
        for value in (benchmark_sha, wayforge_sha)
    ):
        raise ValueError("Probe manifest must pin full benchmark and Wayforge revisions")
    if source.get("task") != "dialogue-parser":
        raise ValueError("This narrow comparison is pinned to dialogue-parser")
    for relative in (Path(".opencode"), Path("opencode.jsonc"), Path("AGENTS.md"), SKILL_PATH):
        if not (workspace / relative).exists():
            raise ValueError(f"Prepared workspace is missing {relative}")
    file_hashes(workspace / ".opencode")

    experiment = Path(tempfile.mkdtemp(prefix="comparison-", dir=EVAL_ROOT))
    variants = {}
    for name in ("baseline", "without_delivery_policy"):
        target = experiment / name
        target.mkdir()
        shutil.copytree(workspace / ".opencode", target / ".opencode")
        for filename in ("opencode.jsonc", "AGENTS.md"):
            shutil.copy2(workspace / filename, target / filename)
        pin_shared_model(target / "opencode.jsonc")
        variants[name] = target
    (variants["without_delivery_policy"] / SKILL_PATH).unlink()

    baseline_files = file_hashes(variants["baseline"])
    ablated_files = file_hashes(variants["without_delivery_policy"])
    removed = set(baseline_files) - set(ablated_files)
    changed = {
        name for name in set(baseline_files) & set(ablated_files)
        if baseline_files[name] != ablated_files[name]
    }
    added = set(ablated_files) - set(baseline_files)
    if removed != {SKILL_PATH.as_posix()} or changed or added:
        raise RuntimeError("Variant differs from baseline by more than the declared ablation")

    record: dict[str, object] = {
        "status": "not_run",
        "reason": "Human-owned model and benchmark run deferred; free usage currently unavailable",
        "benchmark": "SkillsBench",
        "benchmark_sha": benchmark_sha,
        "task_ids": ["dialogue-parser"],
        "repetitions": 1,
        "wayforge_sha": wayforge_sha,
        "opencode_version": OPENCODE_VERSION,
        "model": MODEL,
        "variants": {
            name: {
                "workspace": str(path),
                "file_count": len(files),
                "workspace_digest": workspace_digest(files),
            }
            for name, (path, files) in {
                "baseline": (variants["baseline"], baseline_files),
                "without_delivery_policy": (
                    variants["without_delivery_policy"], ablated_files
                ),
            }.items()
        },
        "ablation": {
            "variant": "without_delivery_policy",
            "kind": "skill_unavailable",
            "removed_file": SKILL_PATH.as_posix(),
            "other_file_differences": 0,
        },
        "budget": {
            "max_attempts_per_variant": 1,
            "max_variants": 2,
            "max_attempt_seconds": 600,
            "max_run_seconds": 1200,
            "max_attempt_input_tokens": 100000,
            "max_attempt_output_tokens": 20000,
            "max_run_input_tokens": 200000,
            "max_run_output_tokens": 40000,
            "max_paid_usd": 0,
            "enforcement": "not_run; provider limit must be checked before any future run",
        },
        "upstream_verifier": "unmodified; not executed",
    }
    (experiment / "comparison-manifest.json").write_text(json.dumps(record, indent=2) + "\n")
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "manifest", nargs="?", type=Path,
        default=EVAL_ROOT / "probe-manifest.json",
        help="Pinned private probe manifest inside temp/benchmark-testing",
    )
    args = parser.parse_args()
    print(json.dumps(prepare(args.manifest), indent=2))
