import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { uninstallCommand } from "../../src/commands/uninstall.js";

// Use workspace-local dir so temp paths aren't filtered by any temp-path checks.
const BASE = path.resolve(__dirname, "..", "..", ".test-uninstall");

describe("uninstallCommand", () => {
  let testDir: string;
  let stateDir: string;
  let repoDir: string;
  let trackingFile: string;

  beforeAll(() => {
    fs.mkdirpSync(BASE);
  });

  beforeEach(() => {
    vi.stubEnv("WSL_DISTRO_NAME", "");
    vi.stubEnv("LOCALAPPDATA", "");
    testDir = fs.mkdtempSync(path.join(BASE, "uninstall-"));
    stateDir = path.join(testDir, "home");
    repoDir = path.join(testDir, "repo");
    fs.mkdirpSync(stateDir);
    fs.mkdirpSync(path.join(stateDir, ".wayforge"));
    fs.mkdirpSync(repoDir);
    trackingFile = path.join(stateDir, ".wayforge", "installed-projects.json");
    vi.spyOn(os, "homedir").mockReturnValue(stateDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (testDir && fs.pathExistsSync(testDir)) {
      fs.removeSync(testDir);
    }
  });

  afterAll(() => {
    if (fs.pathExistsSync(BASE)) {
      fs.removeSync(BASE);
    }
  });

  it("removes tracking entry from state dir when uninstalling a tracked project", () => {
    const manifest = "managed_paths:\n  - managed.txt\n";
    fs.writeFileSync(path.join(repoDir, ".wayforge-managed"), manifest);
    fs.writeFileSync(path.join(repoDir, "managed.txt"), "hello");

    const data = {
      schemaVersion: "1.0.0",
      projects: [
        {
          projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "repo",
          path: fs.realpathSync(repoDir),
          lastUpdated: "2025-01-01T12:00:00+01:00",
          wayforgeVersion: "0.2.0",
          installRef: "develop",
        },
        {
          projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "other",
          path: "/some/other/path",
          lastUpdated: "2025-01-01T12:00:00+01:00",
          wayforgeVersion: "0.2.0",
          installRef: "develop",
        },
      ],
    };
    fs.writeFileSync(trackingFile, `${JSON.stringify(data, null, 2)}\n`);

    uninstallCommand({ repo: repoDir, dryRun: false });

    // Managed file and manifest should be removed.
    expect(fs.pathExistsSync(path.join(repoDir, "managed.txt"))).toBe(false);
    expect(fs.pathExistsSync(path.join(repoDir, ".wayforge-managed"))).toBe(false);

    // Matching tracking entry should be removed from the state dir; the other stays.
    const after = JSON.parse(fs.readFileSync(trackingFile, "utf8"));
    expect(after.projects).toHaveLength(1);
    expect(after.projects[0].path).toBe("/some/other/path");
  });

  it("removes pointer directories via rmdir when unlink fails with EPERM", () => {
    // A Windows junction is a directory reparse point; unlink refuses it with
    // EPERM, so uninstall must fall back to rmdir for pointer entries.
    const pointerPaths = [
      path.join(repoDir, ".opencode", "agents"),
      path.join(repoDir, ".kilo", "agents"),
    ];
    const manifest =
      "managed_paths:\n  - managed.txt\n  - .opencode/agents\n  - .kilo/agents\n";
    fs.writeFileSync(path.join(repoDir, ".wayforge-managed"), manifest);
    fs.writeFileSync(path.join(repoDir, "managed.txt"), "hello");
    for (const pointerPath of pointerPaths) {
      fs.mkdirpSync(pointerPath);
    }

    const realUnlinkSync = fs.unlinkSync.bind(fs);
    const unlinkedPaths: string[] = [];
    const rmdirPaths: string[] = [];
    vi.spyOn(fs, "unlinkSync").mockImplementation((target) => {
      const targetPath = String(target);
      if (pointerPaths.includes(targetPath)) {
        throw Object.assign(
          new Error(`EPERM: operation not permitted, unlink '${targetPath}'`),
          { code: "EPERM" },
        );
      }
      realUnlinkSync(target);
      unlinkedPaths.push(targetPath);
    });
    const realRmdirSync = fs.rmdirSync.bind(fs);
    vi.spyOn(fs, "rmdirSync").mockImplementation((target) => {
      rmdirPaths.push(String(target));
      realRmdirSync(target);
    });

    uninstallCommand({ repo: repoDir, dryRun: false });

    for (const pointerPath of pointerPaths) {
      expect(rmdirPaths).toContain(pointerPath);
      expect(fs.pathExistsSync(pointerPath)).toBe(false);
    }
    expect(unlinkedPaths).toContain(path.join(repoDir, "managed.txt"));
    expect(unlinkedPaths).toContain(path.join(repoDir, ".wayforge-managed"));
    expect(fs.pathExistsSync(path.join(repoDir, ".wayforge-managed"))).toBe(
      false,
    );
  });

  it("does not prune directories outside the repo for a relative --repo", () => {
    // `--repo` used to be left unresolved, so the empty-directory walk compared
    // a relative path against an absolute one and climbed past the repository.
    const outer = path.join(testDir, "outer");
    const nestedRepo = path.join(outer, "repo");
    fs.mkdirpSync(path.join(nestedRepo, ".agents", "agents"));
    fs.writeFileSync(
      path.join(nestedRepo, ".agents", "agents", "planner.md"),
      "# planner",
    );
    fs.writeFileSync(
      path.join(nestedRepo, ".wayforge-managed"),
      "managed_paths:\n  - .agents/agents/planner.md\n",
    );

    const previousCwd = process.cwd();
    try {
      process.chdir(testDir);
      uninstallCommand({ repo: "outer/repo", dryRun: false });
    } finally {
      process.chdir(previousCwd);
    }

    expect(fs.pathExistsSync(outer)).toBe(true);
    expect(fs.pathExistsSync(nestedRepo)).toBe(true);
    expect(fs.pathExistsSync(path.join(nestedRepo, ".agents"))).toBe(false);
  });

  it("is a no-op when the tracking file is missing", () => {
    const manifest = "managed_paths:\n  - managed.txt\n";
    fs.writeFileSync(path.join(repoDir, ".wayforge-managed"), manifest);
    fs.writeFileSync(path.join(repoDir, "managed.txt"), "hello");

    expect(() => uninstallCommand({ repo: repoDir, dryRun: false })).not.toThrow();

    expect(fs.pathExistsSync(path.join(repoDir, "managed.txt"))).toBe(false);
    expect(fs.pathExistsSync(trackingFile)).toBe(false);
  });
});
