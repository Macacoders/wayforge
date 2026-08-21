import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll, vi } from "vitest";
import fs from "fs-extra";
import path from "path";
import { uninstallCommand } from "../../src/commands/uninstall.js";

// Use workspace-local dir so temp paths aren't filtered by any temp-path checks.
const BASE = path.resolve(__dirname, "..", "..", ".test-uninstall");

describe("uninstallCommand", () => {
  let testDir: string;
  let sourceDir: string;
  let repoDir: string;

  beforeAll(() => {
    fs.mkdirpSync(BASE);
  });

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(BASE, "uninstall-"));
    sourceDir = path.join(testDir, "source");
    repoDir = path.join(testDir, "repo");
    fs.mkdirpSync(sourceDir);
    fs.mkdirpSync(repoDir);
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

  it("warns and continues when source tree is missing, skipping tracking removal", () => {
    // sourceDir has NO base/ subdir -> triggers the warn branch.
    // Set up a repo with a .ai-config-managed manifest and one managed file.
    const manifest = "managed_paths:\n  - managed.txt\n";
    fs.writeFileSync(path.join(repoDir, ".ai-config-managed"), manifest);
    fs.writeFileSync(path.join(repoDir, "managed.txt"), "hello");

    vi.stubEnv("AI_CONFIG_HOME", sourceDir);
    const logSpy = vi.spyOn(console, "log");

    expect(() => uninstallCommand({ repo: repoDir, dryRun: false })).not.toThrow();

    // Managed file and manifest should be removed.
    expect(fs.pathExistsSync(path.join(repoDir, "managed.txt"))).toBe(false);
    expect(fs.pathExistsSync(path.join(repoDir, ".ai-config-managed"))).toBe(false);

    // Warning about skipping tracking-entry removal must have been logged.
    const warningCalls = logSpy.mock.calls.filter((args) =>
      String(args[0] ?? "").includes("skipping tracking-entry removal"),
    );
    expect(warningCalls.length).toBeGreaterThan(0);

    // removeTrackingEntry must NOT have been called -> no installed-projects.json created.
    expect(
      fs.pathExistsSync(path.join(sourceDir, "installed-projects.json")),
    ).toBe(false);
  });
});
