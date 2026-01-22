#!/usr/bin/env bun
import { basename, dirname, join } from "path";
import os from "os";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  mkdtempSync,
} from "fs";
import { spawnSync } from "child_process";
import { createHash } from "crypto";

const META_FILE = ".cowl.json";
const COWL_ROOT = join(os.homedir(), ".cowl");
const SHELL_MARKER_START = "# >>> cowl shell >>>";
const SHELL_MARKER_END = "# <<< cowl shell <<<";

type Meta = {
  version: 1;
  name: string;
  project: string;
  sourcePath: string;
  createdAt: string;
  gitBase?: string;
};

type ShellName = "bash" | "fish" | "zsh";

type ParsedArgs = {
  flags: Set<string>;
  options: Record<string, string>;
  positionals: string[];
};

function parseArgs(args: string[]): ParsedArgs {
  const flags = new Set<string>();
  const options: Record<string, string> = {};
  const positionals: string[] = [];
  const valueOptions = new Set(["shell", "rc"]);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const inlineIndex = key.indexOf("=");
      if (inlineIndex !== -1) {
        const optionKey = key.slice(0, inlineIndex);
        options[optionKey] = key.slice(inlineIndex + 1);
        continue;
      }
      if (valueOptions.has(key)) {
        const next = args[i + 1];
        if (!next || next.startsWith("--")) {
          fail(`Missing value for --${key}.`);
        }
        options[key] = next;
        i += 1;
        continue;
      }
      flags.add(key);
      continue;
    }
    positionals.push(arg);
  }
  return { flags, options, positionals };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function run(
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

function resultError(result: ReturnType<typeof run>): string {
  return result.stderr || result.stdout || result.error?.message || "unknown error";
}

function ensureBranch(path: string, branchName: string) {
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

function slugify(input: string): string {
  const lowered = input.trim().toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9]+/g, "-");
  return replaced.replace(/^-+|-+$/g, "");
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function detectShellName(): ShellName | null {
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

function expandHome(path: string): string {
  if (path === "~") {
    return os.homedir();
  }
  if (path.startsWith("~/")) {
    return join(os.homedir(), path.slice(2));
  }
  return path;
}

function defaultRcPath(shellName: ShellName): string {
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

function shellSnippet(shellName: ShellName): string {
  if (shellName === "fish") {
    return `${SHELL_MARKER_START}
function cowl
  if test (count $argv) -ge 1; and test $argv[1] = "new"
    set -l args $argv
    set -e args[1]
    set -l path (command cowl new $args | string collect | string trim)
    or return $status
    pushd -- $path
  else
    command cowl $argv
  end
end
${SHELL_MARKER_END}`;
  }

  return `${SHELL_MARKER_START}
cowl() {
  if [ "$1" = "new" ]; then
    shift
    local path
    path="$(command cowl new "$@")" || return
    pushd -- "$path"
  else
    command cowl "$@"
  fi
}
${SHELL_MARKER_END}`;
}

function resolveShellName(
  options: Record<string, string>,
  flags: Set<string>
): ShellName {
  if (flags.has("shell")) {
    fail("Missing value for --shell.");
  }
  if (options.shell) {
    const normalized = options.shell.trim().toLowerCase();
    if (normalized === "zsh" || normalized === "bash" || normalized === "fish") {
      return normalized;
    }
    fail(`Unsupported shell: ${options.shell}`);
  }
  const detected = detectShellName();
  if (!detected) {
    fail("Unable to detect shell. Use --shell zsh|bash|fish.");
  }
  return detected;
}

function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 6);
}

function projectSlug(sourcePath: string): string {
  const base = basename(sourcePath);
  const baseSlug = slugify(base) || "project";
  return `${baseSlug}-${shortHash(sourcePath)}`;
}

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function readMeta(variationPath: string): Meta | null {
  const metaPath = join(variationPath, META_FILE);
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    const raw = readFileSync(metaPath, "utf8");
    return JSON.parse(raw) as Meta;
  } catch {
    return null;
  }
}

