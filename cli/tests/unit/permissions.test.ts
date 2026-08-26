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
    expect(block).toContain("edit: ask");
    expect(block).toContain("bash:");
    expect(block).toContain('"*": allow');
    expect(block).not.toContain("agents:");
    expect(block.indexOf('"*": allow')).toBeLessThan(
      block.indexOf('"sudo*": deny'),
    );
    expect(block).toContain('"sudo*": deny');
    expect(block).toContain('"rm -rf*": deny');
    expect(block).toContain('"git push --force*": deny');
    expect(block).toContain('"git push -f*": deny');
    expect(block).toContain("external_directory:");
    expect(block).toContain('"*": deny');
    expect(block).toContain('"/tmp/**": allow');
  });

  it("extracts quickcode permissions", () => {
    const block = renderAgentPermissionBlock("quickcode", permissionsFile);

    expect(block.startsWith("permission:")).toBe(true);
    expect(block).toContain("read: allow");
    expect(block).toContain("edit: allow");
    expect(block).toContain("bash:");
    expect(block).toContain('"*": allow');
    expect(block.indexOf('"*": allow')).toBeLessThan(
      block.indexOf('"sudo*": deny'),
    );
    expect(block).toContain('"sudo*": deny');
    expect(block).toContain('"rm -rf*": deny');
    expect(block).toContain('"git push --force*": deny');
    expect(block).toContain('"git push -f*": deny');
    expect(block).toContain("external_directory:");
    expect(block).toContain('"*": deny');
    expect(block).toContain('"/tmp/**": allow');
  });

  it("renders the correct edit permission for each agent", () => {
    expect(renderAgentPermissionBlock("code", permissionsFile)).toContain(
      "edit: allow",
    );
    expect(renderAgentPermissionBlock("quickcode", permissionsFile)).toContain(
      "edit: allow",
    );
    expect(renderAgentPermissionBlock("planner", permissionsFile)).toContain(
      "edit: ask",
    );
    expect(renderAgentPermissionBlock("delivery", permissionsFile)).toContain(
      "edit: ask",
    );
    expect(renderAgentPermissionBlock("research", permissionsFile)).toContain(
      "edit: ask",
    );
    expect(renderAgentPermissionBlock("test", permissionsFile)).toContain(
      "edit: ask",
    );
    expect(renderAgentPermissionBlock("architect", permissionsFile)).toContain(
      "edit: deny",
    );
    expect(
      renderAgentPermissionBlock("taskanalyst", permissionsFile),
    ).toContain("edit: deny");
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

  it('starts every bash map with the "*": allow catch-all', () => {
    for (const agent of allAgents) {
      const lines = renderAgentPermissionBlock(agent, permissionsFile).split(
        "\n",
      );
      const bashIdx = lines.findIndex((line) => line.trim() === "bash:");
      expect(bashIdx).toBeGreaterThan(-1);
      expect(lines[bashIdx + 1].trim()).toBe('"*": allow');
    }
  });

  it("renders the bash deny-list in every agent", () => {
    for (const agent of allAgents) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      expect(block).toContain('"sudo*": deny');
      expect(block).toContain('"rm -rf*": deny');
      expect(block).toContain('"git push --force*": deny');
      expect(block).toContain('"git push -f*": deny');
    }
  });

  it("places the bash catch-all before the deny-list entries", () => {
    for (const agent of allAgents) {
      const block = renderAgentPermissionBlock(agent, permissionsFile);
      const catchAllIdx = block.indexOf('"*": allow');
      expect(catchAllIdx).toBeGreaterThan(-1);
      expect(catchAllIdx).toBeLessThan(block.indexOf('"sudo*": deny'));
      expect(catchAllIdx).toBeLessThan(block.indexOf('"rm -rf*": deny'));
      expect(catchAllIdx).toBeLessThan(
        block.indexOf('"git push --force*": deny'),
      );
      expect(catchAllIdx).toBeLessThan(block.indexOf('"git push -f*": deny'));
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
      expect(block).toContain("external_directory:");
      expect(block).toContain('"*": deny');
      expect(block).toContain('"/tmp/**": allow');
    }
  });
});

describe("renderAgentWithCentralPermissions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-config-perm-test-"));
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
