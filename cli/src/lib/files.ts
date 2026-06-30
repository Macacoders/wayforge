import fs from "fs-extra";
import path from "path";
import type { ManifestContext } from "./context.js";

export function mkdir(dir: string, ctx: ManifestContext): void {
  if (ctx.dryRun) {
    return;
  }
  fs.mkdirpSync(dir);
}

export function rm(path: string, ctx: ManifestContext): void {
  if (ctx.dryRun) {
    ctx.log(`DRY-RUN: rm -f ${path}`);
    return;
  }
  try {
    fs.unlinkSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw err;
    }
  }
}

export function rmRf(path: string, ctx: ManifestContext): void {
  if (ctx.dryRun) {
    ctx.log(`DRY-RUN: rm -rf ${path}`);
    return;
  }
  fs.removeSync(path);
}

export function cp(src: string, dst: string, ctx: ManifestContext): void {
  if (ctx.dryRun) {
    ctx.log(`DRY-RUN: cp ${src} ${dst}`);
    return;
  }
  fs.copyFileSync(src, dst);
}

export function cpA(src: string, dst: string, ctx: ManifestContext): void {
  if (ctx.dryRun) {
    ctx.log(`DRY-RUN: cp -a ${src} ${dst}`);
    return;
  }
  fs.copySync(src, dst, { preserveTimestamps: true });
}

export function writeFile(
  path: string,
  content: string,
  ctx: ManifestContext,
): void {
  if (ctx.dryRun) {
    ctx.log(`DRY-RUN: write file ${path}`);
    return;
  }
  fs.writeFileSync(path, `${content}\n`);
}

export function readFileOrDefault(
  dir: string,
  filename: string,
  defaultVal: string,
): string {
  const file = path.join(dir, filename);
  return fs.pathExistsSync(file)
    ? fs.readFileSync(file, "utf8").trim()
    : defaultVal;
}

export function ensureDir(dir: string, ctx: ManifestContext): void {
  if (fs.pathExistsSync(dir)) {
    return;
  }
  if (ctx.dryRun) {
    ctx.log(`DRY-RUN: mkdir -p ${dir}`);
    return;
  }
  fs.mkdirpSync(dir);
  ctx.log(`created directory: ${dir}`);
}
