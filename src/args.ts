import type { ParsedArgs } from "./types.js";
import { fail } from "./utils.js";

export function parseArgs(args: string[]): ParsedArgs {
  const flags = new Set<string>();
  const options: Record<string, string> = {};
  const positionals: string[] = [];
  const valueOptions = new Set(["shell", "rc", "branch"]);
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
          if (key === "branch") {
            flags.add(key);
            continue;
          }
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
