"""Synthetic-only preparation and pre-credential boundary regressions."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from evaluation_runner import EvaluationManifest, validate_inputs, run_live
from prepare_evaluation import prepare
from test_evaluation_runner import SHA, manifest, workspace


class PrepareEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "skillsbench/tasks/dialogue-parser").mkdir(parents=True)
        self.source = workspace(self.root, "source")
        path = self.source / "opencode.jsonc"
        config = json.loads(path.read_text())
        config["agent"].update(research={"model": "opencode/mimo-v2.6-flash-free"}, helper={"model": "openai/paid"}, inherited={})
        path.write_text(json.dumps(config))
        self.raw = manifest(self.root, self.source)
        self.path = self.root / "evaluation-run.json"
        self.root_patch = patch("evaluation_runner.EVAL_ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.save()

    def save(self):
        self.raw["variants"][0]["workspace_digest"] = EvaluationManifest.workspace_digest(self.source)
        self.path.write_text(json.dumps(self.raw))

    def prepare(self):
        with patch("evaluation_runner.subprocess.check_output", side_effect=[SHA, ""]):
            return prepare(self.path)

    def test_mixed_models_copy_normalize_and_preserve_originals(self):
        before = EvaluationManifest.workspace_digest(self.source)
        original_manifest = self.path.read_bytes()
        (self.root / "historical-attempt.json").write_text("historical")
        result = self.prepare()
        parsed = EvaluationManifest.from_dict(json.loads(result.read_text()))
        with patch("evaluation_runner.subprocess.check_output", side_effect=[SHA, ""]):
            validate_inputs(parsed)
        target = parsed.variants["baseline"].path
        config = json.loads((target / "opencode.jsonc").read_text())
        for agent in config["agent"].values():
            if "model" in agent:
                self.assertEqual(agent["model"], parsed.plan.model)
        self.assertEqual(config["agent"]["inherited"], {})
        self.assertEqual(EvaluationManifest.workspace_digest(self.source), before)
        self.assertEqual(self.path.read_bytes(), original_manifest)
        self.assertEqual((self.root / "historical-attempt.json").read_text(), "historical")
        self.assertNotEqual(parsed.variants["baseline"].digest, before)
        for path in self.source.rglob("*"):
            if path.is_file() and path.name != "opencode.jsonc":
                self.assertEqual(path.read_bytes(), (target / path.relative_to(self.source)).read_bytes())
        self.assertEqual(json.loads(result.read_text())["plan"], self.raw["plan"])
        self.assertEqual(result.stat().st_mode & 0o777, 0o600)

    def test_repeated_preparation_never_overwrites(self):
        first = self.prepare()
        second = self.prepare()
        self.assertNotEqual(first, second)
        self.assertTrue(first.is_file())

    def test_stale_missing_and_symlink_sources_fail(self):
        (self.source / "changed").write_text("changed")
        with self.assertRaisesRegex(ValueError, "digest"):
            self.prepare()
        self.save()
        (self.source / ".opencode/agents/code.md").unlink()
        self.save()
        with self.assertRaisesRegex(ValueError, "missing"):
            self.prepare()
        (self.source / "link").symlink_to(self.source / "AGENTS.md")
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.prepare()

    def test_invalid_agent_shapes_and_manifest_models_fail(self):
        path = self.source / "opencode.jsonc"
        config = json.loads(path.read_text())
        for bad in (None, [], "not an object"):
            config["agent"]["helper"] = bad
            path.write_text(json.dumps(config))
            self.save()
            with self.assertRaises(ValueError):
                self.prepare()
        for model in ("openai/paid", "invalid", None):
            self.raw["plan"]["model"] = model
            self.save()
            with self.assertRaises(ValueError):
                self.prepare()

    def test_wrong_revision_dirty_checkout_and_unsafe_paths_fail(self):
        for outputs in (["c" * 40, ""], [SHA, " M task"]):
            with patch("evaluation_runner.subprocess.check_output", side_effect=outputs):
                with self.assertRaises(ValueError):
                    prepare(self.path)
        self.raw["variants"][0]["workspace"] = str(self.root.parent)
        self.path.write_text(json.dumps(self.raw))
        with self.assertRaises(ValueError):
            self.prepare()

    def test_markdown_allowlist_rejects_overrides_before_key_access(self):
        # First normalize JSON so the rejection is specifically markdown.
        result = self.prepare()
        raw = json.loads(result.read_text())
        target = Path(raw["variants"][0]["workspace"])
        path = target / ".opencode/agents/code.md"
        cases = ["model: opencode/big-pickle", "'model': openai/paid", '"model": openai/paid',
                 "m\\u006fdel: openai/paid", "<<: *defaults", "description: &alias prose",
                 "description: |\n  prose", "mode: subagent\nmode: primary", "unknown: true"]
        for frontmatter in cases:
            with self.subTest(frontmatter=frontmatter):
                path.write_text("---\n" + frontmatter + "\n---\nbody\n")
                raw["variants"][0]["workspace_digest"] = EvaluationManifest.workspace_digest(target)
                parsed = EvaluationManifest.from_dict(raw)
                with patch("evaluation_runner.subprocess.check_output", side_effect=[SHA, ""]), patch("run_skillsbench_probe.private_key") as key:
                    with self.assertRaisesRegex(ValueError, "markdown agent"):
                        run_live(parsed, self.root.parent / "dummy-key")
                    key.assert_not_called()
                self.path.write_text(json.dumps(raw))
                with self.assertRaisesRegex(ValueError, "markdown agent"):
                    self.prepare()

    def test_generated_frontmatter_subset_is_accepted(self):
        (self.source / ".opencode/agents/code.md").write_text(
            "---\ndescription: Implements one work order, never commits.\nmode: subagent\ntemperature: 0.1\n---\nbody")
        self.save()
        self.prepare()


if __name__ == "__main__":
    unittest.main()
