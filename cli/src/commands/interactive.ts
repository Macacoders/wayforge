import fs from "fs-extra";
import readline from "node:readline/promises";
import { doInstall } from "./install.js";
import type { InstallOptions, Runtime } from "../types.js";
import { parseProviders, resolveFastModels } from "../lib/providers.js";

// ponytail: rung 2 — data-driven menu helper; eliminates 7× repeated prompt+switch pattern
async function promptMenu<T>(
  rl: readline.Interface,
  title: string,
  choices: { label: string; value: T }[],
  defaultIdx: number,
): Promise<T> {
  console.log(`\n${title}:`);
  choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
  while (true) {
    const input = (await rl.question(`Choose ${title.toLowerCase()} [${defaultIdx + 1}]: `)).trim();
    const idx = input === "" ? defaultIdx : parseInt(input, 10) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx].value;
    console.log("please enter a valid number");
  }
}

export async function interactiveCommand(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const defaultRepo = process.cwd();
    let repoPath = "";
    while (true) {
      const input = (await rl.question(`Target repository path [${defaultRepo}]: `)).trim();
      repoPath = input === "" ? defaultRepo : input;
      if (fs.pathExistsSync(repoPath) && fs.statSync(repoPath).isDirectory()) break;
      console.log(`path does not exist or is not a directory: ${repoPath}`);
    }

    const runtime = await promptMenu(rl, "Runtime", [
      { label: "opencode (default)", value: "opencode" as Runtime },
      { label: "kilocode", value: "kilocode" as Runtime },
    ], 0);

    // Provider selection: opencode includes free-tier, kilocode does not
    const providerChoices =
      runtime === "opencode"
        ? [
            { label: "free-tier (default, no external provider)", value: "free-tier" },
            { label: "openai", value: "openai" },
            { label: "github-copilot", value: "github-copilot" },
            { label: "laberit", value: "laberit" },
            { label: "opencode-go", value: "opencode-go" },
            { label: "openai,github-copilot", value: "openai,github-copilot" },
            { label: "openai,laberit", value: "openai,laberit" },
            { label: "github-copilot,laberit", value: "github-copilot,laberit" },
            { label: "openai,github-copilot,laberit", value: "openai,github-copilot,laberit" },
          ]
        : [
            { label: "openai (default)", value: "openai" },
            { label: "github-copilot", value: "github-copilot" },
            { label: "laberit", value: "laberit" },
            { label: "opencode-go", value: "opencode-go" },
            { label: "openai,github-copilot", value: "openai,github-copilot" },
            { label: "openai,laberit", value: "openai,laberit" },
            { label: "github-copilot,laberit", value: "github-copilot,laberit" },
            { label: "openai,github-copilot,laberit", value: "openai,github-copilot,laberit" },
          ];
    const providers = await promptMenu(rl, "Provider set", providerChoices, 0);

    const modelPreset = await promptMenu(rl, "Model preset", [
      { label: "installer defaults (recommended)", value: "default" as const },
      { label: "faster responses", value: "fast" as const },
    ], 0);

    let modelOverride: string | undefined;
    let smallModelOverride: string | undefined;
    // ponytail: rung 2 — resolveFastModels extracted to providers.ts; eliminates 56-line duplicate
    if (modelPreset === "fast") {
      const fast = resolveFastModels(parseProviders(providers));
      modelOverride = fast.model;
      smallModelOverride = fast.smallModel;
    }

    const dryRun = await promptMenu(rl, "Dry run", [
      { label: "no (default)", value: false },
      { label: "yes", value: true },
    ], 0);

    const force = await promptMenu(rl, "Force refresh managed files", [
      { label: "no (default)", value: false },
      { label: "yes", value: true },
    ], 0);

    console.log("\nGitHub App for issue management (/issue command):");
    console.log("  If you have a GitHub App with Issues and PR permissions, enter its Client ID below.");
    console.log("  Leave blank to skip — you can configure it later in .gh-config/app.yml");
    const ghAppClientIdInput = (await rl.question("GitHub App Client ID (leave blank to skip): ")).trim();
    const ghAppClientId = ghAppClientIdInput === "" ? undefined : ghAppClientIdInput;

    console.log("\nProvider connection instructions (not automated):");
    if (providers.includes("openai")) {
      console.log("  - OpenAI: in OpenCode/Kilo Code, run /connect and complete OpenAI auth.");
    }
    if (providers.includes("github-copilot")) {
      console.log("  - GitHub Copilot: in OpenCode/Kilo Code, run /connect and complete device login.");
    }
    if (providers.includes("laberit")) {
      console.log("  - laberit: set OPENAI_BASE_URL and OPENAI_API_KEY in your local environment before use.");
    }

    console.log("\nSummary:");
    console.log(`  Repo: ${repoPath}`);
    console.log(`  Runtime: ${runtime}`);
    console.log(`  Providers: ${providers}`);
    console.log(`  Model override: ${modelOverride ?? "none (installer default)"}`);
    console.log(`  Small model override: ${smallModelOverride ?? "none (installer default)"}`);
    console.log(`  Dry run: ${dryRun}`);
    console.log(`  Force: ${force}`);
    console.log(`  GitHub App Client ID: ${ghAppClientId ?? "(not set — configure later in .gh-config/app.yml)"}`);

    const proceedInput = (await rl.question("\nProceed with install? [Y/n]: ")).trim();
    const proceed = proceedInput === "" ? "Y" : proceedInput;
    const affirmatives = new Set(["Y", "y", "yes", "YES"]);
    if (!affirmatives.has(proceed)) {
      console.log("cancelled");
      process.exit(0);
    }

    const options: InstallOptions = {
      repo: repoPath,
      runtime,
      providers,
      model: modelOverride,
      smallModel: smallModelOverride,
      dryRun,
      force,
      ghAppClientId,
      noTrack: false,
    };

    rl.close();
    doInstall(options);
  } catch (error) {
    rl.close();
    throw error;
  }
}
