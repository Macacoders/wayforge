# SkillsBench paired comparison: prepared, not run

**Status:** deferred on 2026-11-01. The maintainer asked to advance through
Task 4 while free-model requests are quota-limited. No benchmark, verifier,
or model invocation was made for this comparison. There are no outcome,
efficiency, workflow, or causal findings.

## Prepared pair

| Field | Both variants |
| --- | --- |
| Benchmark | SkillsBench `b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af` |
| Task | `dialogue-parser`, one planned repetition |
| Wayforge source | `41db5a79a9bf846833f425d1e7af09bd301666a3` |
| OpenCode | `1.18.35` |
| Model | `opencode/big-pickle` for root, helper, and every explicit agent in both disposable configs |
| Planned budget | One attempt per variant; 600 seconds, 100,000 input and 20,000 output tokens per attempt; 1,200 seconds and 240,000 tokens for the pair; $0 paid use. These are declarations, not proven in-flight caps. |

The ignored private preparation record is
`temp/benchmark-testing/comparison-gx6up_7z/comparison-manifest.json`.
The baseline and `without_delivery_policy` workspaces contain 54 and 53
files, respectively. A hash comparison found exactly one difference: the
variant omits `.opencode/skills/delivery-policy/SKILL.md`. The shared model
pin was applied identically to both copies; tracked `base/opencode/**` and
the repository's generated `.opencode/` were not changed by preparation.

This ablation tests the availability of the policy skill. Its actual effect
on runtime routing is unverified. The current BenchFlow ACP interface also
does not reliably expose named child agents, so a future task score alone
would not establish how the Wayforge workflow changed.

## Deferred validation

The dedicated free-model account returned `Free usage limit reached` on
MiMo-V2.6-Flash Free and Big Pickle canaries. Task 2's live adapter and Task
3's report integration are also unvalidated. Before any paired run, a
maintainer must re-establish usable model access, confirm the provider's
current model price and $0 paid-use ceiling, review the task-container mount
and credential boundary, and authorize the exact paths, model, and finite
budget. The two upstream attempts must use the same unmodified task and
verifier. If child-role or usage evidence remains missing, the comparison
must show `unverifiable` fields and an inconclusive interpretation.
