import { getMode, setMode, isValidMode } from "./ponytail-config.js";
import { buildInstructions } from "./ponytail-instructions.js";

export async function server(input) {
  const currentMode = getMode();

  return {
    config: async () => {
      try {
        return {
          skillsDir: "./.opencode/skills",
        };
      } catch {
        return {};
      }
    },

    "experimental.chat.system.transform": async ({ system }) => {
      try {
        if (currentMode === "off") {
          return { system };
        }

        const instructions = buildInstructions(currentMode);
        if (!instructions) {
          return { system };
        }

        if (
          Array.isArray(system) &&
          system.some(
            (part) => part.text && part.text.includes("Ponytail Reuse-First Discipline"),
          )
        ) {
          return { system };
        }

        return {
          system: [
            ...system,
            { type: "text", text: instructions },
          ],
        };
      } catch {
        return { system };
      }
    },

    "command.execute.before": async (input, output) => {
      try {
        const cmd = input.command || "";
        const match = cmd.match(/^\/ponytail\s+(lite|full|ultra|off)\b/);
        if (match) {
          const mode = match[1];
          if (isValidMode(mode)) {
            setMode(mode);
          }
        }
      } catch {
        // ignore command hook errors
      }
    },
  };
}