function writeMeta(variationPath: string, meta: Meta) {
  const metaPath = join(variationPath, META_FILE);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

const ADJECTIVES = [
  "brisk",
  "calm",
  "clear",
  "daring",
  "faint",
  "gentle",
  "golden",
  "happy",
  "icy",
  "jolly",
  "kind",
  "lively",
  "lucky",
  "mellow",
  "mild",
  "neat",
  "nimble",
  "plain",
  "quiet",
  "rapid",
  "shy",
  "tidy",
  "warm",
  "witty",
  "young",
];

const NOUNS = [
  "anchor",
  "canyon",
  "comet",
  "delta",
  "ember",
  "feather",
  "forest",
  "harbor",
  "island",
  "meadow",
  "meteor",
  "oasis",
  "otter",
  "pioneer",
  "pond",
  "prairie",
  "ridge",
  "river",
  "sparrow",
  "summit",
  "tide",
  "trail",
  "valley",
  "whisper",
  "wildflower",
];

function randomItem(list: string[]) {
  return list[Math.floor(Math.random() * list.length)];
}

function generateVariationName(root: string): string {
  for (let i = 0; i < 20; i += 1) {
    const useThree = Math.random() < 0.35;
    const name = useThree
      ? `${randomItem(ADJECTIVES)}-${randomItem(ADJECTIVES)}-${randomItem(NOUNS)}`
      : `${randomItem(ADJECTIVES)}-${randomItem(NOUNS)}`;
    const candidate = slugify(name);
    if (!candidate) {
      continue;
    }
    const path = join(root, candidate);
    if (!existsSync(path)) {
      return candidate;
    }
  }
  return `variation-${Math.random().toString(36).slice(2, 8)}`;
}

function getSourcePath(): string {
  return realpathSync(process.cwd());
}

function getProjectRoot(sourcePath: string): string {
  return join(COWL_ROOT, projectSlug(sourcePath));
}

function getVariationPath(sourcePath: string, name: string): string {
  const root = getProjectRoot(sourcePath);
  const slug = slugify(name);
  if (!slug) {
    fail("Variation name resolves to empty path.");
  }
  return join(root, slug);
}

function hasGitRepo(path: string): boolean {
  return existsSync(join(path, ".git"));
}

function getGitBase(sourcePath: string): string | null {
  if (!hasGitRepo(sourcePath)) {
    return null;
  }
  const result = run("git", ["-C", sourcePath, "rev-parse", "HEAD"]);
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

function cowCopyDir(sourcePath: string, destPath: string) {
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

function printHelp() {
  console.log(`cowl: copy-on-write variations for a directory

Usage:
  cowl new [name] [--cd]
  cowl cd <name>
  cowl path <name>
  cowl list [--all]
  cowl shell [--shell zsh|bash|fish]
  cowl install-shell [--shell zsh|bash|fish] [--rc path]
  cowl merge <name> [--dry-run] [--keep] [--delete] [--branch]
  cowl clean <name>

Notes:
  - Use eval for pushd output, or compose: pushd -- "$(cowl new)".
  - merge uses git when the current directory is a repo root.
  - merge cleans the variation by default; use --keep to retain it.
  - merge --branch creates or switches to cowl/<variation> (git only).
  - install-shell adds a wrapper so cowl new runs pushd automatically.
`);
}

function cmdNew(flags: Set<string>, positionals: string[]) {
  const sourcePath = getSourcePath();
  const project = projectSlug(sourcePath);
  const root = getProjectRoot(sourcePath);
  ensureDir(root);

  let name = positionals[0];
  if (!name) {
    name = generateVariationName(root);
  }
  const slug = slugify(name);
  if (!slug) {
    fail("Variation name resolves to empty path.");
  }
  const variationPath = join(root, slug);
  if (existsSync(variationPath)) {
    fail(`Variation already exists: ${variationPath}`);
  }

  cowCopyDir(sourcePath, variationPath);

  const meta: Meta = {
    version: 1,
    name: slug,
    project,
    sourcePath,
    createdAt: new Date().toISOString(),
    gitBase: getGitBase(sourcePath) ?? undefined,
  };
  writeMeta(variationPath, meta);

  if (flags.has("cd")) {
    console.log(`pushd -- ${shellEscape(variationPath)}`);
    return;
  }
  console.log(variationPath);
}

function cmdPath(positionals: string[]) {
  const name = positionals[0];
  if (!name) {
    fail("Name is required.");
  }
  const sourcePath = getSourcePath();
  const variationPath = getVariationPath(sourcePath, name);
  if (!existsSync(variationPath)) {
    fail(`Variation does not exist: ${variationPath}`);
  }
  console.log(variationPath);
}

function cmdCd(positionals: string[]) {
  const name = positionals[0];
  if (!name) {
    fail("Name is required.");
  }
  const sourcePath = getSourcePath();
  const variationPath = getVariationPath(sourcePath, name);
  if (!existsSync(variationPath)) {
    fail(`Variation does not exist: ${variationPath}`);
  }
  console.log(`pushd -- ${shellEscape(variationPath)}`);
}

function cmdList(flags: Set<string>) {
  if (!existsSync(COWL_ROOT)) {
    return;
  }
  const includeAll = flags.has("all");
  const sourcePath = getSourcePath();
  const project = projectSlug(sourcePath);
  const roots = includeAll
    ? readdirSync(COWL_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [project];

  for (const proj of roots) {
    const root = join(COWL_ROOT, proj);
    if (!existsSync(root)) {
      continue;
    }
    const variations = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    for (const variation of variations) {
      const display = includeAll ? `${proj}/${variation}` : variation;
      console.log(`${display}\t${join(root, variation)}`);
    }
  }
}

function cmdClean(positionals: string[]) {
  const name = positionals[0];
  if (!name) {
    fail("Name is required.");
  }
  const sourcePath = getSourcePath();
  const variationPath = getVariationPath(sourcePath, name);
  if (!existsSync(variationPath)) {
    fail(`Variation does not exist: ${variationPath}`);
  }
  rmSync(variationPath, { recursive: true, force: false });
}

function cmdShell(options: Record<string, string>, flags: Set<string>) {
  const shellName = resolveShellName(options, flags);
  console.log(shellSnippet(shellName));
}

function cmdInstallShell(options: Record<string, string>, flags: Set<string>) {
  const shellName = resolveShellName(options, flags);
  const rcPath = expandHome(options.rc ?? defaultRcPath(shellName));
  ensureDir(dirname(rcPath));

  const snippet = shellSnippet(shellName);
  const existing = existsSync(rcPath) ? readFileSync(rcPath, "utf8") : "";
  if (
    existing.includes(SHELL_MARKER_START) &&
    existing.includes(SHELL_MARKER_END)
  ) {
    console.log(`Shell integration already installed in ${rcPath}`);
    return;
  }
  const needsNewline = existing.length > 0 && !existing.endsWith("\n");
  const content = `${existing}${needsNewline ? "\n" : ""}${snippet}\n`;
  writeFileSync(rcPath, content);
  console.log(`Installed shell integration in ${rcPath}`);
}

function copyUntrackedWithRsync(
  variationPath: string,
  sourcePath: string,
  files: string[]
) {
  if (files.length === 0) {
    return;
  }
  const tmpDir = mkdtempSync(join(os.tmpdir(), "cowl-"));
  const listPath = join(tmpDir, "files");
  const filtered = files.filter((file) => file !== META_FILE);
  if (filtered.length === 0) {
    return;
  }
  writeFileSync(listPath, filtered.join("\0") + "\0");
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

function mergeWithGit(
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

function mergeWithRsync(
  sourcePath: string,
  variationPath: string,
  dryRun: boolean,
  allowDelete: boolean
) {
  const args = ["-a", "--exclude", META_FILE];
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

function cmdMerge(flags: Set<string>, positionals: string[]) {
  const name = positionals[0];
  if (!name) {
    fail("Name is required.");
  }
  const sourcePath = getSourcePath();
  const variationPath = getVariationPath(sourcePath, name);
  if (!existsSync(variationPath)) {
    fail(`Variation does not exist: ${variationPath}`);
  }

  const meta = readMeta(variationPath);
  if (meta?.sourcePath && meta.sourcePath !== sourcePath) {
    fail(`Variation was created from: ${meta.sourcePath}`);
  }

  const dryRun = flags.has("dry-run");
  const keep = flags.has("keep");
  const allowDelete = flags.has("delete");
  const gitBase = meta?.gitBase;
  const wantsBranch = flags.has("branch");
  const branchName = wantsBranch
    ? `cowl/${meta?.name ?? slugify(name)}`
    : undefined;

  if (gitBase && hasGitRepo(sourcePath)) {
    if (wantsBranch && dryRun) {
      console.error("Skipping branch creation in dry-run mode.");
    }
    mergeWithGit(sourcePath, variationPath, gitBase, dryRun, branchName);
  } else {
    if (wantsBranch) {
      fail("merge --branch requires a git repo root.");
    }
    mergeWithRsync(sourcePath, variationPath, dryRun, allowDelete);
  }

  if (!dryRun && !keep) {
    rmSync(variationPath, { recursive: true, force: false });
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const command = args[0];
  const parsed = parseArgs(args.slice(1));

  switch (command) {
    case "new":
      cmdNew(parsed.flags, parsed.positionals);
      break;
    case "path":
      cmdPath(parsed.positionals);
      break;
    case "cd":
      cmdCd(parsed.positionals);
      break;
    case "list":
      cmdList(parsed.flags);
      break;
    case "shell":
      cmdShell(parsed.options, parsed.flags);
      break;
    case "install-shell":
      cmdInstallShell(parsed.options, parsed.flags);
      break;
    case "clean":
    case "rm":
      cmdClean(parsed.positionals);
      break;
    case "merge":
      cmdMerge(parsed.flags, parsed.positionals);
      break;
    case "help":
      printHelp();
      break;
    default:
      fail(`Unknown command: ${command}`);
  }
}

main();
