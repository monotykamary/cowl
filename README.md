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

## Shell Integration (Optional)

Install a shell wrapper that makes `cowl new` run `pushd` automatically:

```bash
cowl install-shell --shell zsh
```

Then reload your shell config or open a new terminal.

If you want to preview the snippet instead of installing it:

```bash
cowl shell --shell zsh
```

Remove the wrapper:

```bash
cowl uninstall-shell --shell zsh
```

List variations for the current project:

```bash
cowl list
```

Merge changes back into the current directory (default: cleans up the variation):

```bash
cowl merge <name>
```

Merge into a new branch in the source repo:

```bash
cowl merge <name> --branch
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
- `cowl merge --branch` creates or switches to `cowl/<variation>` in the source repo.
- Rsync merge: if git is unavailable, merge uses rsync; deletions are opt-in with `--delete`.

## Commands

- `cowl new [name] [--cd]`
- `cowl cd <name>`
- `cowl path <name>`
- `cowl list [--all]`
- `cowl shell [--shell zsh|bash|fish]`
- `cowl install-shell [--shell zsh|bash|fish] [--rc path]`
- `cowl uninstall-shell [--shell zsh|bash|fish] [--rc path]`
- `cowl merge <name> [--dry-run] [--keep] [--delete] [--branch]`
- `cowl clean <name>`
