import { dirname, join } from "path";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import { fail, run, resultError, ensureDir, commandExists } from "./utils.js";

export function cowCopyDir(sourcePath: string, destPath: string) {
  if (existsSync(destPath)) {
    fail(`Destination already exists: ${destPath}`);
  }
  const parent = dirname(destPath);
  ensureDir(parent);

  if (process.platform === "darwin") {
    const result = run("cp", ["-c", "-R", sourcePath, destPath]);
    if (result.status === 0) {
      return;
    }
    if (existsSync(destPath)) {
      rmSync(destPath, { recursive: true, force: true });
    }
    const fallback = run("cp", ["-R", sourcePath, destPath]);
    if (fallback.status !== 0) {
      fail(`Copy failed: ${resultError(fallback)}`);
    }
    console.error("CoW clone failed; fell back to standard copy.");
    return;
  }

  const result = run("cp", ["-a", "--reflink=auto", sourcePath, destPath]);
  if (result.status === 0) {
    return;
  }
  if (existsSync(destPath)) {
    rmSync(destPath, { recursive: true, force: true });
  }
  const fallback = run("cp", ["-a", sourcePath, destPath]);
  if (fallback.status !== 0) {
    fail(`Copy failed: ${resultError(fallback)}`);
  }
  console.error("CoW clone failed; fell back to standard copy.");
}

export function ensureRsync() {
  if (commandExists("rsync")) {
    return;
  }
  fail("rsync is required for this operation. Install rsync or use git.");
}

export function copyUntrackedWithRsync(
  variationPath: string,
  sourcePath: string,
  files: string[]
) {
  ensureRsync();
  if (files.length === 0) {
    return;
  }
  const tmpDir = mkdtempSync(join(os.tmpdir(), "cowl-"));
  const listPath = join(tmpDir, "files");
  if (files.length === 0) {
    return;
  }
  writeFileSync(listPath, files.join("\0") + "\0");
  const result = run("rsync", [
    "-a",
    "--from0",
    `--files-from=${listPath}`,
    `${variationPath}/`,
    `${sourcePath}/`,
  ]);
  if (result.status !== 0) {
    fail(`rsync failed: ${resultError(result)}`);
  }
}

export function mergeWithRsync(
  sourcePath: string,
  variationPath: string,
  dryRun: boolean,
  allowDelete: boolean
) {
  ensureRsync();
  const args = ["-a"];
  if (dryRun) {
    args.push("--dry-run");
  }
  if (allowDelete) {
    args.push("--delete");
  }
  args.push(`${variationPath}/`, `${sourcePath}/`);
  const result = run("rsync", args);
  if (result.status !== 0) {
    fail(`rsync failed: ${resultError(result)}`);
  }
}
