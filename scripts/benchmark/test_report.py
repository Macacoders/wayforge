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


def probe_index_sessions():
    """Mirror the probe's session-export-index shape for the same attempt."""
    root = session("ses_root", "delivery")
    root["id"] = root.pop("session_id")
    root["tool_events"] = root.pop("tools")
    root["usage"] = {
        "source": "session_export",
        "status": "measured",
        "tokens": {"input": 100, "output": 20, "reasoning": 0},
        "cache_tokens": {"read": 10, "write": 0},
        "cost_usd": "0",
    }
    root.pop("tokens")
    root.pop("cache_tokens")
    root.pop("cost")
    child = probe_index_sessions_child()
    return [root, child]


def probe_index_sessions_child():
    child = session("ses_code", "code")
    child["id"] = child.pop("session_id")
    child["parent_id"] = "ses_root"
    child["tool_events"] = child.pop("tools")
    child["usage"] = {
        "source": "session_export",
        "status": "measured",
        "tokens": {"input": 100, "output": 20, "reasoning": 0},
        "cache_tokens": {"read": 10, "write": 0},
        "cost_usd": "0",
    }
    child.pop("tokens")
    child.pop("cache_tokens")
    child.pop("cost")
    return child


def dispatched_sessions():
    """The 2026-11-02 shape: a delivery root, one code child, no reviewer."""
    sessions = complete_sessions()[:2]
    sessions[0]["tools"] = sessions[0]["tools"][:2]
    return sessions


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

    def test_probe_export_index_is_accepted_as_session_evidence(self):
        report = build_report(bundle([attempt(sessions=probe_index_sessions())]))
        row = report["attempts"][0]
        sources = row["usage"]["sources"]
        self.assertEqual(row["usage"]["all_session_tokens"]["input"], 200)
        self.assertEqual(sources["session_export"]["status"], "measured")
        self.assertEqual(sources["session_export"]["per_agent"]["code"]["input"], 100)
        self.assertEqual(sources["provider_billed"]["status"], "measured")
        self.assertFalse(row["usage"]["missing_child_usage"])
        self.assertEqual(row["workflow"]["dispatch_chain"], "not_observed")

    def test_benchflow_zero_usage_is_flagged_as_an_undercount(self):
        raw = attempt(
            sessions=dispatched_sessions(),
            benchflow_usage={
                "source": "benchflow_acp",
                "status": "unavailable",
                "input_tokens": 0,
                "output_tokens": 0,
                "cache_read_tokens": 0,
                "cost_usd": None,
            },
        )
        row = build_report(bundle([raw]))["attempts"][0]
        self.assertTrue(row["usage"]["benchflow_undercount"])
        self.assertEqual(row["usage"]["sources"]["benchflow_acp"]["status"], "unavailable")
        self.assertEqual(row["usage"]["sources"]["benchflow_acp"]["cost_usd"], "unverifiable")
        self.assertEqual(row["usage"]["all_session_tokens"]["input"], 200)

    def test_benchflow_agreement_is_not_flagged(self):
        raw = attempt(
            provider_billed_cost_usd=None,
            provider_billing_ref=None,
            benchflow_usage={
                "input_tokens": 300,
                "output_tokens": 60,
                "cost_usd": "0",
            },
        )
        row = build_report(bundle([raw]))["attempts"][0]
        self.assertFalse(row["usage"]["benchflow_undercount"])
        self.assertEqual(row["usage"]["sources"]["benchflow_acp"]["status"], "measured")

    def test_unfinished_dispatch_marks_child_usage_missing(self):
        sessions = dispatched_sessions()
        sessions[0]["tools"][1].update({"status": "error", "child_session_id": None})
        row = build_report(bundle([attempt(sessions=sessions)]))["attempts"][0]
        self.assertTrue(row["usage"]["missing_child_usage"])
        self.assertEqual(row["usage"]["all_session_tokens"], "unverifiable")
        self.assertEqual(row["usage"]["sources"]["session_export"]["status"], "unavailable")

    def test_unavailable_billed_cost_is_not_a_zero_delta(self):
        baseline = attempt(provider_billed_cost_usd=None, provider_billing_ref=None)
        ablation = attempt(variant="ablation", provider_billed_cost_usd=None, provider_billing_ref=None)
        report = build_report(bundle([baseline, ablation]))
        delta = report["paired_comparison"][0]["variant_minus_baseline_usage"]
        self.assertEqual(delta["provider_billed_cost_usd"], "unverifiable")
        self.assertEqual(report["by_variant"]["baseline"]["provider_billed_cost_usd"], "unverifiable")
        self.assertEqual(report["attempts"][0]["usage"]["sources"]["provider_billed"]["status"], "unavailable")

    def test_usage_without_any_capture_reports_missing_child_usage(self):
        raw = attempt(capture="metadata_unavailable", sessions=[], provider_billed_cost_usd=None, provider_billing_ref=None)
        row = build_report(bundle([raw]))["attempts"][0]
        self.assertTrue(row["usage"]["missing_child_usage"])
        self.assertEqual(row["usage"]["benchflow_undercount"], "unverifiable")
        self.assertEqual(row["usage"]["sources"]["session_export"]["status"], "unavailable")

    def test_session_without_parsed_tools_is_unverifiable(self):
        root = {key: value for key, value in session("ses_root", "delivery").items() if key != "tools"}
        row = build_report(bundle([attempt(sessions=[root])]))["attempts"][0]
        self.assertEqual(row["usage"]["all_session_tokens"], "unverifiable")
        self.assertTrue(row["usage"]["missing_child_usage"])

    def test_partial_session_usage_is_unverifiable_and_the_flag_is_about_dispatches(self):
        sessions = complete_sessions()
        sessions[1]["cost"] = None
        row = build_report(bundle([attempt(sessions=sessions)]))["attempts"][0]
        self.assertEqual(row["usage"]["all_session_tokens"], "unverifiable")
        self.assertFalse(row["usage"]["missing_child_usage"])
        self.assertEqual(row["usage"]["sources"]["session_export"]["status"], "unavailable")

    def test_probe_record_with_unavailable_usage_is_unverifiable(self):
        sessions = probe_index_sessions()
        sessions[0]["usage"] = {
            "source": "session_export",
            "status": "unavailable",
            "tokens": {"input": None, "output": None, "reasoning": None},
            "cache_tokens": {"read": None, "write": None},
            "cost_usd": None,
        }
        row = build_report(bundle([attempt(sessions=sessions)]))["attempts"][0]
        self.assertEqual(row["usage"]["all_session_tokens"], "unverifiable")

    def test_benchflow_source_status_is_not_overridden_by_its_own_counters(self):
        raw = attempt(
            sessions=dispatched_sessions(),
            benchflow_usage={
                "source": "benchflow_acp",
                "status": "measured",
                "reported_status": "unavailable",
                "input_tokens": 0,
                "output_tokens": 0,
                "cache_read_tokens": 0,
                "cost_usd": None,
            },
        )
        source = build_report(bundle([raw]))["attempts"][0]["usage"]["sources"]["benchflow_acp"]
        self.assertEqual(source["status"], "unavailable")
        self.assertEqual(source["reported_status"], "unavailable")

    def test_benchflow_cost_gap_triggers_the_undercount(self):
        sessions = complete_sessions()
        for item in sessions:
            item["cost"] = "0.42"
        raw = attempt(
            sessions=sessions,
            benchflow_usage={"input_tokens": 300, "output_tokens": 60, "cost_usd": None},
        )
        row = build_report(bundle([raw]))["attempts"][0]
        self.assertTrue(row["usage"]["benchflow_undercount"])

    def test_missing_benchflow_usage_still_reports_the_source(self):
        row = build_report(bundle([attempt()]))["attempts"][0]
        self.assertEqual(row["usage"]["sources"]["benchflow_acp"]["status"], "unavailable")
        self.assertEqual(row["usage"]["sources"]["benchflow_acp"]["input_tokens"], None)

    def test_unknown_tool_call_count_is_unverifiable_not_null(self):
        raw = attempt()
        raw["result"].pop("n_tool_calls")
        row = build_report(bundle([raw]))["attempts"][0]
        self.assertEqual(row["usage"]["benchflow_tool_calls"], "unverifiable")


if __name__ == "__main__":
    unittest.main()
