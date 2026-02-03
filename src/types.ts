export type Meta = {
  version: 1;
  name: string;
  project: string;
  sourcePath: string;
  variationPath: string;
  createdAt: string;
  gitBase?: string;
};

export type ShellName = "bash" | "fish" | "zsh";

export type ParsedArgs = {
  flags: Set<string>;
  options: Record<string, string>;
  positionals: string[];
};

export type VariationContext =
  | {
      inVariation: true;
      variationPath: string;
      variationName: string;
      sourcePath: string;
    }
  | {
      inVariation: false;
      variationPath: null;
      variationName: null;
      sourcePath: string;
    };

export type RepoStatus =
  | {
      state: "clean" | "dirty" | "no-git";
      count?: number;
    }
  | {
      state: "error";
      error: string;
    };

export type CowlCommand = {
  cmd: string;
  args: string[];
};
