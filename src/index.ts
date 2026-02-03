#!/usr/bin/env bun
import { setColorEnabled } from "./utils.js";
import { parseArgs } from "./args.js";
import { detectVariationContext } from "./meta.js";
import { getCowlCommand } from "./shell.js";
import {
  cmdShell,
  cmdInstallShell,
  cmdUninstallShell,
} from "./shell.js";
import {
  cmdNew,
  cmdCd,
  cmdWhereami,
  cmdHost,
  cmdMerge,
  cmdDoctor,
} from "./commands.js";
import {
  cmdList,
  cmdInfo,
  cmdStatus,
  cmdClean,
  cmdRoot,
  cmdPath,
} from "./variations.js";
import { fail } from "./utils.js";

function printHelp() {
  console.log(`cowl: copy-on-write variations for a directory

Usage:
  cowl new [name] [--cd]
  cowl cd <name>|host
  cowl path <name>
  cowl list [--all]
  cowl root
  cowl info <name>
  cowl status <name>
  cowl whereami
  cowl host
  cowl doctor
  cowl shell [--shell zsh|bash|fish]
  cowl install-shell [--shell zsh|bash|fish] [--rc path]
  cowl uninstall-shell [--shell zsh|bash|fish] [--rc path]
  cowl merge <name> [--dry-run] [--keep] [--delete] [--branch [name]]
  cowl clean <name>

Notes:
  - Use eval for pushd output, or compose: pushd -- "$(cowl new)".
  - cd host: navigate from variation back to source directory.
  - whereami: show current context (variation or source directory).
  - host: print source directory path (when in a variation).
  - doctor: diagnose CoW support and system configuration.
  - merge uses git when the current directory is a repo root.
  - merge cleans the variation by default; use --keep to retain it.
  - merge --branch creates or switches to cowl/<variation> (git only).
  - install-shell adds a wrapper so cowl new runs pushd automatically.
  - uninstall-shell removes the wrapper block from your shell rc file.
  - use --no-color to disable ANSI formatting.
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const command = args[0];
  const parsed = parseArgs(args.slice(1));
  if (parsed.flags.has("no-color")) {
    setColorEnabled(false);
  } else if (parsed.flags.has("color")) {
    setColorEnabled(true);
  }

  // Get source path with context awareness
  const ctx = detectVariationContext();
  const sourcePath = ctx.inVariation ? ctx.sourcePath : process.cwd();

  switch (command) {
    case "new":
      cmdNew(parsed.flags, parsed.positionals, sourcePath);
      break;
    case "path":
      cmdPath(parsed.positionals[0], sourcePath);
      break;
    case "cd":
      cmdCd(parsed.positionals, sourcePath);
      break;
    case "list":
      cmdList(parsed.flags, sourcePath);
      break;
    case "root":
      cmdRoot(sourcePath);
      break;
    case "info":
      cmdInfo(parsed.positionals[0], sourcePath);
      break;
    case "status":
      cmdStatus(parsed.positionals[0], sourcePath);
      break;
    case "whereami":
      cmdWhereami();
      break;
    case "host":
      cmdHost();
      break;
    case "doctor":
      cmdDoctor();
      break;
    case "shell":
      cmdShell(parsed.options, parsed.flags, getCowlCommand);
      break;
    case "install-shell":
      cmdInstallShell(parsed.options, parsed.flags, getCowlCommand);
      break;
    case "uninstall-shell":
      cmdUninstallShell(parsed.options, parsed.flags);
      break;
    case "clean":
    case "rm":
      cmdClean(parsed.positionals[0], sourcePath);
      break;
    case "merge":
      cmdMerge(parsed.flags, parsed.options, parsed.positionals, sourcePath);
      break;
    case "help":
      printHelp();
      break;
    default:
      fail(`Unknown command: ${command}`);
  }
}

main();
