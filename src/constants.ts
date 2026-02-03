import { join } from "path";
import os from "os";

// XDG Base Directory compliance
// Data goes to $XDG_DATA_HOME/cowl (default: ~/.local/share/cowl)
export function getCowlDataDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return join(xdgDataHome, "cowl");
  }
  return join(os.homedir(), ".local", "share", "cowl");
}

export const COWL_ROOT = getCowlDataDir();
export const META_DIR = join(COWL_ROOT, "meta");
export const SHELL_MARKER_START = "# >>> cowl shell >>>";
export const SHELL_MARKER_END = "# <<< cowl shell <<<";

export const ADJECTIVES = [
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

export const NOUNS = [
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
