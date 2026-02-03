import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { META_DIR } from "./constants.js";
import type { Meta, VariationContext } from "./types.js";
import { ensureDir } from "./utils.js";

export function getMetaPath(variationPath: string): string {
  const hash = createHash("sha256").update(variationPath).digest("hex").slice(0, 16);
  return join(META_DIR, `${hash}.json`);
}

export function readMeta(variationPath: string): Meta | null {
  const metaPath = getMetaPath(variationPath);
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

export function writeMeta(variationPath: string, meta: Meta) {
  ensureDir(META_DIR);
  const metaPath = getMetaPath(variationPath);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

export function deleteMeta(variationPath: string) {
  const metaPath = getMetaPath(variationPath);
  if (existsSync(metaPath)) {
    rmSync(metaPath);
  }
}

export function findVariationByPath(cwd: string): { variationPath: string; meta: Meta } | null {
  if (!existsSync(META_DIR)) {
    return null;
  }

  const files = readdirSync(META_DIR, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith(".json")
  );

  for (const file of files) {
    try {
      const metaPath = join(META_DIR, file.name);
      const raw = readFileSync(metaPath, "utf8");
      const meta = JSON.parse(raw) as Meta;
      // Check if cwd is the variation or inside it
      if (cwd === meta.variationPath || cwd.startsWith(meta.variationPath + "/")) {
        return { variationPath: meta.variationPath, meta };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function detectVariationContext(): VariationContext {
  const cwd = process.cwd();

  // Check if we're in a variation directory using centralized meta
  const variationInfo = findVariationByPath(cwd);
  if (variationInfo) {
    return {
      inVariation: true,
      variationPath: variationInfo.variationPath,
      variationName: variationInfo.meta.name,
      sourcePath: variationInfo.meta.sourcePath,
    };
  }

  return {
    inVariation: false,
    variationPath: null,
    variationName: null,
    sourcePath: cwd,
  };
}
