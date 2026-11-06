# Benchmark evaluation workbench

For the next-agent coding handoff, read the **Handoff for the next agent**
section of `docs/ai/plans/2026-10-31_224912-benchmark-backed-harness-evaluation.md`.

The pinned SkillsBench/BenchFlow probe is a human-supervised Task 1 interface
check. Its upstream verifier output is an outcome measure. The 2026-11-02
session export captured `delivery`, `skill(name=delivery-policy)`, and a linked
`code` child session, but no `reviewer`; the run timed out after 900 seconds
despite verifier reward `1.0`. ACP's flattened trajectory still does not name
the child or skill. The full Wayforge workflow remains unproven. The
2026-11-01 maintainer waiver permits offline Task 2 work, not a full-chain pass.

## Current commands

- `prepare_skillsbench_probe.py` prepares a disposable install from tracked
  Wayforge source after an installer dry-run. It makes no model or Docker call.
- `run_skillsbench_probe.py` runs one human-supervised upstream attempt with
  mount inspection and the dedicated free-model key. It is not a repeated or
  budgeted evaluation runner. Do not invoke it while free requests are being
  rejected or treat a partial reward as verified resolution. It prints one
  `usage` record for BenchFlow's own ACP view and writes a per-session `usage`
  record into each `session-export-index.json` entry, so the index is
  self-sufficient for reporting.
- `run_evidence_canary.sh` runs one local, non-benchmark `/deliver` canary and
  extracts restricted session evidence. It stops promptly on the observed
  `Free usage limit reached` error.
- `budget_contract.py` defines offline reservation and stop rules for the
  future Task 2 runner. Test it with
  `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'`.
- `prepare_evaluation.py` copies a private evaluation manifest's sources into
  fresh single-model evaluation sources, without credentials or execution (below).
- `evaluation_runner.py` is the human-triggered, fresh-workspace BenchFlow
  adapter. It reserves each attempt, records restricted evidence, and stops on
  unknown usage or exceeded limits. Independent acceptance is still pending.
- `evaluation_plan.py` validates task, variant, revision, model, repetition,
  and budget selections and prints an offline attempt preview. Its fake-runner
  tests exercise no-retry and missing-usage stops. It does not execute an
  attempt. Preview the pinned smoke example with
  `python3 scripts/benchmark/evaluation_plan.py scripts/benchmark/evaluation.example.json`.
- `report.py` renders an offline report from upstream-shaped result objects
  and restricted session summaries. It accepts either the report session shape
  or the probe's `session-export-index.json` shape. The checked-in
  `report.example.input.json` / `report.example.output.json` pair is explicitly
  synthetic; its illustrative variant is not a benchmark result. Generate it
  with `python3 scripts/benchmark/report.py scripts/benchmark/report.example.input.json`.
  No raw session exports or agent prose are inputs to this report layer.
- `prepare_comparison.py` creates a paired, ignored Task 4 baseline and one
  skill-unavailable ablation from the pinned disposable probe install. It
  applies the same Big Pickle model pin to both and verifies that the only
  between-variant file difference is removal of
  `.opencode/skills/delivery-policy/SKILL.md`. Run it with
  `python3 scripts/benchmark/prepare_comparison.py`. It makes no model,
  Docker, or verifier call; its manifest says `not_run`.

## Usage accounting: measured, estimated, unavailable

Until issue #286 the two usage sources were never combined: BenchFlow's
flattened ACP counters could report zero tokens and an unknown cost for an
attempt whose sessions recorded model use. A report now labels every figure
with its source and its status, and a missing figure is never replaced by zero.

| Figure | Meaning | How it can be wrong |
| --- | --- | --- |
| `usage.all_session_tokens` | Measured per-session tokens from the OpenCode export, summed over root **and** child sessions. `sources.session_export.per_agent` keeps the same numbers split by agent role. | Only as complete as the capture: a `task` call that never returned, or a session whose tool events were not parsed, leaves child usage unproven, so the total becomes `unverifiable`. |
| `sources.benchflow_acp.*` | BenchFlow 0.6.3's own counters (`agent_native_acp`). The key is always present. | Partial by construction: it may omit child agents, so `0` can mean "not reported". When BenchFlow itself reports `status: unavailable`, this record is `unavailable` even if its legacy counters carry a leftover `0`. Never treated as proof of zero spend. |
| `all_session_tokens.runtime_estimated_cost_usd` | Estimated cost: the sum of the costs OpenCode reports per session. | Usually `0` on free models; it is an estimate, not a bill. |
| `provider_billed_cost_usd` | Measured cost, and only when `provider_billing_ref` points at a private billing extract. | `unverifiable` without that reference. The local budget ledger is a soft cap, not a provider-enforced one. |
| `benchflow_undercount` | `true` when BenchFlow reported zero or missing tokens/cost while session totals show model use. | `unverifiable` when the two sources cannot be compared. Never read it as zero spend. |
| `missing_child_usage` | `true` when a dispatch or export gap leaves some child usage unproven. | It describes dispatches and exports only, not whether the token total is measured: a measured total still reports `true` when a `task` event could not be parsed. It does not estimate the missing amount. |

Totals, costs, and computed counts that cannot be measured are the string
`unverifiable`. Individual sub-fields inside `sources.benchflow_acp` may instead
be `null`, which means "not reported"; the source `status`
(`measured`, `partial`, `unavailable`) is the field to trust first.

### Not measured

These figures stay outside the accounting model and must not be inferred from
the report:

- Helper and `small_model` calls (for example session-title generation) are
  not separately identifiable in either source. Their tokens and cost are
  `unverifiable` without a provider extract.
