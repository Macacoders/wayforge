"""Offline checks that the comparison copies only one skill-file difference."""

from __future__ import annotations

from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch

import prepare_comparison


class PrepareComparisonTests(unittest.TestCase):
    def fixture(self, root: Path) -> Path:
        workspace = root / "source-workspace"
        skill = workspace / prepare_comparison.SKILL_PATH
        skill.parent.mkdir(parents=True)
        skill.write_text("name: delivery-policy\n")
        (workspace / "AGENTS.md").write_text("Synthetic test project\n")
        (workspace / "opencode.jsonc").write_text(json.dumps({
            "enabled_providers": ["opencode"],
            "default_agent": "delivery",
            "model": "opencode/mimo-v2.6-flash-free",
            "small_model": "opencode/mimo-v2.6-flash-free",
            "agent": {
                "delivery": {"model": "opencode/mimo-v2.6-flash-free"},
                "code": {"model": "opencode/big-pickle"},
                "reviewer": {"model": "opencode/mimo-v2.6-flash-free"},
            },
            "provider": {"opencode": {"models": {
                "mimo-v2.6-flash-free": {}, "big-pickle": {},
            }}},
        }))
        manifest = root / "probe-manifest.json"
        manifest.write_text(json.dumps({
            "workspace": str(workspace),
            "skillsbench_sha": "a" * 40,
            "wayforge_sha": "b" * 40,
            "task": "dialogue-parser",
        }))
        return manifest

    def test_prepared_variants_differ_by_one_file_and_make_no_run(self):
        with tempfile.TemporaryDirectory(dir=prepare_comparison.EVAL_ROOT) as temp:
            root = Path(temp)
            manifest = self.fixture(root)
            with patch.object(prepare_comparison, "EVAL_ROOT", root):
                record = prepare_comparison.prepare(manifest)
            baseline = Path(record["variants"]["baseline"]["workspace"])
            ablated = Path(record["variants"]["without_delivery_policy"]["workspace"])
            self.assertEqual(record["status"], "not_run")
            self.assertEqual(record["budget"]["max_run_seconds"], 1200)
            self.assertEqual(record["budget"]["max_run_input_tokens"], 200000)
            self.assertTrue((baseline / prepare_comparison.SKILL_PATH).is_file())
            self.assertFalse((ablated / prepare_comparison.SKILL_PATH).exists())
            self.assertEqual(record["ablation"]["other_file_differences"], 0)
            self.assertNotEqual(
                record["variants"]["baseline"]["workspace_digest"],
                record["variants"]["without_delivery_policy"]["workspace_digest"],
            )
            self.assertEqual(
                (baseline / "opencode.jsonc").read_bytes(),
                (ablated / "opencode.jsonc").read_bytes(),
            )
            config = json.loads((baseline / "opencode.jsonc").read_text())
            self.assertEqual(config["model"], "opencode/big-pickle")
            self.assertEqual(config["small_model"], "opencode/big-pickle")
            self.assertEqual(
                {agent["model"] for agent in config["agent"].values()},
                {"opencode/big-pickle"},
            )

    def test_unpinned_revision_fails_before_copy(self):
        with tempfile.TemporaryDirectory(dir=prepare_comparison.EVAL_ROOT) as temp:
            root = Path(temp)
            manifest = self.fixture(root)
            raw = json.loads(manifest.read_text())
            raw["skillsbench_sha"] = "short"
            manifest.write_text(json.dumps(raw))
            with patch.object(prepare_comparison, "EVAL_ROOT", root):
                with self.assertRaisesRegex(ValueError, "full benchmark"):
                    prepare_comparison.prepare(manifest)


if __name__ == "__main__":
    unittest.main()
