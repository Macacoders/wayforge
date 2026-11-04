"""Render benchmark outcomes and Wayforge observations as separate evidence.

Input is a private JSON bundle of upstream result objects and restricted
session-evidence summaries. Raw session exports and agent prose are never read.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path, PurePosixPath
import re
from typing import Any


UNVERIFIABLE = "unverifiable"
RUBRIC = (
    "ambiguous_routing",
    "handoff_decision_continuity",
    "reviewer_feedback_quality",
    "justified_safety_stops",
)
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}\Z")
SKILL = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}\Z")
REVISION = re.compile(r"[0-9a-f]{40}\Z")
MODEL = re.compile(r"[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\Z")
RELATIVE_REF = re.compile(r"[A-Za-z0-9._/-]+\Z")


def number(value: object) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return parsed if parsed.is_finite() and parsed >= 0 else None


def nonnegative_int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def normalized_session(session: object) -> dict[str, Any]:
    """Accept either the report's session shape or the probe's export-index shape.

    The probe's index carries `id`, `tool_events`, and a nested `usage` block;
    the report's own shape carries `session_id`, `tools`, `tokens`,
    `cache_tokens`, and `cost`. Normalizing keeps one code path for both and lets
    a probe export index be used as report input directly.
    """
    if not isinstance(session, dict):
        session = {}
    usage = session.get("usage") if isinstance(session.get("usage"), dict) else {}
    tokens = session.get("tokens")
    if not isinstance(tokens, dict):
        tokens = usage.get("tokens")
    cache = session.get("cache_tokens")
    if not isinstance(cache, dict):
        cache = usage.get("cache_tokens")
    cost = session.get("cost")
    if cost is None:
        cost = usage.get("cost_usd")
    tools = session.get("tools")
    if not isinstance(tools, list):
        tools = session.get("tool_events")
    return {
        "session_id": session.get("session_id") or session.get("id"),
        "agent": session.get("agent"),
        "tokens": tokens,
        "cache_tokens": cache,
        "cost": cost,
        "tools": tools if isinstance(tools, list) else None,
    }


def child_usage_complete(sessions: list[dict[str, Any]], ids: set[Any]) -> bool:
    """True only when every `task` dispatch has an exported child session.

    A dispatch that never completed, or that returned no session identifier,
    leaves the child's usage unobserved, so the attempt total is unverifiable
    rather than undercounted.
    """
    for session in sessions:
        tools = session.get("tools")
        if not isinstance(tools, list):
            # Tool events that were never parsed prove nothing about dispatches.
            return False
        for tool in tools:
            if not isinstance(tool, dict) or tool.get("tool") != "task":
                continue
            child = tool.get("child_session_id")
            if tool.get("status") != "completed" or not child or child not in ids:
                return False
    return True


def relative_ref(value: object, label: str) -> str | None:
    if value is None:
        return None
    path = PurePosixPath(value) if isinstance(value, str) else None
    if (
        path is None or path.is_absolute() or ".." in path.parts
        or not value or not RELATIVE_REF.fullmatch(value)
    ):
        raise ValueError(f"{label} must be a relative path")
    return value


def official_outcome(result: dict[str, Any]) -> tuple[str, str | None]:
    error = result.get("error_category")
    if error == "timeout":
        return "timeout", None
    if result.get("error") or error:
        return "runtime_error", None
    if result.get("verifier_error"):
        return "verifier_error", None
    rewards = result.get("rewards")
    reward = number(rewards.get("reward")) if isinstance(rewards, dict) else None
    if reward is None:
        return "verifier_unavailable", None
    return ("verified_pass" if reward == 1 else "verifier_failed", str(reward))


def workflow_observation(
    capture_status: str, sessions: list[dict[str, Any]],
) -> dict[str, Any]:
    absent = {
        "skill_loads": UNVERIFIABLE,
        "dispatch_chain": UNVERIFIABLE,
        "review_verdict": UNVERIFIABLE,
        "reviewed_revision": UNVERIFIABLE,
        "permission_and_stop_events": UNVERIFIABLE,
    }
    if capture_status != "captured" or not sessions:
        return absent
    sessions = [normalized_session(session) for session in sessions]
    roots = [s for s in sessions if s.get("agent") == "delivery"]
    if len(roots) != 1:
        return absent
    root = roots[0]
    by_id = {s.get("session_id"): s for s in sessions if s.get("session_id")}
    tools = root.get("tools")
    if not isinstance(tools, list):
        return absent
    all_tools = [tool for session in sessions for tool in (session.get("tools") or [])]
    skill_calls = [
        tool for tool in all_tools
        if tool.get("tool") == "skill" and tool.get("status") == "completed"
    ]
    names = [tool.get("skill_name") for tool in skill_calls]
    skill_loads: list[str] | str = (
        UNVERIFIABLE if any(
            not isinstance(name, str) or not SKILL.fullmatch(name) for name in names
        )
        else sorted(set(names))
    )
    tasks = [tool for tool in tools if tool.get("tool") == "task"]
    if any(
        tool.get("status") == "completed" and (
            not tool.get("target_agent") or not tool.get("child_session_id")
            or tool["child_session_id"] not in by_id
        )
        for tool in tasks
    ):
        chain = UNVERIFIABLE
    else:
        code_positions = [
            i for i, tool in enumerate(tasks)
            if tool.get("status") == "completed"
            and tool.get("target_agent") == "code"
            and by_id[tool["child_session_id"]].get("agent") == "code"
        ]
        review_positions = [
            i for i, tool in enumerate(tasks)
            if tool.get("status") == "completed"
            and tool.get("target_agent") == "reviewer"
            and by_id[tool["child_session_id"]].get("agent") == "reviewer"
        ]
        chain = (
            "observed" if any(c < r for c in code_positions for r in review_positions)
            else "not_observed"
        )
    return {**absent, "skill_loads": skill_loads, "dispatch_chain": chain}


def complete_session_usage(
    capture_status: str, sessions: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Sum measured session usage, or return None when any part is unproven.

    Accepts both the report's session shape and the probe's export-index shape.
    Per-agent totals sit inside this measured block so no consumer silently
    drops them, and missing data is never replaced by zero.
    """
    if capture_status != "captured" or not sessions:
        return None
    sessions = [normalized_session(session) for session in sessions]
    ids = {session.get("session_id") for session in sessions}
    if None in ids or len(ids) != len(sessions):
        return None
    totals = {"input": 0, "output": 0, "reasoning": 0, "cache_read": 0, "cache_write": 0}
    per_agent: dict[str, dict[str, Any]] = {}
    cost = Decimal(0)
    for session in sessions:
        tokens = session.get("tokens")
        cache = session.get("cache_tokens")
        session_cost = number(session.get("cost"))
        if not isinstance(tokens, dict) or not isinstance(cache, dict) or session_cost is None:
            return None
        agent = session.get("agent")
        label = agent if isinstance(agent, str) and IDENTIFIER.fullmatch(agent) else "unknown"
        bucket = per_agent.setdefault(
            label, {**{key: 0 for key in totals}, "runtime_estimated_cost_usd": Decimal(0)}
        )
        for source, target in (
            (tokens.get("input"), "input"),
            (tokens.get("output"), "output"),
            (tokens.get("reasoning"), "reasoning"),
            (cache.get("read"), "cache_read"),
            (cache.get("write"), "cache_write"),
        ):
            parsed = nonnegative_int(source)
            if parsed is None:
                return None
            totals[target] += parsed
            bucket[target] += parsed
        cost += session_cost
        bucket["runtime_estimated_cost_usd"] += session_cost
    if not child_usage_complete(sessions, ids):
        return None
    return {
        **totals,
        "runtime_estimated_cost_usd": str(cost),
        "per_agent": {
            label: {key: (str(value) if isinstance(value, Decimal) else value) for key, value in bucket.items()}
            for label, bucket in sorted(per_agent.items())
        },
    }


