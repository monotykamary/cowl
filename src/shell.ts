import { dirname, join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { SHELL_MARKER_START, SHELL_MARKER_END } from "./constants.js";
import type { ShellName, CowlCommand } from "./types.js";
import {
  detectShellName,
  expandHome,
  defaultRcPath,
  shellEscape,
  ensureDir,
  fail,
  run,
} from "./utils.js";

export function shellSnippet(shellName: ShellName, cowlCmd: CowlCommand): string {
  const escapedCmd = shellEscape(cowlCmd.cmd);
  const escapedArgs = cowlCmd.args.map((arg) => shellEscape(arg)).join(" ");

  if (shellName === "fish") {
    return `${SHELL_MARKER_START}
function cowl
  if test (count $argv) -ge 1; and test $argv[1] = "new"
    set -l args $argv
    set -e args[1]
    set -l path (${escapedCmd} ${escapedArgs} new $args | string collect | string trim)
    or return $status
    pushd -- $path
  else
    ${escapedCmd} ${escapedArgs} $argv
  end
end
${SHELL_MARKER_END}`;
  }

  return `${SHELL_MARKER_START}
cowl() {
  if [ "$1" = "new" ]; then
    shift
    local path
    path="$(${escapedCmd} ${escapedArgs} new "$@")" || return
    pushd -- "$path"
  else
    ${escapedCmd} ${escapedArgs} "$@"
  fi
}
${SHELL_MARKER_END}`;
}

export function resolveShellName(
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

export function getCowlCommand(): CowlCommand {
  const execPath = process.execPath;

  // Find the cowl script using type -P (bypasses shell functions)
  const result = run("bash", ["-c", "type -P cowl 2>/dev/null || echo \"\""]);
  if (result.status === 0) {
    const path = result.stdout.trim();
    // Make sure it's a file path, not a function definition
    if (path && path.startsWith("/") && existsSync(path)) {
      // If it's a script file, we need to run it with the runtime
      const firstLine = readFileSync(path, "utf8").split("\n")[0] || "";
      if (firstLine.startsWith("#!") || path.endsWith(".ts") || path.endsWith(".js")) {
        return { cmd: execPath, args: [path] };
      }
      // Otherwise it's likely a shell script wrapper, just run it directly
      return { cmd: path, args: [] };
    }
  }

  // Fallback: try to use the current script path
  const scriptPath = process.argv[1];
  if (scriptPath && existsSync(scriptPath)) {
    return { cmd: execPath, args: [scriptPath] };
  }

  // Last resort: hope the command is in PATH
  return { cmd: execPath, args: ["cowl"] };
}

export function cmdShell(
  options: Record<string, string>,
  flags: Set<string>,
  getCowlCmd: () => CowlCommand
) {
  const shellName = resolveShellName(options, flags);
  console.log(shellSnippet(shellName, getCowlCmd()));
}

export function cmdInstallShell(
  options: Record<string, string>,
  flags: Set<string>,
  getCowlCmd: () => CowlCommand
) {
  const shellName = resolveShellName(options, flags);
  const rcPath = expandHome(options.rc ?? defaultRcPath(shellName));
  ensureDir(dirname(rcPath));

  const cowlPath = getCowlCmd();
  const snippet = shellSnippet(shellName, cowlPath);
  const existing = existsSync(rcPath) ? readFileSync(rcPath, "utf8") : "";
  if (existing.includes(SHELL_MARKER_START) && existing.includes(SHELL_MARKER_END)) {
    console.log(`Shell integration already installed in ${rcPath}`);
    return;
  }
  const needsNewline = existing.length > 0 && !existing.endsWith("\n");
  const content = `${existing}${needsNewline ? "\n" : ""}${snippet}\n`;
  writeFileSync(rcPath, content);
  console.log(`Installed shell integration in ${rcPath}`);
}

export function cmdUninstallShell(
  options: Record<string, string>,
  flags: Set<string>
) {
  const shellName = resolveShellName(options, flags);
  const rcPath = expandHome(options.rc ?? defaultRcPath(shellName));
  if (!existsSync(rcPath)) {
    console.log(`Shell config not found: ${rcPath}`);
    return;
  }
  const existing = readFileSync(rcPath, "utf8");
  const startIndex = existing.indexOf(SHELL_MARKER_START);
  const endIndex = existing.indexOf(SHELL_MARKER_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    console.log(`Shell integration not found in ${rcPath}`);
    return;
  }
  const afterEnd = endIndex + SHELL_MARKER_END.length;
  let updated = `${existing.slice(0, startIndex)}${existing.slice(afterEnd)}`;
  updated = updated.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
  writeFileSync(rcPath, updated);
  console.log(`Removed shell integration from ${rcPath}`);
}
