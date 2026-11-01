"""Build and dry-run a pinned, budgeted evaluation schedule offline.

This is a Task 2 planning contract. It never invokes BenchFlow, Docker, or a
model. A live runner must be attached only after the adapter and evidence
interface have been validated separately.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Callable, Optional, Tuple

from budget_contract import BudgetLedger, Limits, Outcome, Usage


IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}\Z")
REVISION = re.compile(r"[0-9a-f]{40}\Z")
MODEL = re.compile(r"[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\Z")


@dataclass(frozen=True)
class Variant:
    name: str
    wayforge_sha: str


@dataclass(frozen=True)
class AttemptSpec:
    number: int
    task: str
    variant: Variant
    repetition: int


@dataclass(frozen=True)
class EvaluationPlan:
    benchmark_sha: str
    opencode_version: str
    model: str
    tasks: tuple[str, ...]
    variants: tuple[Variant, ...]
    repetitions: int
    limits: Limits

    @classmethod
    def from_dict(cls, raw: dict[str, object]) -> EvaluationPlan:
        expected = {
            "benchmark_sha", "opencode_version", "model", "tasks", "variants",
            "repetitions", "limits",
        }
        if set(raw) != expected:
            raise ValueError(f"Evaluation fields must be exactly: {', '.join(sorted(expected))}")
        sha = raw["benchmark_sha"]
        if not isinstance(sha, str) or not REVISION.fullmatch(sha):
            raise ValueError("benchmark_sha must be a full lowercase Git SHA")
        version = raw["opencode_version"]
        if version != "1.18.35":
            raise ValueError("This offline contract is pinned to OpenCode 1.18.35")
        model = raw["model"]
        if not isinstance(model, str) or not MODEL.fullmatch(model):
            raise ValueError("model must be a provider/model identifier")
        tasks = raw["tasks"]
        if (
            not isinstance(tasks, list) or not tasks
            or any(not isinstance(x, str) or not IDENTIFIER.fullmatch(x) for x in tasks)
            or len(set(tasks)) != len(tasks)
        ):
            raise ValueError("tasks must be unique safe task IDs")
        variants_raw = raw["variants"]
        if not isinstance(variants_raw, list) or not variants_raw:
            raise ValueError("variants must be a nonempty list")
        variants = []
        for item in variants_raw:
            if not isinstance(item, dict) or set(item) != {"name", "wayforge_sha"}:
                raise ValueError("Each variant needs name and wayforge_sha")
            name = item["name"]
            revision = item["wayforge_sha"]
            if not isinstance(name, str) or not IDENTIFIER.fullmatch(name):
                raise ValueError("variant name must be a safe identifier")
            if not isinstance(revision, str) or not REVISION.fullmatch(revision):
                raise ValueError("wayforge_sha must be a full lowercase Git SHA")
            variants.append(Variant(name, revision))
        if len({v.name for v in variants}) != len(variants):
            raise ValueError("variant names must be unique")
        repetitions = raw["repetitions"]
        if isinstance(repetitions, bool) or not isinstance(repetitions, int) or repetitions <= 0:
            raise ValueError("repetitions must be a positive integer")
        limits_raw = raw["limits"]
        if not isinstance(limits_raw, dict):
            raise ValueError("limits must be an object")
        plan = cls(
            benchmark_sha=sha,
            opencode_version=version,
            model=model,
            tasks=tuple(tasks),
            variants=tuple(variants),
            repetitions=repetitions,
            limits=Limits.from_dict(limits_raw),
        )
        plan.attempts()
        return plan

    def attempts(self) -> tuple[AttemptSpec, ...]:
        per_variant = len(self.tasks) * self.repetitions
        total = per_variant * len(self.variants)
        if per_variant > self.limits.variant_attempts or total > self.limits.run_attempts:
            raise ValueError("Planned attempts exceed variant or run count limit")
        if per_variant * self.limits.attempt_usd > self.limits.variant_usd:
            raise ValueError("Worst-case variant cost exceeds declared ceiling")
        if total * self.limits.attempt_usd > self.limits.run_usd:
            raise ValueError("Worst-case run cost exceeds declared ceiling")
        return tuple(
            AttemptSpec(number, task, variant, repetition)
            for number, (variant, task, repetition) in enumerate(
                (
                    (variant, task, repetition)
                    for variant in self.variants
                    for task in self.tasks
                    for repetition in range(1, self.repetitions + 1)
                ),
                1,
            )
        )

    def preview(self) -> dict[str, object]:
        attempts = self.attempts()
        return {
            "benchmark_sha": self.benchmark_sha,
            "opencode_version": self.opencode_version,
            "model": self.model,
            "attempts": [
                {
                    "number": a.number, "task": a.task, "variant": a.variant.name,
                    "wayforge_sha": a.variant.wayforge_sha, "repetition": a.repetition,
                }
                for a in attempts
            ],
            "maximum_exposure": {
                "attempts": len(attempts),
                "wall_seconds": len(attempts) * self.limits.attempt_seconds,
                "input_tokens": len(attempts) * self.limits.attempt_input_tokens,
                "output_tokens": len(attempts) * self.limits.attempt_output_tokens,
                "cost_usd": str(len(attempts) * self.limits.attempt_usd),
                "provider_ceiling_usd": str(self.limits.provider_ceiling_usd),
                "enforcement": "soft_between_attempts; provider ceiling must be checked separately",
            },
        }


Runner = Callable[[AttemptSpec], Tuple[Outcome, Optional[Usage]]]


def run_with_runner(plan: EvaluationPlan, runner: Runner) -> BudgetLedger:
    """Exercise a supplied runner once per planned attempt; stop on missing usage."""
    ledger = BudgetLedger(plan.limits)
    for attempt in plan.attempts():
        ledger.reserve(attempt.variant.name)
        try:
            outcome, usage = runner(attempt)
        except Exception:
            ledger.finish("runtime_error", None)
            break
        ledger.finish(outcome, usage)
        if usage is None or not usage.all_agents_included:
            break
        if ledger.attempts[-1].outcome == "budget_exhausted":
            break
    return ledger


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path, help="JSON evaluation manifest")
    args = parser.parse_args()
    plan = EvaluationPlan.from_dict(json.loads(args.config.read_text()))
    print(json.dumps(plan.preview(), indent=2))


if __name__ == "__main__":
    main()
