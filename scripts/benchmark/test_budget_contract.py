"""Deterministic tests for the offline budget contract."""

from decimal import Decimal
import unittest

from budget_contract import BudgetLedger, Limits, Usage


def limits(**overrides: object) -> Limits:
    raw: dict[str, object] = {
        "attempt_seconds": 600,
        "attempt_input_tokens": 1000,
        "attempt_output_tokens": 500,
        "attempt_usd": "1",
        "variant_usd": "2",
        "run_usd": "3",
        "provider_ceiling_usd": "3",
        "variant_attempts": 2,
        "run_attempts": 3,
    }
    raw.update(overrides)
    return Limits.from_dict(raw)


def usage(cost: str = "0.8", *, complete: bool = True) -> Usage:
    return Usage.from_values(800, 400, cost, complete)


class BudgetContractTests(unittest.TestCase):
    def test_reserves_before_attempt_and_caps_variant_and_run(self) -> None:
        ledger = BudgetLedger(limits())
        self.assertEqual(ledger.reserve("baseline"), 1)
        with self.assertRaisesRegex(RuntimeError, "Finish the current"):
            ledger.reserve("baseline")
        ledger.finish("completed", usage())
        self.assertEqual(ledger.reserve("baseline"), 2)
        ledger.finish("verifier_failed", usage())
        with self.assertRaisesRegex(RuntimeError, "Variant attempt cap"):
            ledger.reserve("baseline")
        self.assertEqual(ledger.reserve("ablation"), 3)
        ledger.finish("completed", usage())
        with self.assertRaisesRegex(RuntimeError, "Run attempt cap"):
            ledger.reserve("other")

    def test_missing_or_partial_child_usage_stops_following_attempts(self) -> None:
        for missing in (None, usage(complete=False)):
            ledger = BudgetLedger(limits())
            ledger.reserve("baseline")
            attempt = ledger.finish("timeout", missing)
            self.assertEqual(attempt.outcome, "timeout")
            with self.assertRaisesRegex(RuntimeError, "Usage is incomplete"):
                ledger.reserve("ablation")

    def test_zero_usage_is_valid_for_pre_model_failure(self) -> None:
        empty = Usage.from_values(0, 0, "0", True)
        ledger = BudgetLedger(limits())
        ledger.reserve("baseline")
        attempt = ledger.finish("runtime_error", empty)
        self.assertEqual(attempt.outcome, "runtime_error")
        self.assertEqual(attempt.usage.input_tokens, 0)

    def test_overrun_is_distinct_from_verifier_failure_and_stops(self) -> None:
        ledger = BudgetLedger(limits())
        ledger.reserve("baseline")
        attempt = ledger.finish("completed", usage("1.1"))
        self.assertEqual(attempt.outcome, "budget_exhausted")
        self.assertEqual(attempt.usage.cost_usd, Decimal("1.1"))
        with self.assertRaisesRegex(RuntimeError, "Usage is incomplete"):
            ledger.reserve("baseline")

    def test_cost_reservation_uses_remaining_budget(self) -> None:
        ledger = BudgetLedger(limits(run_usd="1.5"))
        ledger.reserve("baseline")
        ledger.finish("completed", usage("0.8"))
        with self.assertRaisesRegex(RuntimeError, "Remaining run budget"):
            ledger.reserve("ablation")

    def test_one_hour_evaluation_allowance_is_supported(self) -> None:
        for seconds in (900, 901, 3600):
            self.assertEqual(limits(attempt_seconds=seconds).attempt_seconds, seconds)

    def test_invalid_or_unenforceable_limits_fail_closed(self) -> None:
        for change in (
            {"attempt_seconds": 3601},
            {"attempt_seconds": 0},
            {"attempt_seconds": True},
            {"attempt_input_tokens": 0},
            {"attempt_usd": "NaN"},
            {"run_usd": "4"},
            {"run_attempts": True},
        ):
            with self.subTest(change=change), self.assertRaises(ValueError):
                limits(**change)


if __name__ == "__main__":
    unittest.main()
