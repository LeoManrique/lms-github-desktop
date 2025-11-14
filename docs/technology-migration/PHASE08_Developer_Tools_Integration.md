# Phase 8: Developer Tools Integration

## Overview

Integrates with external developer tools: text editors, shell/terminal, diff tools, merge tools, and SSH key management.

## Prerequisites

- Phases 1-6 completed

## Technology-Agnostic Requirements

### 1. External Editor Integration

**Reference:** `app/src/lib/editors/`

#### 1.1 Supported Editors

**Detect installed editors:**
- Visual Studio Code
- VS Code Insiders
- Atom
- Sublime Text
- Vim/Neovim
- Emacs
- JetBrains IDEs (WebStorm, IntelliJ, PyCharm, etc.)
- TextMate (macOS)
- Notepad++ (Windows)
- And 20+ more

**Detection Method:**
- **macOS:** Check `/Applications/`, `~/Applications/`
- **Windows:** Check registry, common install paths
- **Linux:** Check `PATH`, `/usr/bin/`, `/usr/local/bin/`, snap/flatpak

**Reference:** `app/src/lib/editors/darwin.ts`, `win32.ts`, `linux.ts`

#### 1.2 Open File in Editor

**Function:**
```typescript
async function launchExternalEditor(
  path: string,
  editor: ExternalEditor
): Promise<void>
```

**Implementation:**

**VS Code:**
```bash
code --goto <file>:<line>
```

**Sublime:**
```bash
subl <file>:<line>
```

**Atom:**
```bash
atom <file>:<line>
```

**Vim:**
```bash
vim +<line> <file>
```

**Line Number Support:**
Open file at specific line (e.g., conflict marker line).

#### 1.3 Editor Preferences

**Settings:**
- Selected editor from dropdown
- Custom editor path (if not auto-detected)
- Default editor for conflicts

**Storage:**
localStorage or preferences file

### 2. Shell Integration

**Reference:** `app/src/lib/shells/`

#### 2.1 Supported Shells

**Detect:**
- bash
- zsh
- fish
- PowerShell
- PowerShell Core (pwsh)
- cmd (Windows)
- Windows Terminal
- iTerm2 (macOS)
- Terminal.app (macOS)

**Detection:**
- Parse user's default shell from system
- Check installed terminal applications

#### 2.2 Open Repository in Shell

**Function:**
```typescript
async function openShell(
  path: string,
  shell: Shell
): Promise<void>
```

**Implementation:**

**macOS:**
```bash
open -a Terminal.app <path>
open -a iTerm.app <path>
```

**Windows:**
```powershell
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '<path>'"
```

**Linux:**
```bash
gnome-terminal --working-directory=<path>
```

#### 2.3 Shell Environment

**Reference:** `app/src/lib/shell.ts`

**Fix PATH:**
On macOS, apps launched via Finder don't inherit shell PATH.

**Solution:**
Read PATH from user's shell:
```bash
/bin/bash -l -c 'echo $PATH'
```

Apply to git subprocess environment.

### 3. Diff Tool Integration

**Configure external diff tool:**

**Git Config:**
```bash
git config diff.tool <tool-name>
git config difftool.<tool-name>.cmd '<command>'
```

**Supported Tools:**
- Beyond Compare
- KDiff3
- Meld
- P4Merge
- Araxis Merge
- DiffMerge
- VS Code
- Custom command

**Launch Diff:**
```bash
git difftool <file>
```

### 4. Merge Tool Integration

**Configure external merge tool for conflicts:**

**Git Config:**
```bash
git config merge.tool <tool-name>
git config mergetool.<tool-name>.cmd '<command>'
```

**Launch Merge Tool:**
```bash
git mergetool <conflicted-file>
```

**Process:**
1. User clicks "Resolve in Merge Tool"
2. Launch configured tool
3. Tool shows 3-way merge (base, ours, theirs)
4. User resolves
5. Tool saves resolved file
6. Stage file automatically

### 5. SSH Key Management

**Reference:** `app/src/ui/ssh/`

#### 5.1 SSH Key Detection

**Check for keys:**
```bash
ls ~/.ssh/
```

**Common keys:**
- `id_rsa` / `id_rsa.pub` (RSA)
- `id_ecdsa` / `id_ecdsa.pub` (ECDSA)
- `id_ed25519` / `id_ed25519.pub` (Ed25519)

#### 5.2 SSH Passphrase Dialog

**Reference:** `app/src/ui/ssh/ssh-key-passphrase.tsx`

**When:** Git operation requires SSH key with passphrase

