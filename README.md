# cowl

Copy-on-write variations for a directory. `cowl` makes a CoW clone into a global workspace and helps you jump into it and merge changes back.

## Install

- Build a standalone binary:

```bash
bun run build
```

The binary is at `dist/cowl`.

## Usage

Create a variation and jump to it:

```bash
pushd -- "$(cowl new)"
```

Or use eval for built-in pushd output:

```bash
eval "$(cowl new --cd)"
```

If you want to jump to an existing variation:

```bash
eval "$(cowl cd <name>)"
```

List variations for the current project:

```bash
cowl list
```

Merge changes back into the current directory (default: cleans up the variation):

```bash
cowl merge <name>
```

Keep the variation after merging:

```bash
cowl merge <name> --keep
```

Dry run merge:

```bash
cowl merge <name> --dry-run
```

Delete a variation:

```bash
cowl clean <name>
```

## Behavior

- Variations live in `~/.cowl/<basename>-<hash>/<variation>`.
- `cowl new` uses the current directory as the source.
- Git merge: if the source directory is a git repo root, merge uses git 3-way apply and syncs untracked files.
- Rsync merge: if git is unavailable, merge uses rsync; deletions are opt-in with `--delete`.

## Commands

- `cowl new [name] [--cd]`
- `cowl cd <name>`
- `cowl path <name>`
- `cowl list [--all]`
- `cowl merge <name> [--dry-run] [--keep] [--delete]`
- `cowl clean <name>`

