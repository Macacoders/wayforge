import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { ManifestContext } from "../../src/lib/context.js";
import {
  renderAgentPermissionBlock,
  renderAgentWithCentralPermissions,
} from "../../src/lib/permissions.js";

const permissionsFile = path.resolve(
  __dirname,
  '../../..',
  "base",
  "opencode",
  "permissions",
  "agents.yml",
);

const agentsDir = path.resolve(
  __dirname,
  "../../..",
  "base",
  "opencode",
  "agents",
);

const allAgents = fs
  .readdirSync(agentsDir)
  .filter((entry) => entry.endsWith(".md"))
  .map((entry) => entry.replace(/\.md$/, ""))
  .sort();

function makeCtx(dryRun = false): ManifestContext {
  return new ManifestContext(dryRun, false, false);
}

describe("renderAgentPermissionBlock", () => {
  it("extracts planner permissions", () => {
    const block = renderAgentPermissionBlock("planner", permissionsFile);

    expect(block.startsWith("permission:")).toBe(true);
    expect(block).toContain("read: allow");
    expect(block).toContain("glob: allow");
    expect(block).toContain("grep: allow");
    expect(block).toContain("skill:");
    expect(block).toContain('"*": deny');
    expect(block).toContain("intent: allow");
    expect(block).toContain("plan: allow");
    expect(block).toContain("webfetch: allow");
    expect(block).toContain("websearch: allow");
    expect(block).toContain("edit:");
    expect(block).toContain('"docs/ai/**": allow');
    expect(block).toContain("bash: ask");
    expect(block).toContain("external_directory: deny");
    expect(block).not.toContain("agents:");
    expect(block).not.toContain('"*": allow');
  });

  it("renders the correct edit permission for each agent", () => {
    expect(renderAgentPermissionBlock("code", permissionsFile)).toContain(
      "edit: allow",
    );
    expect(renderAgentPermissionBlock("implementer", permissionsFile)).toContain(
      "edit: allow",
    );
    const planner = renderAgentPermissionBlock("planner", permissionsFile);
    expect(planner).toContain("edit:");
    expect(planner).toContain('"docs/ai/**": allow');
    expect(renderAgentPermissionBlock("delivery", permissionsFile)).toContain(
      "edit: ask",
    );
    expect(renderAgentPermissionBlock("research", permissionsFile)).toContain(
      "edit: ask",
    );
    expect(renderAgentPermissionBlock("architect", permissionsFile)).toContain(
      "edit: deny",
    );
    expect(renderAgentPermissionBlock("reviewer", permissionsFile)).toContain(
      "edit: deny",
    );
    const auditor = renderAgentPermissionBlock("auditor", permissionsFile);
    expect(auditor).toContain("edit:");
    expect(auditor).toContain('"docs/ai/plans/**": allow');
    expect(auditor).toContain('"docs/ai/logs/**": allow');
  });

  it("uses native inspection tools and prompts before reviewer shell commands", () => {
    const block = renderAgentPermissionBlock("reviewer", permissionsFile);

    expect(block).toContain("read: allow");
    expect(block).toContain("glob: allow");
    expect(block).toContain("grep: allow");
    expect(block).toContain("skill: deny");
    expect(block).toContain("edit: deny");
    expect(block).toContain("bash: ask");
  });

  it("renders question: allow only for primary decision roles", () => {
    for (const agent of ["planner", "delivery", "troubleshooter", "implementer"]) {
      expect(renderAgentPermissionBlock(agent, permissionsFile)).toContain(
        "question: allow",
      );
    }
    for (const agent of [
      "code",
      "research",
      "architect",
      "reviewer",
      "auditor",
      "scout",
    ]) {
      expect(renderAgentPermissionBlock(agent, permissionsFile)).not.toContain(
        "question: allow",
      );
    }
  });

  it("throws for unknown agent", () => {
    expect(() =>
      renderAgentPermissionBlock("nonexistent-agent", permissionsFile),
    ).toThrow();
  });
});

