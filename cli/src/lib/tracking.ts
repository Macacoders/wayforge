import { execFileSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import type { ManifestContext } from "./context.js";

export function isTempPath(absolutePath: string): boolean {
  if (absolutePath === "/tmp" || absolutePath.startsWith("/tmp/")) {
    return true;
  }
  if (absolutePath === "/var/tmp" || absolutePath.startsWith("/var/tmp/")) {
    return true;
  }

  const tmpdir = process.env.TMPDIR;
  if (tmpdir && (absolutePath === tmpdir || absolutePath.startsWith(`${tmpdir}/`))) {
    return true;
  }

  if (process.platform === "win32") {
    const temp = process.env.TEMP;
    if (temp) {
      try {
        const canonicalTemp = fs.realpathSync(temp);
        if (
          absolutePath === canonicalTemp ||
          absolutePath.startsWith(`${canonicalTemp}\\`)
        ) {
          return true;
        }
      } catch {
        // ignore
      }
    }
  }

  return false;
}

export function trackInstalledProject(
  repoPath: string,
  rootDir: string,
  version: string,
  installRef: string,
  ctx: ManifestContext,
): void {
  if (ctx.dryRun || ctx.force || ctx.noTrack) {
    return;
  }

  let canonical = fs.realpathSync(repoPath);

  if (isWsl()) {
    try {
      canonical = execFileSync("wslpath", ["-w", canonical], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
    } catch {
      // keep canonical as-is
    }
  }

  if (isTempPath(canonical)) {
    ctx.log(`skip tracking temporary/debug path: ${canonical}`);
    return;
  }

  const name = path.basename(canonical);
  const timestamp = formatBerlinTimestamp(new Date());
  const installRef_ = installRef || "develop";
  const trackingFile = path.join(rootDir, "installed-projects.json");

  const entry = {
    name,
    path: canonical, // JSON.stringify auto-escapes backslashes; no manual escaping needed
    lastUpdated: timestamp,
    aiConfigVersion: version,
    installRef: installRef_,
  };

  if (!fs.pathExistsSync(trackingFile)) {
    const obj = {
      schemaVersion: "1.0.0",
      projects: [entry],
    };
    fs.writeFileSync(trackingFile, `${JSON.stringify(obj, null, 2)}\n`);
    ctx.log(`tracked installed project: ${canonical}`);
    return;
  }

  let obj: { schemaVersion: string; projects: Array<{ path: string }> };
  try {
    obj = JSON.parse(fs.readFileSync(trackingFile, "utf8"));
  } catch {
    // Corrupt JSON (e.g. from bash installer with unescaped WSL paths).
    // Treat as missing — recreate from scratch.
    obj = { schemaVersion: "1.0.0", projects: [] };
  }

  if (obj.projects.some((p) => p.path === entry.path)) {
    return;
  }

  obj.projects.push(entry);
  fs.writeFileSync(trackingFile, `${JSON.stringify(obj, null, 2)}\n`);
  ctx.log(`tracked installed project: ${canonical}`);
}

export function removeTrackingEntry(
  repoPath: string,
  rootDir: string,
  ctx: ManifestContext,
): void {
  const trackingFile = path.join(rootDir, "installed-projects.json");
  if (!fs.pathExistsSync(trackingFile)) {
    return;
  }

  const canonical = fs.realpathSync(repoPath);

  const obj = JSON.parse(fs.readFileSync(trackingFile, "utf8")) as {
    projects: Array<{ path: string }>;
  };

  const matchIndex = obj.projects.findIndex((p) => p.path === canonical);
  if (matchIndex === -1) {
    return;
  }

  if (obj.projects.length === 1) {
    if (ctx.dryRun) {
      ctx.log(
        `DRY-RUN: would remove tracking file (last project uninstalled): ${trackingFile}`,
      );
      return;
    }
    fs.unlinkSync(trackingFile);
    ctx.log(
      `removed tracking file (last project uninstalled): ${trackingFile}`,
    );
    return;
  }

  if (ctx.dryRun) {
    ctx.log(`DRY-RUN: would remove tracking entry: ${canonical}`);
    return;
  }

  obj.projects.splice(matchIndex, 1);
  fs.writeFileSync(trackingFile, `${JSON.stringify(obj, null, 2)}\n`);
  ctx.log(`removed tracking entry: ${canonical}`);
}

function isWsl(): boolean {
  // ponytail: resolved rung 6 — /proc fallback never needed in practice; WSL_DISTRO_NAME alone suffices
  return !!process.env.WSL_DISTRO_NAME;
}
function formatBerlinTimestamp(date: Date): string {
  // ponytail: resolved rung 3 — Intl.DateTimeFormat replaces manual TZ offset arithmetic
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const base = fmt.format(date).replace(" ", "T");

  const offsetFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "longOffset",
  });
  const offset = offsetFmt
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")!
    .value.slice(3); // strip "GMT" prefix, leaving "+02:00"

  return `${base}${offset}`;
}
