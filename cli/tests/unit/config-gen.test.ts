import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import type { MockInstance } from "vitest";
import { ManifestContext } from "../../src/lib/context.js";
import {
  buildAgentBlockJson,
  buildEnabledProvidersJson,
  buildProviderBlockJson,
  generateOpenCodeJsonc,
  syncGeneratedOpenCodeJsonc,
  type GenerateOptions,
} from "../../src/lib/config-gen.js";
import {
  parseProviders,
  resolveDefaultModels,
  validateFreeTierRuntime,
  validateModelOverride,
} from "../../src/lib/providers.js";
import type { Provider, Runtime } from "../../src/types.js";

const sourceDir = path.resolve(__dirname, '../../..');

function makeCtx(dryRun = false, force = false): ManifestContext {
  return new ManifestContext(dryRun, force, false);
}

function makeOpts(
  runtime: Runtime,
  selected: Provider[],
  overrides: Partial<
    Omit<GenerateOptions, "runtime" | "selected" | "sourceDir">
  > = {},
): GenerateOptions {
  return {
    runtime,
    selected,
    sourceDir,
    ...overrides,
  };
}

describe("parseProviders", () => {
  it("parses a single provider", () => {
    expect(parseProviders("openai")).toEqual(["openai"]);
  });

  it("parses comma-separated providers and preserves order", () => {
    expect(parseProviders("openai,github-copilot,laberit")).toEqual([
      "openai",
      "github-copilot",
      "laberit",
    ]);
  });

  it("trims whitespace around tokens", () => {
    expect(parseProviders(" openai , github-copilot ")).toEqual([
      "openai",
      "github-copilot",
    ]);
  });

  it("deduplicates providers keeping first occurrence", () => {
    expect(parseProviders("openai,github-copilot,openai")).toEqual([
      "openai",
      "github-copilot",
    ]);
  });

  it("exits on unknown provider", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw new Error("process.exit");
      });
    expect(() => parseProviders("openai,unknown")).toThrow("process.exit");
    exitSpy.mockRestore();
  });
});

describe("resolveDefaultModels", () => {
  it("returns openai defaults as fallback", () => {
    expect(resolveDefaultModels(["openai"])).toEqual({
      model: "openai/gpt-5.5",
      smallModel: "openai/gpt-5.4-mini",
    });
  });

  it("returns openai+laberit fallback (openai defaults)", () => {
    expect(resolveDefaultModels(["openai", "laberit"])).toEqual({
      model: "openai/gpt-5.5",
      smallModel: "openai/gpt-5.4-mini",
    });
  });

  it("returns github-copilot only defaults", () => {
    expect(resolveDefaultModels(["github-copilot"])).toEqual({
      model: "github-copilot/gpt-5.4",
      smallModel: "github-copilot/gpt-5.3-codex",
    });
  });

  it("returns openai+github-copilot mixed defaults", () => {
    expect(resolveDefaultModels(["openai", "github-copilot"])).toEqual({
      model: "openai/gpt-5.5",
      smallModel: "github-copilot/gemini-3.5-flash",
    });
  });

  it("returns laberit only defaults", () => {
    expect(resolveDefaultModels(["laberit"])).toEqual({
      model: "laberit/laberit-ai-preview",
      smallModel: "laberit/laberit-ai",
    });
  });

  it("returns opencode-go only defaults", () => {
    expect(resolveDefaultModels(["opencode-go"])).toEqual({
      model: "opencode-go/deepseek-v4-pro",
      smallModel: "opencode-go/deepseek-v4-flash",
    });
  });

  it("returns empty strings for free-tier only", () => {
    expect(resolveDefaultModels(["free-tier"])).toEqual({
      model: "",
      smallModel: "",
    });
  });
});

describe("validateFreeTierRuntime", () => {
  it("allows free-tier with opencode runtime", () => {
    expect(() =>
      validateFreeTierRuntime(["free-tier"], "opencode"),
    ).not.toThrow();
  });

  it("exits when free-tier is used with kilocode runtime", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw new Error("process.exit");
      });
    expect(() => validateFreeTierRuntime(["free-tier"], "kilocode")).toThrow(
      "process.exit",
    );
    exitSpy.mockRestore();
  });
});

describe("validateModelOverride", () => {
  it("passes when override is undefined", () => {
    expect(() =>
      validateModelOverride(undefined, "--model", ["openai"]),
    ).not.toThrow();
  });

  it("passes for valid provider/model override", () => {
    expect(() =>
      validateModelOverride("openai/gpt-5.5", "--model", ["openai"]),
    ).not.toThrow();
  });

  it("exits when override lacks slash", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw new Error("process.exit");
      });
    expect(() =>
      validateModelOverride("openai-gpt-5.5", "--model", ["openai"]),
    ).toThrow("process.exit");
    exitSpy.mockRestore();
  });

  it("exits when override provider is not selected", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw new Error("process.exit");
      });
    expect(() =>
      validateModelOverride("github-copilot/gpt-5.4", "--model", ["openai"]),
    ).toThrow("process.exit");
    exitSpy.mockRestore();
  });
});

