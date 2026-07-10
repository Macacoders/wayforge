import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { ManifestContext } from "../../src/lib/context.js";
import { trackInstalledProject } from "../../src/lib/tracking.js";

// Use workspace-local dir for repo/root so isTempPath won't skip them.
// Only the temp-path-skip test intentionally uses os.tmpdir().
const BASE = path.resolve(__dirname, "..", "..", ".test-tracking");

function makeCtx(
  overrides: { dryRun?: boolean; force?: boolean; noTrack?: boolean; projectId?: string } = {},
): ManifestContext {
  const ctx = new ManifestContext(
    overrides.dryRun ?? false,
    overrides.force ?? false,
    overrides.noTrack ?? false,
  );
  if (overrides.projectId) {
    ctx.projectId = overrides.projectId;
  }
  return ctx;
}

describe("trackInstalledProject", () => {
  let testDir: string;
  let rootDir: string;
  let repoDir: string;

  beforeAll(() => {
    fs.mkdirpSync(BASE);
  });

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(BASE, "test-"));
    rootDir = path.join(testDir, "root");
    repoDir = path.join(testDir, "project");
    fs.mkdirpSync(rootDir);
    fs.mkdirpSync(repoDir);
  });

  afterEach(() => {
    fs.removeSync(testDir);
  });

  // Ensure the BASE directory exists (created by mkdtempSync above, but
  // safety-clean won't remove it since we remove individual test dirs).
  afterAll(() => {
    if (fs.pathExistsSync(BASE)) {
      fs.removeSync(BASE);
    }
  });

  it("fresh install creates entry with projectId", () => {
    const ctx = makeCtx({ projectId: "11111111-1111-4111-8111-111111111111" });
    trackInstalledProject(repoDir, rootDir, "0.2.0", "develop", ctx);

    const trackingFile = path.join(rootDir, "installed-projects.json");
    expect(fs.pathExistsSync(trackingFile)).toBe(true);

    const data = JSON.parse(fs.readFileSync(trackingFile, "utf8"));
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].projectId).toBe("11111111-1111-4111-8111-111111111111");
    expect(data.projects[0].name).toBe("project");
    expect(data.projects[0].aiConfigVersion).toBe("0.2.0");
    expect(data.projects[0].installRef).toBe("develop");
    expect(data.projects[0].lastUpdated).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("rename (same projectId, new path) updates entry in-place", () => {
    const projectId = "22222222-2222-4222-8222-222222222222";
    const ctx1 = makeCtx({ projectId });
    trackInstalledProject(repoDir, rootDir, "0.2.0", "v1", ctx1);

    // Simulate rename: create a new dir outside os.tmpdir() as the new location
    const newRepoDir = path.join(testDir, "renamed-project");
    fs.mkdirpSync(newRepoDir);
    const ctx2 = makeCtx({ projectId });
    trackInstalledProject(newRepoDir, rootDir, "0.3.0", "v2", ctx2);

    const trackingFile = path.join(rootDir, "installed-projects.json");
    const data = JSON.parse(fs.readFileSync(trackingFile, "utf8"));

    // Should still be exactly 1 entry (updated, not duplicated)
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].projectId).toBe(projectId);
    expect(data.projects[0].name).toBe("renamed-project");
    expect(data.projects[0].path).toBe(fs.realpathSync(newRepoDir));
    expect(data.projects[0].aiConfigVersion).toBe("0.3.0");
    expect(data.projects[0].installRef).toBe("v2");
  });

  it("same path reinstall is idempotent (no duplicate)", () => {
    const ctx = makeCtx({ projectId: "33333333-3333-4333-8333-333333333333" });
    trackInstalledProject(repoDir, rootDir, "0.2.0", "develop", ctx);
    trackInstalledProject(repoDir, rootDir, "0.3.0", "v2", ctx);

    const trackingFile = path.join(rootDir, "installed-projects.json");
    const data = JSON.parse(fs.readFileSync(trackingFile, "utf8"));
    expect(data.projects).toHaveLength(1);
  });

  it("upgrade from old format (no projectId) appends new entry", () => {
    // Create a tracking file with old-format entries (no projectId)
    const oldData = {
      schemaVersion: "1.0.0",
      projects: [
        {
          name: "old-project",
          path: "/some/old/path",
          lastUpdated: "2025-01-01T12:00:00+01:00",
          aiConfigVersion: "0.1.0",
          installRef: "develop",
        },
      ],
    };
    fs.writeFileSync(
      path.join(rootDir, "installed-projects.json"),
      `${JSON.stringify(oldData, null, 2)}\n`,
    );

    const ctx = makeCtx({ projectId: "44444444-4444-4444-8444-444444444444" });
    trackInstalledProject(repoDir, rootDir, "0.2.0", "develop", ctx);

    const trackingFile = path.join(rootDir, "installed-projects.json");
    const data = JSON.parse(fs.readFileSync(trackingFile, "utf8"));
    // Old entry stays, new entry appended (no projectId match in old entries)
    expect(data.projects).toHaveLength(2);
    expect(data.projects[0].projectId).toBeUndefined();
    expect(data.projects[1].projectId).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("--dry-run skips tracking", () => {
    const ctx = makeCtx({ dryRun: true, projectId: "55555555-5555-4555-8555-555555555555" });
    trackInstalledProject(repoDir, rootDir, "0.2.0", "develop", ctx);

    const trackingFile = path.join(rootDir, "installed-projects.json");
    expect(fs.pathExistsSync(trackingFile)).toBe(false);
  });

  it("--force skips tracking", () => {
    const ctx = makeCtx({ force: true, projectId: "66666666-6666-4666-8666-666666666666" });
    trackInstalledProject(repoDir, rootDir, "0.2.0", "develop", ctx);

    const trackingFile = path.join(rootDir, "installed-projects.json");
    expect(fs.pathExistsSync(trackingFile)).toBe(false);
  });

  it("--no-track skips tracking", () => {
    const ctx = makeCtx({ noTrack: true, projectId: "77777777-7777-4777-8777-777777777777" });
    trackInstalledProject(repoDir, rootDir, "0.2.0", "develop", ctx);

    const trackingFile = path.join(rootDir, "installed-projects.json");
    expect(fs.pathExistsSync(trackingFile)).toBe(false);
  });

  it("temp-path skip works", () => {
    // On Windows, os.tmpdir() is under process.env.TEMP which isTempPath matches.
    // We need a path that exists (for realpathSync) and is recognized as temp.
    const tempBase = os.tmpdir();
    const tempProj = fs.mkdtempSync(path.join(tempBase, "ai-config-temp-skip-"));

    try {
      const ctx = makeCtx({ projectId: "88888888-8888-4888-8888-888888888888" });
      trackInstalledProject(tempProj, rootDir, "0.2.0", "develop", ctx);

      const trackingFile = path.join(rootDir, "installed-projects.json");
      expect(fs.pathExistsSync(trackingFile)).toBe(false);
    } finally {
      fs.removeSync(tempProj);
    }
  });

  it("new project without projectId gets empty-string entry", () => {
    const ctx = makeCtx({});
    trackInstalledProject(repoDir, rootDir, "0.2.0", "develop", ctx);

    const trackingFile = path.join(rootDir, "installed-projects.json");
    const data = JSON.parse(fs.readFileSync(trackingFile, "utf8"));
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].projectId).toBe("");
  });

  it("two different projects are tracked separately", () => {
    const ctx1 = makeCtx({ projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    trackInstalledProject(repoDir, rootDir, "0.2.0", "develop", ctx1);

    const otherRepo = path.join(testDir, "other-project");
    fs.mkdirpSync(otherRepo);
    const ctx2 = makeCtx({ projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    trackInstalledProject(otherRepo, rootDir, "0.2.0", "develop", ctx2);

    const trackingFile = path.join(rootDir, "installed-projects.json");
    const data = JSON.parse(fs.readFileSync(trackingFile, "utf8"));
    expect(data.projects).toHaveLength(2);
    expect(data.projects[0].projectId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(data.projects[1].projectId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
});
