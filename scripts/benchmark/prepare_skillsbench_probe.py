#!/usr/bin/env python3
"""Prepare one disposable Wayforge install for the SkillsBench interface pilot.

This script performs no Docker or model calls. Run it from the Wayforge checkout.
"""

from __future__ import annotations

import argparse
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile


REPO = Path(__file__).resolve().parents[2]
SKILLSBENCH_SHA = "b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af"
FREE_MODEL = "opencode/mimo-v2.6-flash-free"


def pin_free_models(config: Path) -> None:
    """Keep OpenCode's root and title/summary model on the free tier."""
    raw = config.read_text()
    expected = {
        '"default_agent": "planner"': '"default_agent": "delivery"',
        '"model": ""': f'"model": "{FREE_MODEL}"',
        '"small_model": ""': f'"small_model": "{FREE_MODEL}"',
    }
    for old, new in expected.items():
        if raw.count(old) == 1:
            raw = raw.replace(old, new, 1)
        elif raw.count(new) != 1:
            raise RuntimeError(f"Unexpected generated config field: {old}")
    config.write_text(raw)


def command(*args: str, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(
        args, cwd=REPO, env=env, text=True, capture_output=True, check=False
    )
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed: {(result.stderr + result.stdout)[-2000:]}")
    return result.stdout


def prepare(eval_root: Path) -> dict[str, str]:
    eval_root = eval_root.expanduser().resolve()
    checkout = eval_root / "skillsbench"
    if not checkout.is_dir():
        raise RuntimeError(f"SkillsBench checkout missing: {checkout}")
    actual_sha = command("git", "-C", str(checkout), "rev-parse", "HEAD").strip()
    if actual_sha != SKILLSBENCH_SHA:
        raise RuntimeError(f"Unexpected SkillsBench revision: {actual_sha}")
    if command("git", "-C", str(checkout), "status", "--porcelain").strip():
        raise RuntimeError("SkillsBench checkout must be clean")
    source = Path(tempfile.mkdtemp(prefix="probe-source-", dir=eval_root))
    target = Path(tempfile.mkdtemp(prefix="probe-workspace-", dir=eval_root))

    revision = command("git", "rev-parse", "HEAD").strip()
    archive = subprocess.run(
        ["git", "archive", "--format=tar", "HEAD"],
        cwd=REPO,
        capture_output=True,
        check=True,
    ).stdout
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as bundle:
        bundle.extractall(source)

    args = (
        "node", "--import", "tsx", "cli/src/index.ts", "install",
        "--repo", str(target), "--providers", "free-tier", "--runtime",
        "opencode", "--no-track",
    )
    env = {**os.environ, "WAYFORGE_HOME": str(source)}
    command(*args, "--dry-run", env=env)
    command(*args, env=env)

    pin_free_models(target / "opencode.jsonc")
    for required in (
        target / ".opencode/agents/delivery.md",
        target / ".opencode/agents/code.md",
        target / ".opencode/agents/reviewer.md",
        target / ".opencode/skills/delivery-policy/SKILL.md",
        target / "AGENTS.md",
    ):
        if not required.is_file():
            raise RuntimeError(f"Missing installed file: {required}")
    manifest = {
        "skillsbench_sha": actual_sha,
        "wayforge_sha": revision,
        "task": "dialogue-parser",
        "workspace": str(target),
        "source": str(source),
        "entry_agent": "delivery",
        "profile": "free-tier",
    }
    (eval_root / "probe-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("eval_root", type=Path)
    print(json.dumps(prepare(parser.parse_args().eval_root), indent=2))
