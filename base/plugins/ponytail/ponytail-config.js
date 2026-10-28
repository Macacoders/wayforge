import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VALID_MODES = ["off", "lite", "full", "ultra"];

const STATE_DIR = path.join(os.homedir(), ".config", "opencode");
const STATE_FILE = path.join(STATE_DIR, ".ponytail-active");

export function isValidMode(mode) {
  return VALID_MODES.includes(mode);
}

export function getMode() {
  try {
    const envMode = process.env.PONYTAIL_DEFAULT_MODE;
    if (envMode && isValidMode(envMode)) {
      return envMode;
    }
  } catch {
    // ignore env read errors
  }

  try {
    if (fs.existsSync(STATE_FILE)) {
      const stored = fs.readFileSync(STATE_FILE, "utf8").trim();
      if (isValidMode(stored)) {
        return stored;
      }
    }
  } catch {
    // ignore state file read errors
  }

  return "full";
}

export function setMode(mode) {
  if (!isValidMode(mode)) {
    return;
  }

  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, mode, "utf8");
  } catch {
    // ignore state file write errors
  }
}
