import type { Provider, Runtime } from "../types.js";

const VALID_PROVIDERS: Provider[] = [
  "openai",
  "github-copilot",
  "laberit",
  "opencode-go",
  "free-tier",
];

export function parseProviders(raw: string): Provider[] {
  const tokens = raw.split(",").map((t) => t.trim());
  const seen = new Set<Provider>();
  const result: Provider[] = [];

  for (const token of tokens) {
    if (!VALID_PROVIDERS.includes(token as Provider)) {
      console.error(`error: invalid provider '${token}' in --providers`);
      console.error(
        "       allowed values: openai, github-copilot, laberit, opencode-go, free-tier, or comma-separated combinations",
      );
      process.exit(1);
    }
    const provider = token as Provider;
    if (!seen.has(provider)) {
      seen.add(provider);
      result.push(provider);
    }
  }

  if (result.length === 0) {
    console.error("error: --providers must include at least one provider");
    process.exit(1);
  }

  return result;
}

export function validateFreeTierRuntime(
  selected: Provider[],
  runtime: Runtime,
): void {
  if (selected.includes("free-tier") && runtime !== "opencode") {
    console.error(
      "error: free-tier provider is only available for opencode runtime",
    );
    process.exit(1);
  }
}

export function validateModelOverride(
  value: string | undefined,
  flagName: string,
  selected: Provider[],
): void {
  if (!value) {
    return;
  }

  const slashIdx = value.indexOf("/");
  if (slashIdx === -1) {
    console.error(
      `error: ${flagName} must be in '<provider>/<model>' format`,
    );
    process.exit(1);
  }

  const provider = value.slice(0, slashIdx);
  if (!selected.includes(provider as Provider)) {
    console.error(
      `error: ${flagName} provider '${provider}' is not enabled by --providers`,
    );
    process.exit(1);
  }
}

export function resolveDefaultModels(
  selected: Provider[],
): { model: string; smallModel: string } {
  if (selected.length === 1 && selected[0] === "github-copilot") {
    return {
      model: "github-copilot/gpt-5.4",
      smallModel: "github-copilot/gpt-5.3-codex",
    };
  }

  if (
    selected.includes("openai") &&
    selected.includes("github-copilot")
  ) {
    return {
      model: "openai/gpt-5.5",
      smallModel: "github-copilot/gemini-3.5-flash",
    };
  }

  if (selected.length === 1 && selected[0] === "laberit") {
    return {
      model: "laberit/laberit-ai-preview",
      smallModel: "laberit/laberit-ai",
    };
  }

  if (selected.length === 1 && selected[0] === "opencode-go") {
    return {
      model: "opencode-go/deepseek-v4-pro",
      smallModel: "opencode-go/deepseek-v4-flash",
    };
  }

  if (selected.every((p) => p === "free-tier")) {
    return { model: "", smallModel: "" };
  }

  return {
    model: "openai/gpt-5.5",
    smallModel: "openai/gpt-5.4-mini",
  };
}
