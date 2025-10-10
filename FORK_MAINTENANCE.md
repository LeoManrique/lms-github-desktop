# Fork Maintenance Guide

This is a fork of [GitHub Desktop](https://github.com/desktop/desktop) with WSL integration and LMS branding.

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