describe("coarse permission guards", () => {
  it("renders a non-empty permission block for every agent", () => {
    for (const agent of allAgents) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      expect(block.startsWith("permission:")).toBe(true);
      const nonEmpty = block.split("\n").filter((line) => line.trim() !== "");
      expect(nonEmpty.length).toBeGreaterThan(1);
    }
  });

  it("renders read: allow for every agent", () => {
    for (const agent of allAgents) {
      expect(renderAgentPermissionBlock(agent, permissionsFile)).toContain(
        "read: allow",
      );
    }
  });

  it("uses native inspection tools instead of automatic shell access", () => {
    for (const agent of allAgents) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      expect(block).toContain("glob: allow");
      expect(block).toContain("grep: allow");
      expect(block).not.toContain('"*": allow');
    }

    for (const agent of ["research", "scout", "architect"]) {
      expect(renderAgentPermissionBlock(agent, permissionsFile)).toContain(
        "bash: deny",
      );
    }
    for (const agent of ["planner", "code", "auditor", "reviewer", "troubleshooter"]) {
      expect(renderAgentPermissionBlock(agent, permissionsFile)).toContain(
        "bash: ask",
      );
    }
  });

  it("allows only each role's owned skills", () => {
    const expectedSkills: Record<string, string[]> = {
      planner: [
        "ai-memory",
        "create-skill",
        "delivery-policy",
        "intent",
        "memory-maintenance",
        "plan",
        "ponytail",
        "ponytail-audit",
        "ponytail-debt",
        "ponytail-gain",
        "ponytail-help",
        "shared-task",
        "triage",
      ],
      delivery: [
        "ai-memory",
        "delivery-policy",
        "memory-maintenance",
        "ponytail-review",
      ],
      implementer: [
        "ai-memory",
        "implementation-quality",
        "memory-maintenance",
      ],
      auditor: ["ai-memory", "memory-maintenance", "review-triage"],
    };

    for (const agent of allAgents) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      const expected = expectedSkills[agent] ?? [];
      if (expected.length === 0) {
        expect(block).toContain("skill: deny");
        continue;
      }
      expect(block).toContain("skill:");
      expect(block).toContain('"*": deny');
      for (const skill of expected) {
        expect(block).toContain(`${skill}: allow`);
      }
    }
  });

  it("renders no comments into any agent block", () => {
    for (const agent of allAgents) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      expect(block.includes("#")).toBe(false);
    }
  });

  it("renders the external_directory boundary for every agent", () => {
    for (const agent of allAgents) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      expect(block).toContain("external_directory: deny");
    }
  });

  it("allows delivery to dispatch every work-order owner it depends on", () => {
    // Issue #231: work orders are only executable if the dispatching agent may
    // delegate to the owning subagent. Without this, the independent review gate
    // is unreachable and delivery must either self-approve or stall.
    const workOrderOwners = ["code", "reviewer", "architect", "research"];
    const block = renderAgentPermissionBlock("delivery", permissionsFile);
    const taskBlock = block.slice(block.indexOf("task:"));

    expect(taskBlock.length).toBeGreaterThan(0);
    for (const owner of workOrderOwners) {
      expect(taskBlock).toContain(`${owner}: allow`);
    }
    // the wildcard must be denied inside task:, not merely somewhere in the block
    expect(taskBlock).toContain('"*": deny');
    expect(taskBlock.indexOf('"*": deny')).toBeLessThan(
      taskBlock.indexOf('research: allow'),
    );
  });

  it("allows only experimental primary agents to dispatch scout", () => {
    for (const agent of ["implementer", "auditor"]) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      const taskBlock = block.slice(block.indexOf("task:"));
      expect(taskBlock).toContain('"*": deny');
      expect(taskBlock).toContain("scout: allow");
    }
    for (const agent of [
      "planner",
      "delivery",
      "research",
      "code",
      "troubleshooter",
      "architect",
      "reviewer",
      "scout",
    ]) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      expect(block).not.toContain("scout: allow");
    }
  });

  it("keeps subagent dispatch out of read-only and worker roles", () => {
    for (const agent of ["code", "reviewer", "architect", "research", "scout"]) {
      expect(renderAgentPermissionBlock(agent, permissionsFile)).toContain(
        "task: deny",
      );
    }
  });

  it("prompts legacy code validation and allows only required autonomous commits", () => {
    expect(renderAgentPermissionBlock("code", permissionsFile)).toContain(
      "bash: ask",
    );

    for (const agent of ["delivery", "implementer"]) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      expect(block).toContain('"*": ask');
      expect(block).toContain('"git commit*": allow');
    }
    const implementer = renderAgentPermissionBlock("implementer", permissionsFile);
    for (const command of [
      '"git status --short": allow',
      '"git log --oneline -10": allow',
      '"npx tsx .opencode/skills/ai-memory/scripts/ai-memory.ts status --json": allow',
      '"npx tsx .opencode/skills/ai-memory/scripts/ai-memory.ts close-check": allow',
    ]) {
      expect(implementer).toContain(command);
    }
    const auditor = renderAgentPermissionBlock("auditor", permissionsFile);
    expect(auditor).toContain('"docs/ai/plans/**": allow');
    expect(auditor).not.toContain('"git commit*": allow');

    const scout = renderAgentPermissionBlock("scout", permissionsFile);
    expect(scout).toContain("edit: deny");
    expect(scout).not.toContain('"git commit*": allow');
  });
});