def missing_child_usage(capture_status: str, sessions: list[dict[str, Any]]) -> bool:
    """True when a dispatch or export gap leaves some child usage unproven."""
    if capture_status != "captured" or not sessions:
        return True
    sessions = [normalized_session(session) for session in sessions]
    ids = {session.get("session_id") for session in sessions if session.get("session_id")}
    return not child_usage_complete(sessions, ids)


def usage_source_records(
    raw: dict[str, Any],
    usage: dict[str, Any] | None,
    billed: Decimal | None,
    billing_ref: str | None,
) -> tuple[dict[str, Any], bool | None]:
    """Label each usage source and flag BenchFlow undercounting.

    BenchFlow 0.6.3 reported zero tokens and an unknown cost for an attempt
    whose sessions recorded model use, so a zero in its flattened ACP view is
    not proof of zero spend. Each source is reported separately and a
    disagreement is flagged inside the attempt instead of being averaged away.
    """
    sources: dict[str, Any] = {
        "session_export": {
            "status": "measured" if usage is not None else "unavailable",
            "runtime_estimated_cost_usd": (
                usage["runtime_estimated_cost_usd"] if usage is not None else UNVERIFIABLE
            ),
            "per_agent": usage["per_agent"] if usage is not None else UNVERIFIABLE,
        },
    }
    undercount: bool | None = None
    benchflow = raw.get("benchflow_usage")
    sources["benchflow_acp"] = {
        "status": "unavailable",
        "reported_status": None,
        "input_tokens": None,
        "output_tokens": None,
        "cache_read_tokens": None,
        "cost_usd": UNVERIFIABLE,
    }
    if isinstance(benchflow, dict):
        bf_input = nonnegative_int(benchflow.get("input_tokens"))
        bf_output = nonnegative_int(benchflow.get("output_tokens"))
        bf_cost = number(benchflow.get("cost_usd"))
        declared = benchflow.get("status")
        reported = benchflow.get("reported_status")
        reported = reported if isinstance(reported, str) else None
        if reported == "unavailable":
            status = "unavailable"
        elif declared in ("measured", "partial", "unavailable"):
            status = declared
        elif (bf_input or bf_output) and bf_cost is not None:
            status = "measured"
        elif any(value is not None for value in (bf_input, bf_output, bf_cost)):
            status = "partial"
        else:
            status = "unavailable"
        sources["benchflow_acp"] = {
            "status": status,
            "reported_status": reported,
            "input_tokens": bf_input,
            "output_tokens": bf_output,
            "cache_read_tokens": nonnegative_int(benchflow.get("cache_read_tokens")),
            "cost_usd": str(bf_cost) if bf_cost is not None else UNVERIFIABLE,
        }
        if usage is not None:
            session_tokens = sum(
                usage[field] for field in ("input", "output", "reasoning", "cache_read", "cache_write")
            )
            session_cost = number(usage["runtime_estimated_cost_usd"])
            undercount = bool(session_tokens and not (bf_input or bf_output)) or (
                session_cost is not None and session_cost > 0 and bf_cost is None
            )
    sources["provider_billed"] = {
        "status": "measured" if billed is not None else "unavailable",
        "cost_usd": str(billed) if billed is not None else UNVERIFIABLE,
        "billing_ref": billing_ref,
    }
    return sources, undercount


