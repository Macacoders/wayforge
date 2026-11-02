import path from "node:path";
import os from "node:os";
import { readFile as defaultReadFile, writeFile as defaultWriteFile, mkdir as defaultMkdir } from "node:fs/promises";

/**
 * Shared update-notifier core for the OpenCode and Kilo Code entrypoints.
 *
 * Dependency-free on purpose: Node built-ins plus global `fetch` only, so
 * either runtime can load it without resolving plugin SDK packages.
 */

const SCHEMA_VERSION = 1;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const DEFAULT_RELEASE_ROOT = "https://github.com/Macacoders/wayforge/releases";
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(value) {
  if (typeof value !== "string") return null;
  const match = SEMVER_RE.exec(value.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareVersions(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) {
    throw new Error(`Invalid semver: ${!va ? a : b}`);
  }
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;
  return 0;
}

export function isNewer(current, candidate) {
  try {
    return compareVersions(candidate, current) > 0;
  } catch {
    return false;
  }
}

/**
 * The update check is disabled by default. Only an explicit `0` or `false`
 * (case-insensitive) enables it; unset, empty, `1`, `true`, or any other
 * value keeps it disabled.
 */
export function isUpdateCheckEnabled(env) {
  const value = env?.WAYFORGE_NO_UPDATE_CHECK;
  if (value === undefined || value === null) return false;
  if (value === "0") return true;
  return value.toLowerCase() === "false";
}

/**
 * Prefix resolution mirrors the CLI: `WAYFORGE_INSTALL_DIR` when set,
 * otherwise `%LOCALAPPDATA%\wayforge` on Windows and `~/.wayforge` elsewhere.
 * `WAYFORGE_HOME` is deliberately ignored (ADR-0048).
 */
export function resolveInstallPrefix(env, platform = process.platform) {
  const configured = env?.WAYFORGE_INSTALL_DIR;
  if (configured && configured.trim() !== "") {
    return path.resolve(configured.trim());
  }
  if (platform === "win32") {
    const local = env?.LOCALAPPDATA;
    const base = local && local.trim() !== "" ? local.trim() : path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "wayforge");
  }
  return path.join(os.homedir(), ".wayforge");
}

/**
 * Installed version: `WAYFORGE_VERSION` overrides (test seam, mirroring the
 * CLI), otherwise `<prefix>/share/wayforge/VERSION`. Missing or unparseable
 * returns null so callers can no-op.
 */
export async function resolveInstalledVersion(env, prefix, readFile) {
  const fromEnv = env?.WAYFORGE_VERSION;
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  if (!prefix || !readFile) return null;
  try {
    const raw = await readFile(path.join(prefix, "share", "wayforge", "VERSION"), "utf8");
    const trimmed = raw.trim();
    if (trimmed !== "" && parseSemver(trimmed)) return trimmed;
  } catch {
    // Fall through to null.
  }
  return null;
}

/**
 * Cache path: `WAYFORGE_NOTIFIER_CACHE` when set (test/manual seam), otherwise
 * `<user cache>/wayforge/update-notifier.json`.
 */
export function resolveCachePath(env, platform = process.platform, homedir = os.homedir()) {
  const override = env?.WAYFORGE_NOTIFIER_CACHE;
  if (override && override.trim() !== "") {
    return path.resolve(override.trim());
  }
  if (platform === "win32") {
    const local = env?.LOCALAPPDATA;
    const base = local && local.trim() !== "" ? local.trim() : path.join(homedir, "AppData", "Local");
    return path.join(base, "wayforge", "update-notifier.json");
  }
  const xdg = env?.XDG_CACHE_HOME;
  const base = xdg && xdg.trim() !== "" ? xdg.trim() : path.join(homedir, ".cache");
  return path.join(base, "wayforge", "update-notifier.json");
}

function isValidCache(value) {
  if (!value || typeof value !== "object") return false;
  if (value.schemaVersion !== SCHEMA_VERSION) return false;
  if (typeof value.lastChecked !== "string") return false;
  if (value.latestVersion !== null && typeof value.latestVersion !== "string") return false;
  if (value.notifiedVersion !== null && typeof value.notifiedVersion !== "string") return false;
  return true;
}

