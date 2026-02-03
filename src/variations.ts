import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { COWL_ROOT, ADJECTIVES, NOUNS } from "./constants.js";
import type { Meta } from "./types.js";
import { readMeta, writeMeta, deleteMeta } from "./meta.js";
export { detectVariationContext } from "./meta.js";
import {
  slugify,
  projectSlug,
  shortHash,
  randomItem,
  fail,
  ensureDir,
  getGitBase,
  getRepoStatus,
  formatStatus,
  fmt,
  shortSha,
} from "./utils.js";

export function getProjectRoot(sourcePath: string): string {
  return join(COWL_ROOT, projectSlug(sourcePath));
}

export function getVariationPath(sourcePath: string, name: string): string {
  const root = getProjectRoot(sourcePath);
  const slug = slugify(name);
  if (!slug) {
    fail("Variation name resolves to empty path.");
  }
  return join(root, slug);
}

export function generateVariationName(root: string): string {
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

export function cmdList(flags: Set<string>, sourcePath: string) {
  if (!existsSync(COWL_ROOT)) {
    return;
  }
  const includeAll = flags.has("all");
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

export function cmdInfo(name: string, sourcePath: string) {
  if (!name) {
    fail("Name is required.");
  }
  const variationPath = getVariationPath(sourcePath, name);
  if (!existsSync(variationPath)) {
    fail(`Variation does not exist: ${variationPath}`);
  }
  const meta = readMeta(variationPath);
  const project = meta?.project ?? projectSlug(sourcePath);
  const rootPath = join(COWL_ROOT, project);
  const status = getRepoStatus(variationPath);

  const lines = [
    `${fmt.cyan("Name")}: ${meta?.name ?? slugify(name)}`,
    `${fmt.cyan("Path")}: ${variationPath}`,
    `${fmt.cyan("Root")}: ${rootPath}`,
    `${fmt.cyan("Source")}: ${meta?.sourcePath ?? fmt.dim("unknown")}`,
    `${fmt.cyan("Created")}: ${meta?.createdAt ?? fmt.dim("unknown")}`,
    `${fmt.cyan("Git base")}: ${
      meta?.gitBase ? shortSha(meta.gitBase) : fmt.dim("none")
    }`,
    `${fmt.cyan("Status")}: ${formatStatus(status)}`,
  ];

  if (status.state === "error" && status.error) {
    console.error(fmt.red(`git status failed: ${status.error}`));
  }

  console.log(lines.join("\n"));
}

export function cmdStatus(name: string, sourcePath: string) {
  if (!name) {
    fail("Name is required.");
  }
  const variationPath = getVariationPath(sourcePath, name);
  if (!existsSync(variationPath)) {
    fail(`Variation does not exist: ${variationPath}`);
  }
  const status = getRepoStatus(variationPath);
  if (status.state === "error") {
    fail(`git status failed: ${status.error ?? "unknown error"}`);
  }
  console.log(formatStatus(status));
}

export function cmdClean(name: string, sourcePath: string) {
  if (!name) {
    fail("Name is required.");
  }
  const variationPath = getVariationPath(sourcePath, name);
  if (!existsSync(variationPath)) {
    fail(`Variation does not exist: ${variationPath}`);
  }
  rmSync(variationPath, { recursive: true, force: false });
  deleteMeta(variationPath);
}

export function cmdRoot(sourcePath: string) {
  const root = getProjectRoot(sourcePath);
  console.log(root);
}

export function cmdPath(name: string, sourcePath: string) {
  if (!name) {
    fail("Name is required.");
  }
  const variationPath = getVariationPath(sourcePath, name);
  if (!existsSync(variationPath)) {
    fail(`Variation does not exist: ${variationPath}`);
  }
  console.log(variationPath);
}