def attempt_report(raw: dict[str, Any]) -> dict[str, Any]:
    required = {"task_id", "variant", "wayforge_sha", "repetition", "result", "capture_status", "sessions"}
    if not required.issubset(raw):
        raise ValueError("Attempt is missing required metadata or evidence")
    if not isinstance(raw["task_id"], str) or not IDENTIFIER.fullmatch(raw["task_id"]):
        raise ValueError("task_id must be a safe identifier")
    if not isinstance(raw["variant"], str) or not IDENTIFIER.fullmatch(raw["variant"]):
        raise ValueError("variant must be a safe identifier")
    if not isinstance(raw["wayforge_sha"], str) or not REVISION.fullmatch(raw["wayforge_sha"]):
        raise ValueError("wayforge_sha must be a full lowercase Git SHA")
    if nonnegative_int(raw["repetition"]) is None or raw["repetition"] == 0:
        raise ValueError("repetition must be a positive integer")
    result = raw["result"]
    if not isinstance(result, dict) or not isinstance(raw["sessions"], list):
        raise ValueError("Attempt result and sessions must be structured objects")
    if result.get("task_name") != raw["task_id"]:
        raise ValueError("Upstream result task does not match attempt task_id")
    status, reward = official_outcome(result)
    workflow = workflow_observation(raw["capture_status"], raw["sessions"])
    usage = complete_session_usage(raw["capture_status"], raw["sessions"])
    timing = result.get("timing") if isinstance(result.get("timing"), dict) else {}
    elapsed = number(timing.get("total"))
    billed = number(raw.get("provider_billed_cost_usd"))
    billing_ref = relative_ref(raw.get("provider_billing_ref"), "provider_billing_ref")
    if billed is not None and billing_ref is None:
        raise ValueError("A provider billed cost requires a provider_billing_ref")
    labels = raw.get("relevant_skills")
    if labels is not None and (
        not isinstance(labels, list) or any(
            not isinstance(x, str) or not SKILL.fullmatch(x) for x in labels
        )
    ):
        raise ValueError("relevant_skills must be a list or null")
    trace_ref = relative_ref(raw.get("sanitized_trace_ref"), "sanitized_trace_ref")
    tool_calls = nonnegative_int(result.get("n_tool_calls"))
    sources, undercount = usage_source_records(raw, usage, billed, billing_ref)
    return {
        "task_id": raw["task_id"],
        "variant": raw["variant"],
        "wayforge_sha": raw["wayforge_sha"],
        "repetition": raw["repetition"],
        "official": {"status": status, "reward": reward, "verified_resolution": status == "verified_pass"},
        "workflow": workflow,
        "usage": {
            "all_session_tokens": usage if usage is not None else UNVERIFIABLE,
            "provider_billed_cost_usd": str(billed) if billed is not None else UNVERIFIABLE,
            "provider_billing_ref": billing_ref,
            "elapsed_seconds": str(elapsed) if elapsed is not None else UNVERIFIABLE,
            "benchflow_tool_calls": tool_calls if tool_calls is not None else UNVERIFIABLE,
            "sources": sources,
            "benchflow_undercount": UNVERIFIABLE if undercount is None else undercount,
            "missing_child_usage": missing_child_usage(raw["capture_status"], raw["sessions"]),
        },
        "relevant_skills": sorted(set(labels)) if labels is not None else None,
        "sanitized_trace_ref": trace_ref,
        "human_rubric": {name: "not assessed" for name in RUBRIC},
    }


