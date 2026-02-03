import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, realpathSync } from "fs";
import { basename, join } from "path";
import os from "os";
import type { ShellName, RepoStatus } from "./types.js";

let useColor = process.stdout.isTTY && !process.env.NO_COLOR;

export function setColorEnabled(enabled: boolean) {
  useColor = enabled;
}

function color(code: string, value: string): string {
  if (!useColor) {
    return value;
  }
  return `\x1b[${code}m${value}\x1b[0m`;
}

export const fmt = {
  bold: (value: string) => color("1", value),
  dim: (value: string) => color("2", value),
  red: (value: string) => color("31", value),
  green: (value: string) => color("32", value),
  yellow: (value: string) => color("33", value),
  cyan: (value: string) => color("36", value),
};

export function fail(message: string): never {
  console.error(fmt.red(message));
  process.exit(1);
}

export function run(
  cmd: string,
  args: string[],
  options?: { cwd?: string; input?: string }
) {
  const result = spawnSync(cmd, args, {
    cwd: options?.cwd,
    input: options?.input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result;
}

export function resultError(result: ReturnType<typeof run>): string {
  return result.stderr || result.stdout || result.error?.message || "unknown error";
}

export function slugify(input: string): string {
  const lowered = input.trim().toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9]+/g, "-");
  return replaced.replace(/^-+|-+$/g, "");
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function shortSha(value?: string): string {
  if (!value) {
    return "";
  }
  return value.length > 7 ? value.slice(0, 7) : value;
}

export function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 6);
}

export function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function detectShellName(): ShellName | null {
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) {
    return "zsh";
  }
  if (shell.includes("bash")) {
    return "bash";
  }
  if (shell.includes("fish")) {
    return "fish";
  }
  return null;
}

export function expandHome(path: string): string {
  if (path === "~") {
    return os.homedir();
  }
  if (path.startsWith("~/")) {
    return join(os.homedir(), path.slice(2));
  }
  return path;
}

export function defaultRcPath(shellName: ShellName): string {
  const home = os.homedir();
  switch (shellName) {
    case "zsh":
      return join(home, ".zshrc");
    case "bash":
      return join(home, ".bashrc");
    case "fish":
      return join(home, ".config", "fish", "config.fish");
  }
}

export function projectSlug(sourcePath: string): string {
  const base = basename(sourcePath);
  const baseSlug = slugify(base) || "project";
  return `${baseSlug}-${shortHash(sourcePath)}`;
}

export function hasGitRepo(path: string): boolean {
  return existsSync(join(path, ".git"));
}

export function commandExists(cmd: string): boolean {
  const result = run(cmd, ["--version"]);
  const err = result.error as NodeJS.ErrnoException | undefined;
  if (err?.code === "ENOENT") {
    return false;
  }
  return result.status === 0;
}

export function getGitBase(sourcePath: string): string | null {
  if (!hasGitRepo(sourcePath)) {
    return null;
  }
  const result = run("git", ["-C", sourcePath, "rev-parse", "HEAD"]);
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

export function getRepoStatus(path: string): RepoStatus {
  if (!hasGitRepo(path)) {
    return { state: "no-git" };
  }
  const result = run("git", ["-C", path, "status", "--porcelain"]);
  if (result.status !== 0) {
    return { state: "error", error: resultError(result) };
  }
  const trimmed = result.stdout.trim();
  if (!trimmed) {
    return { state: "clean" };
  }
  const count = trimmed.split("\n").filter(Boolean).length;
  return { state: "dirty", count };
}

export function formatStatus(info: RepoStatus): string {
  switch (info.state) {
    case "clean":
      return fmt.green("clean");
    case "dirty":
      return fmt.yellow(info.count ? `dirty (${info.count})` : "dirty");
    case "no-git":
      return fmt.dim("no-git");
    default:
      return fmt.red("error");
  }
}

export function ensureBranch(path: string, branchName: string) {
  const exists = run("git", [
    "-C",
    path,
    "show-ref",
    "--verify",
    `refs/heads/${branchName}`,
  ]);
  const args =
    exists.status === 0
      ? ["-C", path, "checkout", branchName]
      : ["-C", path, "checkout", "-b", branchName];
  const checkout = run("git", args);
  if (checkout.status !== 0) {
    fail(`git checkout failed: ${resultError(checkout)}`);
  }
}

export function randomItem(list: string[]) {
  return list[Math.floor(Math.random() * list.length)];
}
