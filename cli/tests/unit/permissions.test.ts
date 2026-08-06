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

function makeCtx(dryRun = false): ManifestContext {
  return new ManifestContext(dryRun, false, false);
}

describe("renderAgentPermissionBlock", () => {
  it("extracts planner permissions", () => {
    const block = renderAgentPermissionBlock("planner", permissionsFile);

    expect(block.startsWith("permission:")).toBe(true);
    expect(block).toContain("edit: ask");
    expect(block).toContain('bash:');
    expect(block).toContain('"*": ask');
    expect(block).not.toContain("agents:");
  });

  it("extracts quickcode permissions", () => {
    const block = renderAgentPermissionBlock("quickcode", permissionsFile);

    expect(block.startsWith("permission:")).toBe(true);
    expect(block).toContain("edit: allow");
    expect(block).toContain('"npm test*": allow');
  });

  it("throws for unknown agent", () => {
    expect(() =>
      renderAgentPermissionBlock("nonexistent-agent", permissionsFile),
    ).toThrow();
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