def skill_metrics(attempts: list[dict[str, Any]]) -> dict[str, Any]:
    labelled = [a for a in attempts if a["relevant_skills"] is not None]
    observable = [a for a in labelled if isinstance(a["workflow"]["skill_loads"], list)]
    relevant = sum(len(a["relevant_skills"]) for a in observable)
    loaded_relevant = sum(
        len(set(a["relevant_skills"]) & set(a["workflow"]["skill_loads"]))
        for a in observable
    )
    loaded = sum(len(a["workflow"]["skill_loads"]) for a in observable)
    unnecessary = sum(
        len(set(a["workflow"]["skill_loads"]) - set(a["relevant_skills"]))
        for a in observable
    )
    zero_load = sum(not a["workflow"]["skill_loads"] for a in observable)
    def rate(numerator: int, denominator: int) -> float | None:
        return numerator / denominator if denominator else None
    return {
        "labelled_attempts": len(labelled),
        "not_labelled_attempts": len(attempts) - len(labelled),
        "labelled_but_unverifiable": len(labelled) - len(observable),
        "relevant_skill_load_recall": {"numerator": loaded_relevant, "denominator": relevant, "rate": rate(loaded_relevant, relevant)},
        "unnecessary_load_rate": {"numerator": unnecessary, "denominator": loaded, "rate": rate(unnecessary, loaded)},
        "zero_load_rate": {"numerator": zero_load, "denominator": len(observable), "rate": rate(zero_load, len(observable))},
    }