/** Corrupt JSON or a mismatched schema is discarded (returns null). */
export async function readCache(filePath, readFile) {
  if (!filePath || !readFile) return null;
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return isValidCache(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort persistence; a failed write returns false, never throws.
 * The cache parent directory is created recursively if missing. */
export async function writeCache(filePath, cache, writeFile = defaultWriteFile) {
  if (!filePath || !writeFile) return false;
  try {
    await defaultMkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function resolveReleaseRoot(env) {
  const override = env?.WAYFORGE_RELEASE_ROOT;
  if (override && override.trim() !== "") {
    return override.trim().replace(/\/+$/, "");
  }
  return DEFAULT_RELEASE_ROOT;
}

/**
 * Mirrors `cli/src/lib/release.ts`: manual redirects keep the release page
 * body off the wire; the tag lives in the Location header.
 */
export async function resolveLatestVersion({ releaseRoot, current, fetchImpl }) {
  const root = releaseRoot ?? DEFAULT_RELEASE_ROOT;
  const doFetch = fetchImpl ?? globalThis.fetch;
  const requestUrl = `${root}/latest`;
  const response = await doFetch(requestUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": `wayforge/${current}` },
  });

  const isRedirect = response.status >= 300 && response.status < 400;
  if (!isRedirect) {
    throw new Error(`Release lookup failed with status ${String(response.status)}`);
  }
  const location = response.headers.get("location");
  if (!location) {
    throw new Error(`Release lookup redirected without a Location header: ${requestUrl}`);
  }
  const redirectUrl = new URL(location, requestUrl);
  const segments = redirectUrl.pathname.split("/").filter(Boolean);
  const tag = segments.at(-1);
  if (!segments.includes("tag") || !tag || !parseSemver(tag)) {
    throw new Error(`Could not parse a release tag from ${redirectUrl.href}`);
  }
  return tag;
}

function displayVersion(version) {
  return `v${version.replace(/^v/, "")}`;
}

export function buildToastMessage(latestVersion, installedVersion) {
  return `wayforge ${displayVersion(latestVersion)} is available (installed ${displayVersion(installedVersion)}). Run \`wfg upgrade\` to update.`;
}

async function showToast(client, message) {
  try {
    await client?.tui?.showToast?.({ body: { message, variant: "info" } });
  } catch {
    // A missing or throwing toast API must never break the session.
  }
}

/**
 * Factory returning `{ checkAndNotify }`. Every I/O primitive is injectable
 * so tests can run against temp paths with mocked clocks and fetches.
 */
export function createNotifier(options = {}) {
  const {
    client = null,
    env = process.env,
    cachePath,
    installPrefix,
    fetchImpl,
    now = () => Date.now(),
    readFile = defaultReadFile,
    writeFile = defaultWriteFile,
  } = options;

  let inFlight = null;
  let memoryCache = null;

  async function run() {
    // Runtime gate: disabled by default, no cache read / network / toast.
    if (!isUpdateCheckEnabled(env)) {
      return { checked: false, updateAvailable: false, notified: false, reason: "disabled" };
    }

    const prefix = installPrefix ?? resolveInstallPrefix(env);
    const current = await resolveInstalledVersion(env, prefix, readFile);
    if (!current) {
      return { checked: false, updateAvailable: false, notified: false, reason: "no-installed-version" };
    }

    const resolvedCachePath = cachePath ?? resolveCachePath(env);
    let cache = memoryCache ?? (await readCache(resolvedCachePath, readFile));
    memoryCache = cache;

    const checkedAt = now();
    const lastCheckedMs = cache ? Date.parse(cache.lastChecked) : Number.NaN;
    const isFresh = cache && Number.isFinite(lastCheckedMs) && checkedAt - lastCheckedMs < CHECK_INTERVAL_MS;

    let latestVersion = null;
    let fetchFailed = false;
    if (isFresh) {
      latestVersion = cache.latestVersion;
    } else {
      try {
        latestVersion = await resolveLatestVersion({
          releaseRoot: resolveReleaseRoot(env),
          current,
          fetchImpl,
        });
      } catch {
        fetchFailed = true;
        latestVersion = null;
      }
      // Failed lookups still advance `lastChecked` best-effort so an outage
      // cannot add a 5-second timeout to every session.
      cache = {
        schemaVersion: SCHEMA_VERSION,
        lastChecked: new Date(checkedAt).toISOString(),
        latestVersion,
        notifiedVersion: cache?.notifiedVersion ?? null,
      };
      memoryCache = cache;
      await writeCache(resolvedCachePath, cache, writeFile);
      if (fetchFailed) {
        return { checked: true, updateAvailable: false, notified: false, reason: "fetch-failed" };
      }
    }

    const updateAvailable = latestVersion ? isNewer(current, latestVersion) : false;
    if (!updateAvailable) {
      return { checked: true, updateAvailable: false, notified: false, current, latestVersion };
    }

    if (cache?.notifiedVersion === latestVersion) {
      return { checked: true, updateAvailable: true, notified: false, current, latestVersion };
    }

    await showToast(client, buildToastMessage(latestVersion, current));

    // Persist `notifiedVersion` best-effort; a failed write falls back to the
    // in-process state so a single session never toasts repeatedly.
    cache = {
      schemaVersion: SCHEMA_VERSION,
      lastChecked: new Date(checkedAt).toISOString(),
      latestVersion,
      notifiedVersion: latestVersion,
    };
    memoryCache = cache;
    await writeCache(resolvedCachePath, cache, writeFile);

    return { checked: true, updateAvailable: true, notified: true, current, latestVersion };
  }

  async function checkAndNotify() {
    if (inFlight) return inFlight;
    inFlight = run()
      .catch(() => ({ checked: false, updateAvailable: false, notified: false, reason: "error" }))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return { checkAndNotify };
}
