const INSTRUCTIONS = {
  off: "",

  lite:
    "Prefer reuse over new code. Check existing codebase, stdlib, and dependencies before writing. Use `ponytail:` comments when deferring simpler solutions.",

  full: `## Ponytail Reuse-First Discipline (full)

Before writing any new code, climb the ladder:
1. Does this need to exist? (YAGNI) → skip it
2. Already in this codebase? → reuse it
3. Stdlib does it? → use it
4. Native platform feature? → use it
5. Installed dependency solves it? → use it
6. One line? → one line
7. Only then: write the minimum that works

When you defer a simpler solution (e.g., adding a helper when a one-liner would work), add a \`ponytail:\` comment explaining why. Use \`/ponytail-review\` to audit current work for over-engineering.`,

  ultra:
    "STRICT ponytail ultra mode. Apply every rung rigorously. Do not write any new code unless you can justify why rungs 1-6 do not apply. Flag every exception with `ponytail:` comments.",
};

export function buildInstructions(mode) {
  return INSTRUCTIONS[mode] || "";
}