describe("renderAgentWithCentralPermissions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wayforge-perm-test-"));
  });

  afterEach(() => {
    fs.removeSync(tmpDir);
  });

  it("injects permissions into frontmatter", () => {
    const src = path.join(tmpDir, "testagent.md");
    const dst = path.join(tmpDir, "testagent-out.md");
    const agentsYml = path.join(tmpDir, "agents.yml");

    fs.writeFileSync(
      src,
      ["---", "name: testagent", "description: A test agent", "---", "# Content"].join(
        "\n",
      ) + "\n",
    );
    fs.writeFileSync(
      agentsYml,
      ["agents:", "  testagent:", "    edit: ask"].join("\n") + "\n",
    );

    renderAgentWithCentralPermissions(src, dst, "testagent", agentsYml, makeCtx());

    const content = fs.readFileSync(dst, "utf8");
    expect(content).toContain("description: A test agent");
    expect(content).toContain("permission:");
    expect(content).toContain("  edit: ask");
    const descIdx = content.indexOf("description: A test agent");
    const permIdx = content.indexOf("permission:");
    const endFmIdx = content.indexOf("---", descIdx);
    expect(permIdx).toBeGreaterThan(descIdx);
    expect(permIdx).toBeLessThan(endFmIdx);
  });

  it("injects permissions into a CRLF source file", () => {
    const src = path.join(tmpDir, "testagent.md");
    const dst = path.join(tmpDir, "testagent-out.md");
    const agentsYml = path.join(tmpDir, "agents.yml");

    fs.writeFileSync(
      src,
      ["---", "name: testagent", "description: A test agent", "---", "# Content"].join(
        "\r\n",
      ) + "\r\n",
    );
    fs.writeFileSync(
      agentsYml,
      ["agents:", "  testagent:", "    edit: ask"].join("\n") + "\n",
    );

    renderAgentWithCentralPermissions(src, dst, "testagent", agentsYml, makeCtx());

    const content = fs.readFileSync(dst, "utf8");
    expect(content).toContain("description: A test agent");
    expect(content).toContain("permission:");
    expect(content).toContain("  edit: ask");
    expect(content).not.toContain("\r");
  });

  it("strips existing permission block", () => {
    const src = path.join(tmpDir, "testagent.md");
    const dst = path.join(tmpDir, "testagent-out.md");
    const agentsYml = path.join(tmpDir, "agents.yml");

    fs.writeFileSync(
      src,
      [
        "---",
        "name: testagent",
        "description: A test agent",
        "permission:",
        "  edit: deny",
        "---",
        "# Content",
      ].join("\n") + "\n",
    );
    fs.writeFileSync(
      agentsYml,
      ["agents:", "  testagent:", "    edit: ask"].join("\n") + "\n",
    );

    renderAgentWithCentralPermissions(src, dst, "testagent", agentsYml, makeCtx());

    const content = fs.readFileSync(dst, "utf8");
    expect(content).toContain("  edit: ask");
    expect(content).not.toContain("  edit: deny");
  });

  it("inserts after description line", () => {
    const src = path.join(tmpDir, "testagent.md");
    const dst = path.join(tmpDir, "testagent-out.md");
    const agentsYml = path.join(tmpDir, "agents.yml");

    fs.writeFileSync(
      src,
      [
        "---",
        "name: testagent",
        "description: A test agent",
        "---",
        "# Content",
      ].join("\n") + "\n",
    );
    fs.writeFileSync(
      agentsYml,
      ["agents:", "  testagent:", "    edit: ask"].join("\n") + "\n",
    );

    renderAgentWithCentralPermissions(src, dst, "testagent", agentsYml, makeCtx());

    const lines = fs.readFileSync(dst, "utf8").split("\n");
    const descIdx = lines.findIndex((line) =>
      line.startsWith("description:"),
    );
    expect(lines[descIdx + 1]).toBe("permission:");
    expect(lines[descIdx + 2]).toBe("  edit: ask");
  });

  it("dry-run logs without writing", () => {
    const src = path.join(tmpDir, "testagent.md");
    const dst = path.join(tmpDir, "testagent-out.md");
    const agentsYml = path.join(tmpDir, "agents.yml");

    fs.writeFileSync(
      src,
      ["---", "name: testagent", "description: A test agent", "---", "# Content"].join(
        "\n",
      ) + "\n",
    );
    fs.writeFileSync(
      agentsYml,
      ["agents:", "  testagent:", "    edit: ask"].join("\n") + "\n",
    );

    const ctx = makeCtx(true);
    renderAgentWithCentralPermissions(src, dst, "testagent", agentsYml, ctx);

    expect(fs.pathExistsSync(dst)).toBe(false);
  });
});