**Flow:**
1. Git requests passphrase via askpass helper
2. Desktop shows passphrase dialog
3. User enters passphrase
4. Send to git subprocess
5. Remember in session (optional)

**Trampoline Pattern:**
Desktop sets `GIT_SSH_COMMAND` to custom helper that prompts via IPC.

**Reference:** `app/src/lib/trampoline/`

#### 5.3 Add SSH Host

**Reference:** `app/src/ui/ssh/add-ssh-host.tsx`

**When:** Connecting to new SSH host

**Flow:**
1. Git shows host fingerprint
2. Desktop asks user to verify
3. User confirms
4. Add to `~/.ssh/known_hosts`

#### 5.4 SSH User/Password

**For HTTPS with SSH credentials:**

**Dialog:** `app/src/ui/ssh/ssh-user-password.tsx`

Prompt for username and password, send to git via credential helper.

### 6. Git Configuration UI

**Reference:** `app/src/ui/preferences/git.tsx`

**Settings:**

**User Identity:**
- Name (global or per-repo)
- Email (global or per-repo)

**Ignored Files:**
- Global gitignore path

**External Tools:**
- Default editor
- Default shell
- Diff tool
- Merge tool

**Behavior:**
- Auto-fetch interval
- Prune on fetch
- Confirm discard changes
- Confirm force push

**Advanced:**
- Line endings (autocrlf)
- File mode
- Safe directory

### 7. CLI Installation (macOS/Windows)

**Reference:** `app/src/ui/cli-installed/`

#### macOS

**Install:**
Create symlink:
```bash
ln -s "/Applications/GitHub Desktop.app/Contents/Resources/app/static/github.sh" /usr/local/bin/github
```

**Usage:**
```bash
github <path>  # Open repository in Desktop
```

#### Windows

**Install:**
Add to PATH:
```powershell
$env:PATH += ";C:\Program Files\GitHub Desktop\resources\app\static"
```

**Usage:**
```cmd
github <path>
```

### 8. LFS (Large File Storage)

**Reference:** `app/src/lib/git/lfs.ts`, `app/src/ui/lfs/`

#### 8.1 Detect LFS

**Check if repository uses LFS:**
```bash
git lfs ls-files
```

If `.gitattributes` contains `filter=lfs`, LFS is configured.

#### 8.2 Initialize LFS

**Dialog:** `app/src/ui/lfs/initialize-lfs.tsx`

**Install LFS Hooks:**
```bash
git lfs install
```

**Track Files:**
```bash
git lfs track "*.psd"
git lfs track "*.mp4"
```

Updates `.gitattributes`.

#### 8.3 Attribute Mismatch Warning

**Dialog:** `app/src/ui/lfs/attribute-mismatch.tsx`

**When:** File tracked by LFS but not in `.gitattributes`

**Fix:**
```bash
git lfs migrate import --include="*.psd"
```

### 9. .gitignore Management

**Reference:** `app/src/lib/git/gitignore.ts`

#### 9.1 Ignore File

**Right-click file → Ignore:**
```typescript
async function appendIgnoreRule(
  repository: Repository,
  pattern: string
): Promise<void>
```

**Appends to `.gitignore`:**
```
<pattern>
```

**Patterns:**
- Specific file: `config.local.js`
- Extension: `*.log`
- Directory: `node_modules/`

#### 9.2 Ignore All

**Ignore all files of type:**
```
*.env
```

#### 9.3 Global Gitignore

**User-level ignore file:**

**Location:**
- macOS/Linux: `~/.gitignore_global`
- Windows: `%USERPROFILE%\.gitignore_global`

**Configure:**
```bash
git config --global core.excludesfile ~/.gitignore_global
```

## Success Criteria

1. ✅ Detect and launch external editors
2. ✅ Open repository in shell/terminal
3. ✅ Configure and launch diff tool
4. ✅ Configure and launch merge tool
5. ✅ SSH key passphrase prompting
6. ✅ SSH host verification
7. ✅ Git configuration UI
8. ✅ CLI installation (macOS/Windows)
9. ✅ LFS initialization and management
10. ✅ .gitignore management

## Key Files

```
app/src/lib/
  ├── editors/
  │   ├── darwin.ts
  │   ├── win32.ts
  │   └── linux.ts
  ├── shells/
  ├── git/
  │   ├── lfs.ts
  │   └── gitignore.ts
  └── trampoline/

app/src/ui/
  ├── preferences/
  ├── ssh/
  ├── lfs/
  ├── cli-installed/
  └── editor/
```

## Estimated Complexity

**Time:** 5-7 days
**Difficulty:** Medium

## Dependencies

- Phases 1-6

## Next Phase

Phase 9: AI Commit Message Generation
