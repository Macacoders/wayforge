"""Offline manifest and fake-runner integration checks."""

from __future__ import annotations

import unittest

from budget_contract import Usage
from evaluation_plan import EvaluationPlan, run_with_runner


SHA = "a" * 40


def config(**overrides: object) -> dict[str, object]:
    raw: dict[str, object] = {
        "benchmark_sha": SHA,
        "opencode_version": "1.18.35",
        "model": "opencode/big-pickle",
        "tasks": ["dialogue-parser"],
        "variants": [{"name": "baseline", "wayforge_sha": "b" * 40}],
        "repetitions": 1,
        "limits": {
            "attempt_seconds": 600,
            "attempt_input_tokens": 10000,
            "attempt_output_tokens": 5000,
            "attempt_usd": "0",
            "variant_usd": "0",
            "run_usd": "0",
            "provider_ceiling_usd": "0",
            "variant_attempts": 1,
            "run_attempts": 1,
        },
    }
    raw.update(overrides)
    return raw


class EvaluationPlanTests(unittest.TestCase):
    def test_smoke_defaults_to_one_bounded_attempt(self) -> None:
        plan = EvaluationPlan.from_dict(config())
        preview = plan.preview()
        self.assertEqual(len(preview["attempts"]), 1)
        self.assertEqual(preview["maximum_exposure"]["wall_seconds"], 600)
        self.assertEqual(preview["maximum_exposure"]["cost_usd"], "0")

    def test_pairing_uses_same_tasks_and_repetitions_for_each_variant(self) -> None:
        limits = dict(config()["limits"])
        limits.update(variant_attempts=4, run_attempts=8)
        plan = EvaluationPlan.from_dict(config(
            tasks=["dialogue-parser", "fix-build-agentops"],
            variants=[
                {"name": "baseline", "wayforge_sha": "b" * 40},
                {"name": "ablation", "wayforge_sha": "c" * 40},
            ],
            repetitions=2,
            limits=limits,
        ))
        self.assertEqual(len(plan.attempts()), 8)
        for task in plan.tasks:
            for variant in plan.variants:
                self.assertEqual(
                    sum(a.task == task and a.variant == variant for a in plan.attempts()), 2
                )

    def test_fake_runner_stops_after_missing_usage_without_retry(self) -> None:
        limits = dict(config()["limits"])
        limits.update(variant_attempts=2, run_attempts=2)
        plan = EvaluationPlan.from_dict(config(repetitions=2, limits=limits))
        calls = []

        def fake(attempt):
            calls.append(attempt)
            return "timeout", None

        ledger = run_with_runner(plan, fake)
        self.assertEqual(len(calls), 1)
        self.assertEqual([a.outcome for a in ledger.attempts], ["timeout"])

    def test_fake_runner_continues_with_complete_child_usage(self) -> None:
        limits = dict(config()["limits"])
        limits.update(variant_attempts=2, run_attempts=2)
        plan = EvaluationPlan.from_dict(config(repetitions=2, limits=limits))
        calls = []

        def fake(attempt):
            calls.append(attempt)
            return "verifier_failed", Usage.from_values(100, 50, "0", True)

        ledger = run_with_runner(plan, fake)
        self.assertEqual(len(calls), 2)
        self.assertEqual([a.outcome for a in ledger.attempts], ["verifier_failed"] * 2)

    def test_worst_case_budget_and_bad_identifiers_rejected_before_run(self) -> None:
        for change in (
            {"tasks": ["../outside"]},
            {"benchmark_sha": "short"},
            {"repetitions": 2},
            {"variants": [{"name": "x/y", "wayforge_sha": SHA}]},
        ):
            with self.subTest(change=change), self.assertRaises(ValueError):
                EvaluationPlan.from_dict(config(**change))


if __name__ == "__main__":
    unittest.main()
