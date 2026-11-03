import path from "node:path";
import os from "node:os";
import {
  readFile as defaultReadFile,
  writeFile as defaultWriteFile,
  mkdir as defaultMkdir,
  rename as defaultRename,
  unlink as defaultUnlink,
} from "node:fs/promises";

/**
 * Shared update-notifier core for the OpenCode and Kilo Code entrypoints.
 *
 * Dependency-free on purpose: Node built-ins plus global `fetch` only, so
 * either runtime can load it without resolving plugin SDK packages.
 */

const SCHEMA_VERSION = 1;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
/** Production release root is a constant; no env override outside tests. */
const RELEASE_ROOT = "https://github.com/Macacoders/wayforge/releases";
const RELEASE_TAG_PATH = "/Macacoders/wayforge/releases/tag/";
const USER_AGENT = "wayforge-update-notifier";
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

function compareVersions(a, b) {
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
 * The update check is disabled by default. Only an explicit `1` or `true`
 * (trimmed, case-insensitive) enables it; unset, empty, `0`, `false`, or any
 * other value keeps it disabled.
 */
export function isUpdateCheckEnabled(env) {
  const value = env?.WAYFORGE_UPDATE_CHECK;
  if (typeof value !== "string") return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true";
}

/**
 * Test-only seam gate: `WAYFORGE_RELEASE_ROOT`, `WAYFORGE_NOTIFIER_CACHE`,
 * and `WAYFORGE_VERSION` are honored only when `WAYFORGE_NOTIFIER_TEST=1`.
 * In production they are ignored (ADR-0049).
 */
function isNotifierTestMode(env) {
  return env?.WAYFORGE_NOTIFIER_TEST === "1";
}

/**
 * Prefix resolution mirrors the CLI: `WAYFORGE_INSTALL_DIR` when set,
 * otherwise `%LOCALAPPDATA%\wayforge` on Windows and `~/.wayforge` elsewhere.
 * `WAYFORGE_HOME` is deliberately ignored (ADR-0049).
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
 * Installed version: `WAYFORGE_VERSION` overrides — but only in test mode
 * (`WAYFORGE_NOTIFIER_TEST=1`) and only when it parses as semver (invalid
 * values no-op like an unparseable VERSION file) — otherwise
 * `<prefix>/share/wayforge/VERSION`. Missing or unparseable returns null so
 * callers can no-op.
 */
async function resolveInstalledVersion(env, prefix, readFile) {
  const fromEnv = isNotifierTestMode(env) ? env?.WAYFORGE_VERSION : undefined;
  if (fromEnv && fromEnv.trim() !== "") {
    const trimmed = fromEnv.trim();
    return parseSemver(trimmed) ? trimmed : null;
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
 * Cache path: `WAYFORGE_NOTIFIER_CACHE` when set in test mode
 * (`WAYFORGE_NOTIFIER_TEST=1`; test/manual seam), otherwise
 * `<user cache>/wayforge/update-notifier.json`.
 */
export function resolveCachePath(env, platform = process.platform, homedir = os.homedir()) {
  const override = isNotifierTestMode(env) ? env?.WAYFORGE_NOTIFIER_CACHE : undefined;
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

/** Best-effort atomic persistence; a failed write returns false, never throws.
 * The JSON is written to a unique temp file in the same directory, then
 * renamed over the final path — so a crash never leaves a half-written cache
 * and the rename replaces (rather than follows) a symlink at the final path.
 * The cache parent directory is created recursively if missing, and the temp
 * file is removed best-effort on any failure. */
export async function writeCache(
  filePath,
  cache,
  writeFile = defaultWriteFile,
  rename = defaultRename,
  unlink = defaultUnlink,
) {
  if (!filePath || !writeFile) return false;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await defaultMkdir(path.dirname(filePath), { recursive: true });
    await writeFile(tempPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
    return true;
  } catch {
    try {
      await unlink(tempPath);
    } catch {
      // The temp file may not exist; cleanup is best-effort.
    }
    return false;
  }
}

/** Production release root is a constant; `WAYFORGE_RELEASE_ROOT` is honored
 * only in test mode (`WAYFORGE_NOTIFIER_TEST=1`). */
function resolveReleaseRoot(env) {
  const override = isNotifierTestMode(env) ? env?.WAYFORGE_RELEASE_ROOT : undefined;
  if (override && override.trim() !== "") {
    return override.trim().replace(/\/+$/, "");
  }
  return RELEASE_ROOT;
}

/**
 * The redirect must land on the wayforge releases tag page on github.com over
 * HTTPS; anything else is rejected so a compromised or hostile redirect can
 * never feed a version string into the notifier.
 */
function parseRedirectTag(redirectUrl) {
  if (redirectUrl.protocol !== "https:" || redirectUrl.hostname !== "github.com") {
    return null;
  }
  if (!redirectUrl.pathname.startsWith(RELEASE_TAG_PATH)) {
    return null;
  }
  const tag = redirectUrl.pathname.slice(RELEASE_TAG_PATH.length);
  if (!tag || tag.includes("/") || !parseSemver(tag)) return null;
  return tag;
}

/** Cancel the response body before returning or throwing; best-effort. */
async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Body cancellation is best-effort; mocks may have no body.
  }
}

/**
 * Mirrors `cli/src/lib/release.ts`: manual redirects keep the release page
 * body off the wire; the tag lives in the Location header. The User-Agent is
 * a constant — the installed version is never sent to the server.
 */
async function resolveLatestVersion({ releaseRoot, fetchImpl }) {
  const root = releaseRoot ?? RELEASE_ROOT;
  const doFetch = fetchImpl ?? globalThis.fetch;
  const requestUrl = `${root}/latest`;
  const response = await doFetch(requestUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": USER_AGENT },
  });
  await cancelBody(response);

  const isRedirect = response.status >= 300 && response.status < 400;
  if (!isRedirect) {
    throw new Error(`Release lookup failed with status ${String(response.status)}`);
  }
  const location = response.headers.get("location");
  if (!location) {
    throw new Error(`Release lookup redirected without a Location header: ${requestUrl}`);
  }
  const redirectUrl = new URL(location, requestUrl);
  const tag = parseRedirectTag(redirectUrl);
  if (!tag) {
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
    rename = defaultRename,
    unlink = defaultUnlink,
  } = options;

  let inFlight = null;
  let memoryCache = null;

  async function run() {
    // Runtime gate: disabled by default, no cache read / network / toast.
    if (!isUpdateCheckEnabled(env)) {
      return { checked: false, updateAvailable: false, notified: false };
    }

    const prefix = installPrefix ?? resolveInstallPrefix(env);
    const current = await resolveInstalledVersion(env, prefix, readFile);
    if (!current) {
      return { checked: false, updateAvailable: false, notified: false };
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
      await writeCache(resolvedCachePath, cache, writeFile, rename, unlink);
      if (fetchFailed) {
        return { checked: true, updateAvailable: false, notified: false };
      }
    }

    const updateAvailable = latestVersion ? isNewer(current, latestVersion) : false;
    if (!updateAvailable) {
      return { checked: true, updateAvailable: false, notified: false };
    }

    if (cache?.notifiedVersion === latestVersion) {
      return { checked: true, updateAvailable: true, notified: false };
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
    await writeCache(resolvedCachePath, cache, writeFile, rename, unlink);

    return { checked: true, updateAvailable: true, notified: true };
  }

  async function checkAndNotify() {
    if (inFlight) return inFlight;
    inFlight = run()
      .catch(() => ({ checked: false, updateAvailable: false, notified: false }))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return { checkAndNotify };
}