def paired_comparison(attempts: list[dict[str, Any]], baseline: str) -> list[dict[str, Any]]:
    by_key = {(a["variant"], a["task_id"], a["repetition"]): a for a in attempts}
    variants = sorted({a["variant"] for a in attempts} - {baseline})
    task_reps = sorted({(a["task_id"], a["repetition"]) for a in attempts})
    pairs = []
    for variant in variants:
        for task, repetition in task_reps:
            left = by_key.get((baseline, task, repetition))
            right = by_key.get((variant, task, repetition))
            if left is None or right is None:
                direction = "unpaired"
            else:
                statuses = (left["official"]["status"], right["official"]["status"])
                if statuses == ("verified_pass", "verifier_failed"):
                    direction = "pass_to_fail"
                elif statuses == ("verifier_failed", "verified_pass"):
                    direction = "fail_to_pass"
                elif any(x not in ("verified_pass", "verifier_failed") for x in statuses):
                    direction = "inconclusive"
                else:
                    direction = "unchanged"
            pairs.append({
                "task_id": task, "repetition": repetition, "baseline": baseline,
                "variant": variant, "direction": direction,
                "baseline_status": left["official"]["status"] if left else None,
                "variant_status": right["official"]["status"] if right else None,
                "baseline_workflow": left["workflow"]["dispatch_chain"] if left else UNVERIFIABLE,
                "variant_workflow": right["workflow"]["dispatch_chain"] if right else UNVERIFIABLE,
                "variant_minus_baseline_usage": usage_delta(left, right),
            })
    return pairs


def usage_delta(left: dict[str, Any] | None, right: dict[str, Any] | None) -> dict[str, Any]:
    deltas = {}
    for field in ("input", "output", "reasoning", "cache_read", "cache_write"):
        left_tokens = left["usage"]["all_session_tokens"] if left else None
        right_tokens = right["usage"]["all_session_tokens"] if right else None
        a = nonnegative_int(left_tokens.get(field)) if isinstance(left_tokens, dict) else None
        b = nonnegative_int(right_tokens.get(field)) if isinstance(right_tokens, dict) else None
        deltas[field] = b - a if a is not None and b is not None else UNVERIFIABLE
    for field in ("provider_billed_cost_usd", "elapsed_seconds"):
        a = number(left["usage"][field]) if left else None
        b = number(right["usage"][field]) if right else None
        deltas[field] = str(b - a) if a is not None and b is not None else UNVERIFIABLE
    a = nonnegative_int(left["usage"]["benchflow_tool_calls"]) if left else None
    b = nonnegative_int(right["usage"]["benchflow_tool_calls"]) if right else None
    deltas["benchflow_tool_calls"] = b - a if a is not None and b is not None else UNVERIFIABLE
    return deltas


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    passes = sum(a["official"]["verified_resolution"] for a in rows)
    complete_verifiers = sum(
        a["official"]["status"] in ("verified_pass", "verifier_failed") for a in rows
    )
    billed = [number(a["usage"]["provider_billed_cost_usd"]) for a in rows]
    total_billed = sum(billed, Decimal(0)) if all(x is not None for x in billed) else None
    token_totals = {}
    for field in ("input", "output", "reasoning", "cache_read", "cache_write"):
        values = [
            nonnegative_int(a["usage"]["all_session_tokens"].get(field))
            if isinstance(a["usage"]["all_session_tokens"], dict) else None
            for a in rows
        ]
        token_totals[field] = sum(values) if all(x is not None for x in values) else UNVERIFIABLE
    elapsed = [number(a["usage"]["elapsed_seconds"]) for a in rows]
    tools = [nonnegative_int(a["usage"]["benchflow_tool_calls"]) for a in rows]
    return {
        "verified_resolutions": passes,
        "attempts": len(rows),
        "complete_verifier_outcomes": complete_verifiers,
        "verified_resolution_rate_per_attempt": passes / len(rows) if rows else None,
        "timeouts": sum(a["official"]["status"] == "timeout" for a in rows),
        "all_session_tokens": token_totals,
        "elapsed_seconds": str(sum(elapsed, Decimal(0))) if all(x is not None for x in elapsed) else UNVERIFIABLE,
        "benchflow_tool_calls": sum(tools) if all(x is not None for x in tools) else UNVERIFIABLE,
        "provider_billed_cost_usd": str(total_billed) if total_billed is not None else UNVERIFIABLE,
        "cost_per_verified_resolution_usd": (
            str(total_billed / passes) if total_billed is not None and passes else UNVERIFIABLE
        ),
    }


