import { run, resultError, fail, hasGitRepo, ensureBranch } from "./utils.js";
import { copyUntrackedWithRsync } from "./copy.js";

export function mergeWithGit(
  sourcePath: string,
  variationPath: string,
  baseCommit: string,
  dryRun: boolean,
  branchName?: string
) {
  if (branchName && !dryRun) {
    ensureBranch(sourcePath, branchName);
  }

  const diff = run("git", [
    "-C",
    variationPath,
    "diff",
    "--binary",
    baseCommit,
  ]);
  if (diff.status !== 0) {
    fail(`git diff failed: ${resultError(diff)}`);
  }

  if (diff.stdout.trim().length > 0) {
    const applyArgs = ["-C", sourcePath, "apply", "--3way"];
    if (dryRun) {
      applyArgs.push("--check");
    }
    const apply = run("git", applyArgs, { input: diff.stdout });
    if (apply.status !== 0) {
      fail(`git apply failed: ${resultError(apply)}`);
    }
  }

  const untracked = run("git", [
    "-C",
    variationPath,
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  if (untracked.status !== 0) {
    fail(`git ls-files failed: ${resultError(untracked)}`);
  }

  const files = untracked.stdout.split("\0").filter(Boolean);
  if (!dryRun) {
    copyUntrackedWithRsync(variationPath, sourcePath, files);
  }
}
