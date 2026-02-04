# cowl

Copy-on-write variations for a directory. `cowl` makes a CoW clone into a global workspace and helps you jump into it and merge changes back.

## Install

- Install via npm:

```bash
npm install -g @monotykamary/cowl
```

- Install via bun:

```bash
bun install -g @monotykamary/cowl
```

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

Show the project root for the current directory:

```bash
cowl root
```

Inspect a variation:

```bash
cowl info <name>
```

Check a variation's git status:

```bash
cowl status <name>
```

Merge changes back into the current directory (default: cleans up the variation):

```bash
cowl merge <name>
```

Merge into a new branch in the source repo:

```bash
cowl merge <name> --branch
```

Merge into a specific branch name:

```bash
cowl merge <name> --branch feature/cowl-merge
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

- Variations live in `~/.local/share/cowl/<basename>-<hash>/<variation>` (XDG Base Directory compliant).
- `cowl new` uses the current directory as the source.
- Git merge: if the source directory is a git repo root, merge uses git 3-way apply and syncs untracked files.
- `cowl merge --branch` creates or switches to `cowl/<variation>` in the source repo.
- Rsync merge: if git is unavailable, merge uses rsync; deletions are opt-in with `--delete`.
- Use `--no-color` or `NO_COLOR=1` to disable ANSI formatting.

### Context Awareness

When you run commands from within a variation directory, cowl automatically detects this and works with the source directory:

```bash
cowl whereami   # Show current context (variation or source)
cowl host       # Print source directory path when in a variation
cowl cd host    # Navigate back to source from a variation
cowl list       # List variations (works from within variation too)
```

## Commands

- `cowl new [name] [--cd]` - Create a new variation
- `cowl cd <name>|host` - Navigate to a variation or back to source
- `cowl path <name>` - Print variation path
- `cowl list [--all]` - List variations for current project
- `cowl root` - Show project root directory
- `cowl info <name>` - Show variation details
- `cowl status <name>` - Check variation git status
- `cowl whereami` - Show current context
- `cowl host` - Print source path (when in variation)
- `cowl doctor` - Diagnose CoW support and system configuration
- `cowl shell [--shell zsh|bash|fish]` - Print shell integration snippet
- `cowl install-shell [--shell zsh|bash|fish] [--rc path]` - Install shell wrapper
- `cowl uninstall-shell [--shell zsh|bash|fish] [--rc path]` - Remove shell wrapper
- `cowl merge <name> [--dry-run] [--keep] [--delete] [--branch [name]]` - Merge changes back
- `cowl clean <name>` - Delete a variation

## Known Limitations

### Enterprise Security Software (EDR)

**Issue**: When using cowl on machines with endpoint detection and response (EDR) software like CrowdStrike, `cowl new` may be significantly slower than expected, even though Copy-on-Write is technically working.

**Why**: cowl copies the entire directory including all files (e.g., `node_modules/`, build artifacts), while git worktrees only checkout tracked source files. With 5,000+ files in a typical project:

- Git worktree: ~20 files (source code only)
- cowl variation: ~5,000+ files (including node_modules)

Each file operation triggers EDR scanning hooks. With 10ms scan latency per file:
- Git worktree: 20 × 10ms = 0.2 seconds ✅
- cowl: 5,000 × 10ms = **50+ seconds** ❌

**Workaround**: 
- Use git worktrees for quick branches where you don't need full environment isolation
- Use cowl when you need complete isolation (different dependency versions, experimental changes)
- Accept the slower creation time as the cost of complete isolation

**Verify CoW is working**: Run `cowl doctor` to test CoW support and see if your system supports it properly.