def build_report(raw: dict[str, Any]) -> dict[str, Any]:
    metadata = raw.get("metadata")
    source_attempts = raw.get("attempts")
    if not isinstance(metadata, dict) or not isinstance(source_attempts, list):
        raise ValueError("Report needs metadata and attempts")
    required_metadata = {"benchmark", "benchmark_sha", "opencode_version", "model", "baseline_variant", "budget_enforcement", "data_origin"}
    if not required_metadata.issubset(metadata):
        raise ValueError("Report metadata is incomplete")
    if metadata["data_origin"] not in ("live", "synthetic"):
        raise ValueError("data_origin must be live or synthetic")
    if metadata["benchmark"] != "SkillsBench":
        raise ValueError("This report format is pinned to SkillsBench")
    if not isinstance(metadata["benchmark_sha"], str) or not REVISION.fullmatch(metadata["benchmark_sha"]):
        raise ValueError("benchmark_sha must be a full lowercase Git SHA")
    if metadata["opencode_version"] != "1.18.35":
        raise ValueError("This report format is pinned to OpenCode 1.18.35")
    if not isinstance(metadata["model"], str) or not MODEL.fullmatch(metadata["model"]):
        raise ValueError("model must be a provider/model identifier")
    if not isinstance(metadata["baseline_variant"], str) or not IDENTIFIER.fullmatch(metadata["baseline_variant"]):
        raise ValueError("baseline_variant must be a safe identifier")
    if metadata["budget_enforcement"] not in ("soft_between_attempts", "hard_provider_enforced"):
        raise ValueError("Unknown budget_enforcement type")
    attempts = [attempt_report(a) for a in source_attempts]
    keys = [(a["variant"], a["task_id"], a["repetition"]) for a in attempts]
    if len(set(keys)) != len(keys):
        raise ValueError("Duplicate task/variant/repetition attempt")
    skill_labels: dict[str, tuple[str, ...]] = {}
    for attempt in attempts:
        labels = attempt["relevant_skills"]
        if labels is None:
            continue
        previous = skill_labels.setdefault(attempt["task_id"], tuple(labels))
        if previous != tuple(labels):
            raise ValueError("Relevant-skill labels disagree across variants")
    by_variant: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_task_variant: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for attempt in attempts:
        by_variant[attempt["variant"]].append(attempt)
        by_task_variant[f"{attempt['task_id']}::{attempt['variant']}"].append(attempt)
    return {
        "metadata": {key: metadata[key] for key in sorted(required_metadata)},
        "attempts": attempts,
        "by_variant": {key: summarize_rows(rows) for key, rows in sorted(by_variant.items())},
        "by_task_and_variant": {key: summarize_rows(rows) for key, rows in sorted(by_task_variant.items())},
        "skill_metrics": skill_metrics(attempts),
        "paired_comparison": paired_comparison(attempts, metadata["baseline_variant"]),
        "interpretation": "Exploratory only; missing runtime evidence is unverifiable and one-run differences do not establish causality.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path, help="Private, sanitized input bundle JSON")
    args = parser.parse_args()
    print(json.dumps(build_report(json.loads(args.bundle.read_text())), indent=2))


if __name__ == "__main__":
    main()
