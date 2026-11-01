"""Offline budget reservation contract for human-triggered benchmark attempts.

This module makes no model, Docker, or benchmark calls. Its limits are soft
between attempts. The provider ceiling is a declared requirement, not proof
that the provider has been configured to enforce it in flight.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Literal


Outcome = Literal["completed", "verifier_failed", "timeout", "runtime_error", "budget_exhausted"]


def _money(value: object, label: str) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{label} must be a finite nonnegative amount") from exc
    if not amount.is_finite() or amount < 0:
        raise ValueError(f"{label} must be a finite nonnegative amount")
    return amount


def _positive_int(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")
    return value


def _nonnegative_int(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{label} must be a nonnegative integer")
    return value


@dataclass(frozen=True)
class Limits:
    attempt_seconds: int
    attempt_input_tokens: int
    attempt_output_tokens: int
    attempt_usd: Decimal
    variant_usd: Decimal
    run_usd: Decimal
    provider_ceiling_usd: Decimal
    variant_attempts: int
    run_attempts: int

    @classmethod
    def from_dict(cls, raw: dict[str, object]) -> Limits:
        expected = set(cls.__dataclass_fields__)
        if set(raw) != expected:
            raise ValueError(f"Budget fields must be exactly: {', '.join(sorted(expected))}")
        limits = cls(
            attempt_seconds=_positive_int(raw["attempt_seconds"], "attempt_seconds"),
            attempt_input_tokens=_positive_int(
                raw["attempt_input_tokens"], "attempt_input_tokens"
            ),
            attempt_output_tokens=_positive_int(
                raw["attempt_output_tokens"], "attempt_output_tokens"
            ),
            attempt_usd=_money(raw["attempt_usd"], "attempt_usd"),
            variant_usd=_money(raw["variant_usd"], "variant_usd"),
            run_usd=_money(raw["run_usd"], "run_usd"),
            provider_ceiling_usd=_money(
                raw["provider_ceiling_usd"], "provider_ceiling_usd"
            ),
            variant_attempts=_positive_int(raw["variant_attempts"], "variant_attempts"),
            run_attempts=_positive_int(raw["run_attempts"], "run_attempts"),
        )
        if limits.attempt_seconds > 900:
            raise ValueError("attempt_seconds must not exceed the pinned probe limit of 900")
        if limits.attempt_usd > limits.variant_usd or limits.attempt_usd > limits.run_usd:
            raise ValueError("One attempt exceeds a variant or run cost ceiling")
        if limits.run_usd > limits.provider_ceiling_usd:
            raise ValueError("Run ceiling exceeds the independently configured provider ceiling")
        return limits


@dataclass(frozen=True)
class Usage:
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal
    all_agents_included: bool

    @classmethod
    def from_values(
        cls, input_tokens: object, output_tokens: object, cost_usd: object,
        all_agents_included: bool,
    ) -> Usage:
        if not isinstance(all_agents_included, bool):
            raise ValueError("all_agents_included must be a boolean")
        return cls(
            input_tokens=_nonnegative_int(input_tokens, "input_tokens"),
            output_tokens=_nonnegative_int(output_tokens, "output_tokens"),
            cost_usd=_money(cost_usd, "cost_usd"),
            all_agents_included=all_agents_included,
        )


@dataclass(frozen=True)
class Attempt:
    number: int
    variant: str
    outcome: Outcome
    usage: Usage | None


class BudgetLedger:
    def __init__(self, limits: Limits):
        self.limits = limits
        self.attempts: list[Attempt] = []
        self._pending: tuple[int, str] | None = None
        self._unknown_usage = False

    def reserve(self, variant: str) -> int:
        """Reserve worst-case cost before one attempt. Never silently retry."""
        if not variant or not variant.isascii() or not all(
            char.isalnum() or char in "-_" for char in variant
        ):
            raise ValueError("variant must be a simple nonempty identifier")
        if self._pending is not None:
            raise RuntimeError("Finish the current attempt before reserving another")
        if self._unknown_usage:
            raise RuntimeError("Usage is incomplete; no further attempt is permitted")
        if len(self.attempts) >= self.limits.run_attempts:
            raise RuntimeError("Run attempt cap reached")
        variant_attempts = sum(a.variant == variant for a in self.attempts)
        if variant_attempts >= self.limits.variant_attempts:
            raise RuntimeError("Variant attempt cap reached")
        known_run_cost = sum((a.usage.cost_usd for a in self.attempts if a.usage), Decimal(0))
        known_variant_cost = sum(
            (a.usage.cost_usd for a in self.attempts if a.variant == variant and a.usage),
            Decimal(0),
        )
        if known_run_cost + self.limits.attempt_usd > self.limits.run_usd:
            raise RuntimeError("Remaining run budget cannot reserve an attempt")
        if known_variant_cost + self.limits.attempt_usd > self.limits.variant_usd:
            raise RuntimeError("Remaining variant budget cannot reserve an attempt")
        number = len(self.attempts) + 1
        self._pending = (number, variant)
        return number

    def finish(self, outcome: Outcome, usage: Usage | None) -> Attempt:
        if self._pending is None:
            raise RuntimeError("No reserved attempt to finish")
        if outcome not in (
            "completed", "verifier_failed", "timeout", "runtime_error", "budget_exhausted"
        ):
            raise ValueError("Unknown attempt outcome")
        number, variant = self._pending
        self._pending = None
        if usage is None or not usage.all_agents_included:
            self._unknown_usage = True
        elif (
            usage.input_tokens > self.limits.attempt_input_tokens
            or usage.output_tokens > self.limits.attempt_output_tokens
            or usage.cost_usd > self.limits.attempt_usd
        ):
            outcome = "budget_exhausted"
            self._unknown_usage = True
        attempt = Attempt(number, variant, outcome, usage)
        self.attempts.append(attempt)
        return attempt