describe("buildEnabledProvidersJson", () => {
  it("includes opencode runtime provider first", () => {
    expect(buildEnabledProvidersJson(["openai"], "opencode")).toBe(
      '"opencode", "openai"',
    );
  });

  it("omits opencode runtime provider for kilocode", () => {
    expect(buildEnabledProvidersJson(["openai"], "kilocode")).toBe('"openai"');
  });

  it("skips free-tier", () => {
    expect(buildEnabledProvidersJson(["free-tier", "openai"], "opencode")).toBe(
      '"opencode", "openai"',
    );
  });
});

describe("buildProviderBlockJson", () => {
  it("reads opencode provider block for opencode runtime", () => {
    const block = buildProviderBlockJson(["free-tier"], "opencode", sourceDir);
    expect(block).toContain('"opencode":');
  });

  it("returns empty string for kilocode runtime with free-tier", () => {
    const block = buildProviderBlockJson(["free-tier"], "kilocode", sourceDir);
    expect(block).toBe("");
  });

  it("joins multiple provider fragments with comma-newline", () => {
    const block = buildProviderBlockJson(
      ["openai", "github-copilot"],
      "opencode",
      sourceDir,
    );
    expect(block).toContain('"opencode":');
    expect(block).toContain('"openai":');
    expect(block).toContain('"github-copilot":');
    // Bash joins fragments with ",\n"; each fragment preserves its indentation.
    // Boundary between fragments: "},\n    " (closing brace + comma + newline + indent)
    expect(block.match(/},\n    "/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildAgentBlockJson", () => {
  it("returns empty string for free-tier only", () => {
    expect(buildAgentBlockJson(["free-tier"], sourceDir)).toBe("");
  });

  it("selects openai-only agent block", () => {
    const block = buildAgentBlockJson(["openai"], sourceDir);
    expect(block).toContain('"planner":');
    expect(block).toContain('"model": "openai/gpt-5.5"');
  });

  it("selects mixed agent block for openai+github-copilot", () => {
    const block = buildAgentBlockJson(
      ["openai", "github-copilot"],
      sourceDir,
    );
    expect(block).toContain('"planner":');
  });

  it("selects github-copilot-only agent block", () => {
    const block = buildAgentBlockJson(["github-copilot"], sourceDir);
    expect(block).toContain('"planner":');
  });
});

describe("generateOpenCodeJsonc", () => {
  it("generates free-tier opencode config with empty models and no agent block", () => {
    const content = generateOpenCodeJsonc(
      makeOpts("opencode", ["free-tier"]),
    );
    expect(content).toContain('"enabled_providers": ["opencode"]');
    expect(content).toContain('"model": ""');
    expect(content).toContain('"small_model": ""');
    expect(content).toContain('"opencode": {');
    expect(content).not.toContain('"agent":');
    expect(content).toContain('"$schema": "https://opencode.ai/config.json"');
  });

  it("generates openai-only config", () => {
    const content = generateOpenCodeJsonc(makeOpts("opencode", ["openai"]));
    expect(content).toContain('"enabled_providers": ["opencode", "openai"]');
    expect(content).toContain('"model": "openai/gpt-5.5"');
    expect(content).toContain('"small_model": "openai/gpt-5.4-mini"');
    expect(content).toContain('"agent": {');
    expect(content).toContain('"model": "openai/gpt-5.5"');
  });

  it("generates github-copilot-only config", () => {
    const content = generateOpenCodeJsonc(
      makeOpts("opencode", ["github-copilot"]),
    );
    expect(content).toContain(
      '"enabled_providers": ["opencode", "github-copilot"]',
    );
    expect(content).toContain('"model": "github-copilot/gpt-5.4"');
    expect(content).toContain('"small_model": "github-copilot/gpt-5.3-codex"');
  });

  it("generates openai+github-copilot mixed config", () => {
    const content = generateOpenCodeJsonc(
      makeOpts("opencode", ["openai", "github-copilot"]),
    );
    expect(content).toContain(
      '"enabled_providers": ["opencode", "openai", "github-copilot"]',
    );
    expect(content).toContain('"model": "openai/gpt-5.5"');
    expect(content).toContain('"small_model": "github-copilot/gemini-3.5-flash"');
  });

  it("generates opencode-go-only config", () => {
    const content = generateOpenCodeJsonc(
      makeOpts("opencode", ["opencode-go"]),
    );
    expect(content).toContain(
      '"enabled_providers": ["opencode", "opencode-go"]',
    );
    expect(content).toContain('"model": "opencode-go/deepseek-v4-pro"');
  });

  it("uses kilocode schema for kilocode runtime", () => {
    const content = generateOpenCodeJsonc(makeOpts("kilocode", ["openai"]));
    expect(content).toContain('"$schema": "https://app.kilo.ai/config.json"');
    expect(content).toContain('"enabled_providers": ["openai"]');
  });

  it("applies model overrides", () => {
    const content = generateOpenCodeJsonc(
      makeOpts("opencode", ["openai"], {
        modelOverride: "openai/gpt-5.4",
        smallModelOverride: "openai/gpt-5.4-mini",
      }),
    );
    expect(content).toContain('"model": "openai/gpt-5.4"');
    expect(content).toContain('"small_model": "openai/gpt-5.4-mini"');
  });

  it("applies model overrides even for free-tier (validation happens upstream)", () => {
    const content = generateOpenCodeJsonc(
      makeOpts("opencode", ["free-tier"], {
        modelOverride: "openai/gpt-5.5",
        smallModelOverride: "openai/gpt-5.4-mini",
      }),
    );
    // Overrides are applied by generateOpenCodeJsonc.
    // validateModelOverride() should be called BEFORE generation to reject
    // overrides from non-enabled providers (Phase 4 install command).
    expect(content).toContain('"model": "openai/gpt-5.5"');
    expect(content).toContain('"small_model": "openai/gpt-5.4-mini"');
  });

  it("exits when free-tier is combined with kilocode runtime", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw new Error("process.exit");
      });
    expect(() => generateOpenCodeJsonc(makeOpts("kilocode", ["free-tier"]))).toThrow(
      "process.exit",
    );
    exitSpy.mockRestore();
  });
});

describe("syncGeneratedOpenCodeJsonc", () => {
  let tmpDir: string;
  let repo: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-config-cfg-test-"));
    repo = path.join(tmpDir, "repo");
    fs.mkdirpSync(repo);
  });

  afterEach(() => {
    fs.removeSync(tmpDir);
  });

  it("writes opencode.jsonc for opencode runtime", () => {
    syncGeneratedOpenCodeJsonc(
      repo,
      "opencode",
      makeOpts("opencode", ["free-tier"]),
      makeCtx(),
    );
    const dst = path.join(repo, "opencode.jsonc");
    expect(fs.pathExistsSync(dst)).toBe(true);
    const content = fs.readFileSync(dst, "utf8");
    expect(content).toContain("// Generated by ai-config bootstrap");
    expect(content).toContain('"opencode": {');
  });

  it("writes kilo.jsonc for kilocode runtime", () => {
    syncGeneratedOpenCodeJsonc(
      repo,
      "kilocode",
      makeOpts("kilocode", ["openai"]),
      makeCtx(),
    );
    const dst = path.join(repo, "kilo.jsonc");
    expect(fs.pathExistsSync(dst)).toBe(true);
    const content = fs.readFileSync(dst, "utf8");
    expect(content).toContain("// Generated by ai-config bootstrap");
  });

  it("skips existing file without force", () => {
    const dst = path.join(repo, "opencode.jsonc");
    fs.writeFileSync(dst, "existing");
    syncGeneratedOpenCodeJsonc(
      repo,
      "opencode",
      makeOpts("opencode", ["free-tier"]),
      makeCtx(),
    );
    expect(fs.readFileSync(dst, "utf8")).toBe("existing");
  });

  it("overwrites existing file with force", () => {
    const dst = path.join(repo, "opencode.jsonc");
    fs.writeFileSync(dst, "existing");
    syncGeneratedOpenCodeJsonc(
      repo,
      "opencode",
      makeOpts("opencode", ["free-tier"]),
      makeCtx(false, true),
    );
    const content = fs.readFileSync(dst, "utf8");
    expect(content).toContain("// Generated by ai-config bootstrap");
  });

  it("skips existing symlink without force", () => {
    const dst = path.join(repo, "opencode.jsonc");
    fs.writeFileSync(path.join(tmpDir, "target.jsonc"), "symlink-target");
    fs.symlinkSync(path.join(tmpDir, "target.jsonc"), dst);
    syncGeneratedOpenCodeJsonc(
      repo,
      "opencode",
      makeOpts("opencode", ["free-tier"]),
      makeCtx(),
    );
    expect(fs.readlinkSync(dst)).toBe(path.join(tmpDir, "target.jsonc"));
  });

  it("replaces existing symlink with force", () => {
    const dst = path.join(repo, "opencode.jsonc");
    fs.writeFileSync(path.join(tmpDir, "target.jsonc"), "symlink-target");
    fs.symlinkSync(path.join(tmpDir, "target.jsonc"), dst);
    syncGeneratedOpenCodeJsonc(
      repo,
      "opencode",
      makeOpts("opencode", ["free-tier"]),
      makeCtx(false, true),
    );
    expect(fs.pathExistsSync(dst)).toBe(true);
    expect(fs.lstatSync(dst).isSymbolicLink()).toBe(false);
    const content = fs.readFileSync(dst, "utf8");
    expect(content).toContain("// Generated by ai-config bootstrap");
  });
});