- A session's reported `cost` is assumed to be session-local. If OpenCode ever
  reported a cumulative value, `runtime_estimated_cost_usd` would double-count
  root plus child sessions.
- Retries, ACP reconnect overhead, and work before the first session are not
  attributed to any attempt.
- Capture exports at most 50 unique sessions. A listing with 50 or more entries
  is potentially truncated, even at exactly 50. Unseen sessions beyond the export
  cap, invalid/unresolved identities, and missing child evidence also prevent
  complete usage. Restricted partial indexes remain useful evidence, never proof
  of zero omitted usage; incomplete usage stops the next scheduled attempt.

## Offline preparation and human-owned execution

Installed free-tier configs intentionally mix role models. The diagnostic probe
keeps that behavior; the evaluation runner instead requires one declared free
model for root, small model, and every explicit JSON role/helper assignment.
Execution validates but never repairs declared sources. To normalize a pinned
private evaluation-run manifest **offline**, the human runs:

```bash
python3 scripts/benchmark/prepare_evaluation.py temp/benchmark-testing/evaluation-run.json
```

This command does not import BenchFlow, read credentials, invoke the installer,
or start Docker/models. It verifies the existing source digests, clean benchmark
revision, task paths, required installed files, and symlink restrictions first.
Stale digests are errors, not permission to regenerate evidence. It creates a
fresh private `evaluation-sources-*` directory and prints only the new manifest
path and `prepared_not_run` metadata. Old sources, manifest, and attempts are not
overwritten. Only JSON model assignments change semantically; JSON formatting
may change. New digests bind these normalized copies. Plan selections, limits,
provider definitions, and all other files are preserved. Sources are thereafter
immutable inputs by digest contract, not an OS-enforced read-only filesystem.

The human must explicitly select the **new printed manifest path** for any later
run. Preparation alone grants no execution or spending authorization. Markdown
agents must remain model-agnostic: evaluation accepts generated `description`,
`mode`, and `temperature` fields plus the installer's nested `permission:` block.
Permission fields are limited to `read`, `edit`, `question`, `bash`,
`external_directory`, and `task`, with `allow`/`deny`/`ask` actions and strictly
indented, plain-identifier or simple double-quoted rule keys. This is a narrow
generated-format grammar, not a general YAML parser. Explicit model fields
(including quoted keys), aliases, merges, multiline scalars, duplicate/unknown
keys and other unsupported YAML fail closed; they are not rewritten. Rejections
identify the agent basename, line number, and a fixed syntax category, without
printing frontmatter values, unknown keys, or private directory paths.
Nonstandard filenames are replaced with a placeholder. This is a
narrow evaluation contract, not a restriction on OpenCode's general YAML support.

After separately confirming current free-model availability/pricing, finite
limits, provider ceiling, and exact container mounts/capabilities/environment
names, the human may use the pinned BenchFlow interpreter:

```bash
python3 scripts/benchmark/evaluation_runner.py <new-private-manifest> --key-file <dedicated-0600-key>
```

The key stays outside the evaluation root. No live run is required for these
repairs; do not run this command as agent validation or retry automatically.
Evaluation manifests may explicitly select up to **3,600 seconds (one hour)**
for `plan.limits.attempt_seconds`; existing manifests are not raised automatically.
This is the agent-execution allowance. The adapter's outer watchdog allows that
value plus a finite 600 seconds for setup, verification, and cleanup/capture
(4,200 seconds total for a one-hour allowance). The diagnostic probe keeps its
separate 900-second maximum. Changing time does not increase token, cost, or
attempt-count limits or authorize an automatic retry.

Token/cost ledger limits are **soft between-attempt controls**, not in-flight hard
caps or evidence of provider billing. Time is enforced by the SDK timeout and
outer watchdog described above. An upstream timeout/runtime failure remains
distinct from verifier failure and the ledger's budget-exhausted outcome.

Failure records include explicit capture status and index availability. An index
reference appears only if the file exists; available cleanup capture survives SDK
exceptions and outer timeouts. No result fields or usage are invented when the
SDK returns no result. Safe reason codes replace arbitrary exception text. The
SDK owns cleanup, and the adapter wraps that callback once to capture first;
creation failure is `not_attempted`, and lifecycle flags distinguish a cleanup
call from successful cleanup. There is no second cleanup or retry. Secret
detection remains a fatal abort, including during failure cleanup, not an ordinary
recorded runtime outcome. Complete captured usage is retained on failures when
it genuinely exists; missing/incomplete usage halts the schedule.

## Report integration still pending

The runner calls the pinned upstream rollout for each explicitly chosen
task, variant, and repetition, always from the same unmodified task package
and a fresh disposable workspace. Before starting each attempt, reserve its
declared worst-case cost and finite token/time exposure. The provider spending
ceiling must be confirmed independently; the local ledger is a soft cap, not
an in-flight kill switch. A missing cost or child-agent usage record stops all
following attempts. Timeout, budget exhaustion, runtime error, and upstream
verifier failure are distinct outcomes; none is retried silently.

The parent plan records a later human-reported runner smoke with complete
session usage and a correct budget-exhausted stop. That is historical runner
path evidence, not task success, independent acceptance, provider billing, or
permission for another live run. The repaired runner still awaits independent
architecture and functional review; report conversion and paired live execution
remain blocked. `report.py` fails closed on missing children or incomplete
session numbers, and the ledger stops following attempts on unknown usage.
Paid execution remains out of scope. No benchmark command is part of the regular
test suite or `make check`; run the offline checks with
`python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'`.
