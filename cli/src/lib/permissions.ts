import fs from "fs-extra";
import path from "path";
import type { ManifestContext } from "./context.js";
import { writeFile } from "./files.js";
import { isManagedFile, syncManagedTree } from "./manifest.js";

export function renderAgentPermissionBlock(
  agentName: string,
  permissionsFile: string,
): string {
  const content = fs.readFileSync(permissionsFile, "utf8");
  const lines = content.split("\n");

  let inAgents = false;
  let agentsIndent = 0;
  let capturing = false;
  let targetIndent = 0;
  const output: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");

    if (!inAgents) {
      const trimmed = line.trim();
      if (trimmed === "agents:") {
        inAgents = true;
        agentsIndent = (line.length - line.trimStart().length);
      }
      continue;
    }

    if (line.trim() === "") {
      continue;
    }

    const indent = (line.length - line.trimStart().length);

    if (indent <= agentsIndent) {
      inAgents = false;
      continue;
    }

    if (indent === agentsIndent + 2) {
      const agentMatch = matchAgentKey(line.slice(indent));
      if (agentMatch) {
        if (agentMatch === agentName) {
          capturing = true;
          targetIndent = indent;
          output.push("permission:");
        } else if (capturing) {
          break;
        } else {
          capturing = false;
        }
        continue;
      }
    }

    if (!capturing) {
      continue;
    }

    if (indent <= targetIndent) {
      break;
    }

    if (line.trim().startsWith("#")) {
      continue;
    }

    output.push(line.slice(targetIndent));
  }

  if (output.length === 0) {
    throw new Error(
      `missing permissions in ${permissionsFile} for agent '${agentName}'`,
    );
  }

  return output.join("\n");
}

function matchAgentKey(trimmed: string): string | null {
  // Match /^([^:#]+):[[:space:]]*$/ from awk
  const match = trimmed.match(/^([^:#]+):\s*$/);
  if (!match) {
    return null;
  }
  return match[1].trim();
}

export function renderAgentWithCentralPermissions(
  srcFile: string,
  dstFile: string,
  agentName: string,
  permissionsFile: string,
  ctx: ManifestContext,
): void {
  let permissionBlock: string;
  try {
    permissionBlock = renderAgentPermissionBlock(agentName, permissionsFile);
  } catch (err) {
    ctx.log(
      `error: missing permissions in ${permissionsFile} for agent '${agentName}'`,
    );
    process.exit(1);
  }

  if (permissionBlock === "") {
    ctx.log(
      `error: missing permissions in ${permissionsFile} for agent '${agentName}'`,
    );
    process.exit(1);
  }

  if (ctx.dryRun) {
    ctx.log(`DRY-RUN: would render centralized permissions: ${dstFile}`);
    return;
  }

  const content = fs.readFileSync(srcFile, "utf8");
  const lines = content.split("\n");
  const output: string[] = [];

  let inFrontmatter = false;
  let frontmatterDone = false;
  let skippingPermission = false;
  let permissionIndent = -1;
  let inserted = false;

  for (const rawLine of lines) {
    const line = rawLine; // preserve original line endings handled by writeFile

    if (line === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        output.push(line);
        continue;
      }

      if (inFrontmatter && !frontmatterDone) {
        if (!inserted) {
          inserted = insertPermissionBlock(output, permissionBlock, 0);
        }
        frontmatterDone = true;
        inFrontmatter = false;
        output.push(line);
        continue;
      }
    }

    if (!inFrontmatter || frontmatterDone) {
      output.push(line);
      continue;
    }

    const indent = (line.length - line.trimStart().length);
    const trimmed = line.slice(indent).trim();

    if (skippingPermission) {
      if (trimmed === "" || indent > permissionIndent) {
        continue;
      }
      skippingPermission = false;
    }

    if (trimmed === "permission:") {
      skippingPermission = true;
      permissionIndent = indent;
      continue;
    }

    output.push(line);

    if (!inserted && trimmed.startsWith("description:")) {
      inserted = insertPermissionBlock(output, permissionBlock, indent);
    }
  }

  writeFile(dstFile, output.join("\n"), ctx);
}

function insertPermissionBlock(
  output: string[],
  permissionBlock: string,
  indent: number,
): boolean {
  const prefix = " ".repeat(indent);
  const blockLines = permissionBlock.split("\n");
  for (const bl of blockLines) {
    output.push(prefix + bl);
  }
  return true;
}

export function syncAgentsTreeWithPermissions(
  srcDir: string,
  dstDir: string,
  permissionsFile: string,
  ctx: ManifestContext,
): void {
  const result = syncManagedTree(srcDir, dstDir, ctx);
  if (result.action !== "copied") {
    return;
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const agentFile = entry.name;
    const agentName = agentFile.slice(0, -3);
    const dstAgent = path.join(dstDir, agentFile);

    if (!isManagedFile(dstAgent)) {
      ctx.log(
        `skip conflict with unmanaged path (preserving local content): ${dstAgent}`,
      );
      continue;
    }

    renderAgentWithCentralPermissions(
      path.join(srcDir, agentFile),
      dstAgent,
      agentName,
      permissionsFile,
      ctx,
    );
  }
}
