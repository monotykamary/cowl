import { existsSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import os from "os";
import { COWL_ROOT, ADJECTIVES, NOUNS } from "./constants.js";
import type { Meta } from "./types.js";
import {
  detectVariationContext,
  getVariationPath,
  generateVariationName,
} from "./variations.js";
import { cowCopyDir, mergeWithRsync } from "./copy.js";
import { mergeWithGit } from "./git.js";
import { readMeta, writeMeta, deleteMeta } from "./meta.js";
import {
  shellEscape,
  fail,
  ensureDir,
  getGitBase,
  fmt,
  projectSlug,
  slugify,
  run,
  randomItem,
  hasGitRepo,
} from "./utils.js";

export function cmdNew(
  flags: Set<string>,
  positionals: string[],
  sourcePath: string
) {
  const project = projectSlug(sourcePath);
  const root = join(COWL_ROOT, project);
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
    variationPath,
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

export function cmdCd(positionals: string[], sourcePath: string) {
  const name = positionals[0];
  if (!name) {
    fail("Name is required.");
  }

  // Special case: "host" navigates back to source directory from variation
  if (name === "host") {
    const ctx = detectVariationContext();
    if (!ctx.inVariation) {
      fail(
        "Not in a variation directory. Use 'cowl cd <variation-name>' to navigate to a variation."
      );
    }
    console.log(`pushd -- ${shellEscape(ctx.sourcePath)}`);
    return;
  }

  const variationPath = getVariationPath(sourcePath, name);
  if (!existsSync(variationPath)) {
    fail(`Variation does not exist: ${variationPath}`);
  }
  console.log(`pushd -- ${shellEscape(variationPath)}`);
}

export function cmdWhereami() {
  const ctx = detectVariationContext();

  if (ctx.inVariation) {
    console.log(`${fmt.cyan("Location")}: variation`);
    console.log(`${fmt.cyan("Variation")}: ${ctx.variationName}`);
    console.log(`${fmt.cyan("Path")}: ${ctx.variationPath}`);
    console.log(`${fmt.cyan("Source")}: ${ctx.sourcePath}`);
  } else {
    console.log(`${fmt.cyan("Location")}: source`);
    console.log(`${fmt.cyan("Path")}: ${ctx.sourcePath}`);

    const project = projectSlug(ctx.sourcePath);
    const rootPath = join(COWL_ROOT, project);
    if (existsSync(rootPath)) {
      const variations = readdirSync(rootPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      if (variations.length > 0) {
        console.log(`${fmt.cyan("Variations")}: ${variations.join(", ")}`);
      }
    }
  }
}

export function cmdHost() {
  const ctx = detectVariationContext();
  if (!ctx.inVariation) {
    fail("Not in a variation directory.");
  }
  console.log(ctx.sourcePath);
}

export function cmdMerge(
  flags: Set<string>,
  options: Record<string, string>,
  positionals: string[],
  sourcePath: string
) {
  const name = positionals[0];
  if (!name) {
    fail("Name is required.");
  }
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
  const branchOption = options.branch?.trim();
  if (options.branch !== undefined && !branchOption) {
    fail("Branch name cannot be empty.");
  }
  const wantsBranch = flags.has("branch") || Boolean(branchOption);
  const branchName = wantsBranch
    ? branchOption ?? `cowl/${meta?.name ?? slugify(name)}`
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
    deleteMeta(variationPath);
  }
}

function testCoWSupport(testDir: string): {
  supported: boolean;
  method: string;
  error?: string;
} {
  const testFile = join(testDir, ".cowl-cow-test-" + Date.now());
  const testContent = "test-content-" + Math.random();

  try {
    writeFileSync(testFile, testContent);
    const cloneFile = testFile + "-clone";

    if (process.platform === "darwin") {
      // Test clonefile on macOS
      const result = run("cp", ["-c", testFile, cloneFile]);
      if (result.status === 0) {
        rmSync(testFile);
        rmSync(cloneFile);
        return { supported: true, method: "clonefile (APFS)" };
      }
      rmSync(testFile);
      return {
        supported: false,
        method: "clonefile",
        error: "clonefile failed, likely not APFS",
      };
    } else {
      // Test reflink on Linux
      const result = run("cp", ["--reflink=auto", testFile, cloneFile]);
      if (result.status === 0) {
        // Check if it was actually a CoW copy by comparing inode numbers
        const stat1 = run("stat", ["-c", "%i", testFile]);
        const stat2 = run("stat", ["-c", "%i", cloneFile]);
        rmSync(testFile);
        rmSync(cloneFile);

        if (
          stat1.status === 0 &&
          stat2.status === 0 &&
          stat1.stdout.trim() === stat2.stdout.trim()
        ) {
          return { supported: true, method: "reflink (same inode)" };
        }
        return {
          supported: false,
          method: "reflink",
          error: "Files have different inodes - filesystem may not support reflink",
        };
      }
      rmSync(testFile);
      return { supported: false, method: "reflink", error: "cp --reflink failed" };
    }
  } catch (err) {
    try {
      rmSync(testFile);
    } catch {}
    try {
      rmSync(testFile + "-clone");
    } catch {}
    return { supported: false, method: "unknown", error: String(err) };
  }
}

export function cmdDoctor() {
  const cwd = realpathSync(process.cwd());
  const cowlRoot = COWL_ROOT;

  console.log(`${fmt.cyan("=== cowl Doctor ===")}\n`);

  // System info
  console.log(`${fmt.bold("System:")}`);
  console.log(`  Platform: ${process.platform}`);
  console.log(`  Current directory: ${cwd}`);

  // CoW support test
  console.log(`\n${fmt.bold("Copy-on-Write Support:")}`);
  const cowTest = testCoWSupport(cwd);
  if (cowTest.supported) {
    console.log(`  ${fmt.green("✓ Supported")} (${cowTest.method})`);
  } else {
    console.log(`  ${fmt.red("✗ Not supported")}`);
    console.log(`  Method attempted: ${cowTest.method}`);
    if (cowTest.error) {
      console.log(`  Error: ${cowTest.error}`);
    }
    console.log(`\n  ${fmt.yellow("Note:")} CoW requires:`);
    if (process.platform === "darwin") {
      console.log("    - APFS filesystem (macOS 10.13+ default)");
    } else {
      console.log("    - Btrfs or XFS filesystem with reflink support");
    }
    console.log("    - Filesystem must support extended attributes");
  }

  // Test cowl data directory
  console.log(`\n${fmt.bold("cowl Data Directory:")}`);
  console.log(`  Location: ${cowlRoot}`);
  if (existsSync(cowlRoot)) {
    const cowlCowTest = testCoWSupport(cowlRoot);
    if (cowlCowTest.supported) {
      console.log(`  CoW support: ${fmt.green("Yes")} (${cowlCowTest.method})`);
    } else {
      console.log(`  CoW support: ${fmt.red("No")}`);
    }
  } else {
    console.log(`  Status: ${fmt.yellow("Does not exist yet")}`);
  }

  // Context
  console.log(`\n${fmt.bold("Current Context:")}`);
  const ctx = detectVariationContext();
  if (ctx.inVariation) {
    console.log(`  Type: ${fmt.cyan("Variation")}`);
    console.log(`  Name: ${ctx.variationName}`);
    console.log(`  Variation path: ${ctx.variationPath}`);
    console.log(`  Source path: ${ctx.sourcePath}`);
  } else {
    console.log(`  Type: ${fmt.cyan("Source directory")}`);
    console.log(`  Path: ${ctx.sourcePath}`);
  }

  // Variations list
  const project = projectSlug(ctx.sourcePath);
  const projectRoot = join(COWL_ROOT, project);
  console.log(`\n${fmt.bold("Variations for this project:")}`);
  if (existsSync(projectRoot)) {
    const variations = readdirSync(projectRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    if (variations.length > 0) {
      variations.forEach((v) => console.log(`  - ${v}`));
    } else {
      console.log(`  ${fmt.dim("No variations yet")}`);
    }
  } else {
    console.log(`  ${fmt.dim("No variations yet")}`);
  }

  // Summary
  console.log(`\n${fmt.bold("Summary:")}`);
  if (cowTest.supported) {
    console.log(
      `  ${fmt.green(
        "✓ CoW is working - variations should be fast and space-efficient"
      )}`
    );
  } else {
    console.log(
      `  ${fmt.red("✗ CoW is not working - variations will use full disk space")}`
    );
    console.log(`  ${fmt.yellow("  Consider:")}`);
    if (process.platform === "darwin") {
      console.log("    - Ensuring your drive is formatted as APFS");
    } else {
      console.log("    - Using Btrfs or XFS for your project directory");
    }
  }
}
