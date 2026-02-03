import { test, expect } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { basename, join, resolve } from "path";
import os from "os";
import { spawnSync } from "child_process";
import { createHash } from "crypto";

const repoRoot = resolve(import.meta.dir, "..");
const cliPath = join(repoRoot, "src", "index.ts");
const bunBin = process.execPath;

function runCmd(
  cmd: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
) {
  return spawnSync(cmd, args, {
    cwd: options?.cwd,
    env: options?.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function commandAvailable(cmd: string, args: string[] = ["--version"]) {
  const result = runCmd(cmd, args);
  return result.status === 0;
}

function runCowl(
  args: string[],
  options: { cwd: string; home: string }
) {
  const env = {
    ...process.env,
    HOME: options.home,
    USERPROFILE: options.home,
  };
  return runCmd(bunBin, [cliPath, ...args], { cwd: options.cwd, env });
}

function createSandbox(options?: { homeName?: string; sourceName?: string }) {
  const root = mkdtempSync(join(os.tmpdir(), "cowl-test-"));
  const home = join(root, options?.homeName ?? "home");
  const source = join(root, options?.sourceName ?? "source");
  mkdirSync(home, { recursive: true });
  mkdirSync(source, { recursive: true });
  return {
    root,
    home,
    source,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function parsePushd(output: string): string {
  const trimmed = output.trim();
  const prefix = "pushd -- ";
  if (!trimmed.startsWith(prefix)) {
    throw new Error(`Unexpected pushd output: ${trimmed}`);
  }
  const raw = trimmed.slice(prefix.length);
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/'\\''/g, "'");
  }
  return raw;
}

const rsyncAvailable = commandAvailable("rsync");
const gitAvailable = commandAvailable("git");
const testRsync = rsyncAvailable ? test : test.skip;
const testGit = gitAvailable ? test : test.skip;

test("new creates variation and helpers work", () => {
  const sandbox = createSandbox({
    homeName: "home space",
    sourceName: "source space",
  });
  try {
    writeFileSync(join(sandbox.source, "hello.txt"), "hello");

    const result = runCowl(["new", "cozy-otter"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(result.status).toBe(0);
    const variationPath = result.stdout.trim();
    expect(existsSync(variationPath)).toBe(true);
    expect(readFileSync(join(variationPath, "hello.txt"), "utf8")).toBe(
      "hello"
    );

    const metaPath = join(sandbox.home, ".local", "share", "cowl", "meta", `${createHash("sha256").update(variationPath).digest("hex").slice(0, 16)}.json`);
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    expect(meta.sourcePath).toBe(realpathSync(sandbox.source));

    const name = basename(variationPath);
    const pathResult = runCowl(["path", name], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(pathResult.status).toBe(0);
    expect(pathResult.stdout.trim()).toBe(variationPath);

    const cdResult = runCowl(["cd", name], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(cdResult.status).toBe(0);
    expect(cdResult.stdout.trim()).toBe(
      `pushd -- ${shellEscape(variationPath)}`
    );

    const listResult = runCowl(["list"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(listResult.status).toBe(0);
    expect(listResult.stdout).toContain(variationPath);

    const rootResult = runCowl(["root"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(rootResult.status).toBe(0);
    const rootPath = rootResult.stdout.trim();
    expect(existsSync(rootPath)).toBe(true);

    const infoResult = runCowl(["info", name, "--no-color"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(infoResult.status).toBe(0);
    expect(infoResult.stdout).toContain(`Name: ${name}`);
    expect(infoResult.stdout).toContain(`Path: ${variationPath}`);

    const statusResult = runCowl(["status", name, "--no-color"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(statusResult.status).toBe(0);
    expect(statusResult.stdout.trim()).toBe("no-git");

    const newCd = runCowl(["new", "--cd"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(newCd.status).toBe(0);
    const newCdPath = parsePushd(newCd.stdout);
    expect(existsSync(newCdPath)).toBe(true);
  } finally {
    sandbox.cleanup();
  }
});

test("shell snippet and install-shell work", () => {
  const sandbox = createSandbox();
  try {
    const snippet = runCowl(["shell", "--shell", "zsh"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(snippet.status).toBe(0);
    expect(snippet.stdout).toContain("cowl()");
    expect(snippet.stdout).toContain("pushd --");

    const install = runCowl(["install-shell", "--shell", "zsh"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(install.status).toBe(0);

    const rcPath = join(sandbox.home, ".zshrc");
    const content = readFileSync(rcPath, "utf8");
    expect(content).toContain("cowl()");

    const reinstall = runCowl(["install-shell", "--shell", "zsh"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(reinstall.status).toBe(0);
    const contentAgain = readFileSync(rcPath, "utf8");
    const startCount = (contentAgain.match(/cowl shell >>>/g) ?? []).length;
    expect(startCount).toBe(1);

    const uninstall = runCowl(["uninstall-shell", "--shell", "zsh"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(uninstall.status).toBe(0);
    const afterRemove = readFileSync(rcPath, "utf8");
    expect(afterRemove).not.toContain("cowl shell >>>");
  } finally {
    sandbox.cleanup();
  }
});

testRsync("merge (rsync) updates files and cleans by default", () => {
  const sandbox = createSandbox();
  try {
    writeFileSync(join(sandbox.source, "keep.txt"), "keep");
    writeFileSync(join(sandbox.source, "gone.txt"), "gone");

    const created = runCowl(["new", "rsync-merge"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(created.status).toBe(0);
    const variationPath = created.stdout.trim();

    writeFileSync(join(variationPath, "keep.txt"), "updated");
    rmSync(join(variationPath, "gone.txt"));
    writeFileSync(join(variationPath, "new.txt"), "new");

    const merged = runCowl(["merge", "rsync-merge"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(merged.status).toBe(0);

    expect(readFileSync(join(sandbox.source, "keep.txt"), "utf8")).toBe(
      "updated"
    );
    expect(existsSync(join(sandbox.source, "new.txt"))).toBe(true);
    expect(existsSync(join(sandbox.source, "gone.txt"))).toBe(true);
    expect(existsSync(variationPath)).toBe(false);
  } finally {
    sandbox.cleanup();
  }
});

testRsync("merge (rsync) deletes when --delete", () => {
  const sandbox = createSandbox();
  try {
    writeFileSync(join(sandbox.source, "keep.txt"), "keep");
    writeFileSync(join(sandbox.source, "gone.txt"), "gone");

    const created = runCowl(["new", "rsync-delete"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(created.status).toBe(0);
    const variationPath = created.stdout.trim();

    rmSync(join(variationPath, "gone.txt"));

    const merged = runCowl(["merge", "rsync-delete", "--delete"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(merged.status).toBe(0);

    expect(existsSync(join(sandbox.source, "gone.txt"))).toBe(false);
    expect(existsSync(variationPath)).toBe(false);
  } finally {
    sandbox.cleanup();
  }
});

testGit("merge --branch creates branch in git repo", () => {
  const sandbox = createSandbox();
  try {
    const init = runCmd("git", ["init"], { cwd: sandbox.source });
    expect(init.status).toBe(0);
    runCmd("git", ["config", "user.email", "cowl@example.com"], {
      cwd: sandbox.source,
    });
    runCmd("git", ["config", "user.name", "Cowl Test"], {
      cwd: sandbox.source,
    });

    writeFileSync(join(sandbox.source, "tracked.txt"), "base");
    runCmd("git", ["add", "tracked.txt"], { cwd: sandbox.source });
    const commit = runCmd("git", ["commit", "-m", "base"], {
      cwd: sandbox.source,
    });
    expect(commit.status).toBe(0);

    const created = runCowl(["new", "git-merge"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(created.status).toBe(0);
    const variationPath = created.stdout.trim();

    writeFileSync(join(variationPath, "tracked.txt"), "changed");

    const merged = runCowl(["merge", "git-merge", "--branch"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(merged.status).toBe(0);

    expect(readFileSync(join(sandbox.source, "tracked.txt"), "utf8")).toBe(
      "changed"
    );

    const branch = runCmd(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: sandbox.source }
    );
    expect(branch.status).toBe(0);
    expect(branch.stdout.trim()).toBe("cowl/git-merge");
    expect(existsSync(variationPath)).toBe(false);

    runCmd("git", ["add", "tracked.txt"], { cwd: sandbox.source });
    const commit2 = runCmd("git", ["commit", "-m", "merge one"], {
      cwd: sandbox.source,
    });
    expect(commit2.status).toBe(0);

    const created2 = runCowl(["new", "git-merge-2"], {
      cwd: sandbox.source,
      home: sandbox.home,
    });
    expect(created2.status).toBe(0);
    const variationPath2 = created2.stdout.trim();
    writeFileSync(join(variationPath2, "tracked.txt"), "changed-again");

    const merged2 = runCowl(
      ["merge", "git-merge-2", "--branch", "feature/cowl-merge"],
      {
        cwd: sandbox.source,
        home: sandbox.home,
      }
    );
    expect(merged2.status).toBe(0);
    const branch2 = runCmd(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: sandbox.source }
    );
    expect(branch2.status).toBe(0);
    expect(branch2.stdout.trim()).toBe("feature/cowl-merge");
    expect(existsSync(variationPath2)).toBe(false);
  } finally {
    sandbox.cleanup();
  }
});
