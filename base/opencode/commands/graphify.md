---
description: Route explicit /graphify requests through planner using curated Graphify guidance.
agent: planner
---

Handle this as an explicit Graphify request:

$ARGUMENTS

First establish the active repository root. Keep searches, reads, writes, and reviews inside that root unless the user explicitly approves an external path.

Load and follow the `graphify-memory` skill for Graphify-specific workflow and safety guidance. Keep Graphify optional, avoid enabling plugins or dependencies by default, and do not commit generated `graphify-out/**` artifacts.
