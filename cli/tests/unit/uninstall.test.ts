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
    testDir = fs.mkdtempSync(path.join(BASE, "uninstall-"));
    stateDir = path.join(testDir, "home");
    repoDir = path.join(testDir, "repo");
    fs.mkdirpSync(stateDir);
    fs.mkdirpSync(path.join(stateDir, ".ai-config"));
    fs.mkdirpSync(repoDir);
    trackingFile = path.join(stateDir, ".ai-config", "installed-projects.json");
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
    fs.writeFileSync(path.join(repoDir, ".ai-config-managed"), manifest);
    fs.writeFileSync(path.join(repoDir, "managed.txt"), "hello");

    const data = {
      schemaVersion: "1.0.0",
      projects: [
        {
          projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "repo",
          path: fs.realpathSync(repoDir),
          lastUpdated: "2025-01-01T12:00:00+01:00",
          aiConfigVersion: "0.2.0",
          installRef: "develop",
        },
        {
          projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "other",
          path: "/some/other/path",
          lastUpdated: "2025-01-01T12:00:00+01:00",
          aiConfigVersion: "0.2.0",
          installRef: "develop",
        },
      ],
    };
    fs.writeFileSync(trackingFile, `${JSON.stringify(data, null, 2)}\n`);

    uninstallCommand({ repo: repoDir, dryRun: false });

    // Managed file and manifest should be removed.
    expect(fs.pathExistsSync(path.join(repoDir, "managed.txt"))).toBe(false);
    expect(fs.pathExistsSync(path.join(repoDir, ".ai-config-managed"))).toBe(false);

    // Matching tracking entry should be removed from the state dir; the other stays.
    const after = JSON.parse(fs.readFileSync(trackingFile, "utf8"));
    expect(after.projects).toHaveLength(1);
    expect(after.projects[0].path).toBe("/some/other/path");
  });

  it("is a no-op when the tracking file is missing", () => {
    const manifest = "managed_paths:\n  - managed.txt\n";
    fs.writeFileSync(path.join(repoDir, ".ai-config-managed"), manifest);
    fs.writeFileSync(path.join(repoDir, "managed.txt"), "hello");

    expect(() => uninstallCommand({ repo: repoDir, dryRun: false })).not.toThrow();

    expect(fs.pathExistsSync(path.join(repoDir, "managed.txt"))).toBe(false);
    expect(fs.pathExistsSync(trackingFile)).toBe(false);
  });
});
