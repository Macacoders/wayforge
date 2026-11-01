"""Evidence and metric checks using synthetic upstream-shaped fixtures."""

from __future__ import annotations

import json
import unittest

from report import build_report


def result(task: str = "dialogue-parser", reward: float = 1.0, **extra):
    value = {
        "task_name": task,
        "rewards": {"reward": reward},
        "error": None,
        "error_category": None,
        "verifier_error": None,
        "n_tool_calls": 3,
        "timing": {"total": 42.5},
    }
    value.update(extra)
    return value


def session(session_id: str, agent: str, tools=None):
    return {
        "session_id": session_id,
        "agent": agent,
        "version": "1.18.35",
        "cost": 0,
        "tokens": {"input": 100, "output": 20, "reasoning": 0},
        "cache_tokens": {"read": 10, "write": 0},
        "tools": tools or [],
    }


def complete_sessions():
    root = session("ses_root", "delivery", [
        {"agent": "delivery", "tool": "skill", "status": "completed", "skill_name": "delivery-policy"},
        {"agent": "delivery", "tool": "task", "status": "completed", "target_agent": "code", "child_session_id": "ses_code"},
        {"agent": "delivery", "tool": "task", "status": "completed", "target_agent": "reviewer", "child_session_id": "ses_review"},
    ])
    return [root, session("ses_code", "code"), session("ses_review", "reviewer")]


def attempt(variant="baseline", reward=1.0, capture="captured", sessions=None, **extra):
    value = {
        "task_id": "dialogue-parser",
        "variant": variant,
        "wayforge_sha": "a" * 40,
        "repetition": 1,
        "result": result(reward=reward),
        "capture_status": capture,
        "sessions": complete_sessions() if sessions is None else sessions,
        "provider_billed_cost_usd": "0",
        "provider_billing_ref": "private/provider-billing.json",
        "relevant_skills": ["delivery-policy"],
        "sanitized_trace_ref": "private/session-exports/root.json",
    }
    value.update(extra)
    return value


def bundle(attempts):
    return {
        "metadata": {
            "benchmark": "SkillsBench",
            "benchmark_sha": "b" * 40,
            "opencode_version": "1.18.35",
            "model": "opencode/big-pickle",
            "baseline_variant": "baseline",
            "budget_enforcement": "soft_between_attempts",
            "data_origin": "synthetic",
        },
        "attempts": attempts,
    }


class ReportTests(unittest.TestCase):
    def test_complete_chain_and_skill_are_observed_without_inventing_review_verdict(self):
        report = build_report(bundle([attempt()]))
        row = report["attempts"][0]
        self.assertEqual(row["official"]["status"], "verified_pass")
        self.assertEqual(row["workflow"]["dispatch_chain"], "observed")
        self.assertEqual(row["workflow"]["skill_loads"], ["delivery-policy"])
        self.assertEqual(row["workflow"]["review_verdict"], "unverifiable")
        self.assertEqual(row["usage"]["all_session_tokens"]["input"], 300)
        self.assertEqual(row["usage"]["provider_billed_cost_usd"], "0")
        self.assertEqual(report["skill_metrics"]["relevant_skill_load_recall"]["rate"], 1)
        self.assertEqual(report["by_variant"]["baseline"]["cost_per_verified_resolution_usd"], "0")
        self.assertEqual(report["by_variant"]["baseline"]["all_session_tokens"]["input"], 300)
        self.assertEqual(report["by_task_and_variant"]["dialogue-parser::baseline"]["all_session_tokens"]["cache_read"], 30)

    def test_missing_capture_keeps_partial_reward_and_usage_distinct(self):
        raw = attempt(reward=0.833, capture="metadata_unavailable", sessions=[],
                      provider_billed_cost_usd=None, relevant_skills=None)
        raw["result"]["raw_secret_prose"] = "DO_NOT_COPY"
        report = build_report(bundle([raw]))
        row = report["attempts"][0]
        self.assertEqual(row["official"]["status"], "verifier_failed")
        self.assertEqual(row["official"]["reward"], "0.833")
        self.assertEqual(row["workflow"]["dispatch_chain"], "unverifiable")
        self.assertEqual(row["workflow"]["skill_loads"], "unverifiable")
        self.assertEqual(row["usage"]["all_session_tokens"], "unverifiable")
        self.assertEqual(report["skill_metrics"]["not_labelled_attempts"], 1)
        self.assertEqual(report["by_variant"]["baseline"]["cost_per_verified_resolution_usd"], "unverifiable")
        self.assertNotIn("DO_NOT_COPY", json.dumps(report))

    def test_timeout_is_not_a_verifier_failure_even_with_partial_reward(self):
        raw = attempt(reward=0.667, capture="metadata_unavailable", sessions=[])
        raw["result"]["error_category"] = "timeout"
        report = build_report(bundle([raw]))
        self.assertEqual(report["attempts"][0]["official"]["status"], "timeout")
        self.assertEqual(report["by_variant"]["baseline"]["timeouts"], 1)
        self.assertEqual(report["by_variant"]["baseline"]["complete_verifier_outcomes"], 0)

    def test_missing_child_link_is_unverifiable_not_observed(self):
        sessions = complete_sessions()
        sessions[0]["tools"][1]["child_session_id"] = None
        report = build_report(bundle([attempt(sessions=sessions)]))
        self.assertEqual(report["attempts"][0]["workflow"]["dispatch_chain"], "unverifiable")
        self.assertEqual(report["attempts"][0]["usage"]["all_session_tokens"], "unverifiable")

    def test_skill_rates_handle_zero_denominators_and_unlabelled_rows(self):
        empty = attempt(sessions=[session("ses_root", "delivery")], relevant_skills=[])
        report = build_report(bundle([empty, attempt(variant="ablation", relevant_skills=None)]))
        metrics = report["skill_metrics"]
        self.assertIsNone(metrics["relevant_skill_load_recall"]["rate"])
        self.assertIsNone(metrics["unnecessary_load_rate"]["rate"])
        self.assertEqual(metrics["zero_load_rate"]["rate"], 1)
        self.assertEqual(metrics["not_labelled_attempts"], 1)

    def test_pair_flips_and_unpaired_attempts_are_explicit(self):
        baseline = attempt(reward=1)
        ablation = attempt(variant="ablation", reward=0.833)
        extra = attempt(variant="ablation", reward=1, repetition=2)
        report = build_report(bundle([baseline, ablation, extra]))
        directions = [pair["direction"] for pair in report["paired_comparison"]]
        self.assertEqual(directions, ["pass_to_fail", "unpaired"])
        self.assertEqual(report["paired_comparison"][0]["variant_minus_baseline_usage"]["input"], 0)
        self.assertEqual(report["paired_comparison"][1]["variant_minus_baseline_usage"]["input"], "unverifiable")

    def test_duplicate_attempts_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            build_report(bundle([attempt(), attempt()]))

    def test_billed_cost_requires_a_private_source_reference(self):
        with self.assertRaisesRegex(ValueError, "provider_billing_ref"):
            build_report(bundle([attempt(provider_billing_ref=None)]))

    def test_untrusted_metadata_cannot_be_echoed(self):
        with self.assertRaisesRegex(ValueError, "variant"):
            build_report(bundle([attempt(variant="../../secret")]))


if __name__ == "__main__":
    unittest.main()
