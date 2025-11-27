# Fork Maintenance Guide

This is a fork of [GitHub Desktop](https://github.com/desktop/desktop) with WSL integration and LMS branding.

## Initial Setup (One-Time)

Configure git to always use rebase when pulling. This prevents merge commits and duplicate commit issues:

```bash
git config pull.rebase true
```

## Syncing with Origin

Before syncing with upstream, always pull your latest changes from origin using rebase:

```bash
git pull --rebase origin development
```

## Syncing with Upstream

To pull the latest changes from the official GitHub Desktop repository:

```bash
# Fetch latest upstream changes
git fetch upstream

# Rebase your changes on top of upstream
git rebase upstream/development

# If conflicts occur, resolve them and continue
git rebase --continue

# Push the updated history
git push origin development --force-with-lease
```

## Avoiding Duplicate Commits

**Never use `git pull` without `--rebase`** when working directly on `development`. Using regular `git pull` creates merge commits that duplicate your commit history.

If you accidentally create duplicates (you'll see a merge commit like "Merge branch 'development' of ... into development"):

```bash
# Create a backup
git branch backup-branch

# Find the commit before the merge
git log --oneline --graph

# Reset to that commit
git reset --hard <commit-hash>

# Force push
git push origin development --force-with-lease
```

## Key Modifications

This fork adds:
- WSL path detection and conversion utilities
- WSL-aware external editor integration
- WSL shell support
- LMS GitHub Desktop branding

## Remotes

- **Upstream**: `https://github.com/desktop/desktop.git` (official GitHub Desktop)
- **Origin**: `https://github.com/LeoManrique/lms-github-desktop.git` (this fork)

Verify with: `git remote -v`
