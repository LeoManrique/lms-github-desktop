# Phase 2: Core Git Operations

## Overview

This phase implements the fundamental Git operations that form the core functionality of the application. It builds on Phase 1's IPC foundation to provide repository management, file staging, committing, branching, and syncing with remotes. This phase creates a minimal but functional Git client (MVP).

## Prerequisites

- Phase 1 completed (IPC, window management, basic app structure)

## Technology-Agnostic Requirements

### 1. Git Execution Layer

Implement a wrapper around Git command-line execution that provides:

#### Core Git Execution Function

**Reference:** `app/src/lib/git/core.ts:1-150`

**Type Signature:**
```typescript
function git(
  args: string[],
  path: string,
  name: string,
  options?: IGitExecutionOptions
): Promise<IGitResult>
```

**Execution Options Interface** (reference: `app/src/lib/git/core.ts:45-67`):
```typescript
{
  successExitCodes?: ReadonlySet<number>  // Which exit codes = success (default: 0)
  expectedErrors?: ReadonlySet<GitError>  // Expected error types
  stdin?: string | Buffer                 // Input to pass to git command
  env?: Record<string, string>            // Environment variables
  processCallback?: (process) => void     // Access to child process
  trackLFSProgress?: boolean              // Monitor LFS operations
  isBackgroundTask?: boolean              // Background vs foreground
}
```

**Result Interface** (reference: `app/src/lib/git/core.ts:73-90`):
```typescript
{
  stdout: string | Buffer
  stderr: string | Buffer
  exitCode: number
  gitError: GitError | null              // Parsed error type
  gitErrorDescription: string | null      // Human-readable error
  path: string                            // Execution directory
}
```

**Requirements:**
1. **Execute git in subprocess** - Spawn git command with proper environment
2. **Environment setup** - Set `GIT_DIR`, `GIT_WORK_TREE`, `GIT_EXEC_PATH` as needed
3. **Error parsing** - Parse git stderr into structured error types
4. **Progress tracking** - Parse git progress output for long operations (clone, fetch, push)
5. **Timeout handling** - Kill long-running operations if needed
6. **Credential handling** - Integrate with credential helper (see Phase 1 trampoline)
7. **Encoding support** - Handle both string and buffer output

**Git Location:**
- Bundle git binary with application OR
- Detect system git installation
- This implementation bundles git: `app/src/ui/index.tsx:93` sets `LOCAL_GIT_DIRECTORY`
- Uses Dugite library (Node.js wrapper for git) - reference: `package.json` dugite@3.0.0

### 2. Repository Model

Define core repository data structure.

**Reference:** `app/src/models/repository.ts:30-80`

```typescript
class Repository {
  readonly id: number                          // Local database ID
  readonly path: string                        // Absolute path to .git directory
  readonly name: string                        // Display name
  readonly gitHubRepository: GitHubRepository | null  // Null for local repos
  readonly missing: boolean                    // True if directory doesn't exist
  readonly alias: string | null                // User-defined alias
  readonly workflowPreferences: object         // Fork settings, etc.
  readonly isTutorialRepository: boolean       // Tutorial mode flag
}
```

**Key Methods:**
- Constructor validates path
- Name derived from folder name OR GitHub repo name
- Hash property for equality comparison

### 3. Repository Management Operations

#### 3.1 Clone Repository

**Reference:** `app/src/lib/git/clone.ts:27-78`

**Function Signature:**
```typescript
async function clone(
  url: string,
  path: string,
  options: CloneOptions,
  progressCallback?: (progress: ICloneProgress) => void
): Promise<void>
```

**Clone Options:**
```typescript
{
  branch?: string          // Specific branch to clone
  defaultBranch?: string   // Default branch name (e.g., 'main')
}
```

**Implementation:**
```bash
git -c init.defaultBranch=main clone --recursive [--branch BRANCH] -- URL PATH
```

**Features:**
- `--recursive` flag to clone submodules
- `--progress` flag when progress callback provided
- Progress parsing for UI updates (percentage, current operation)
- Environment variables for remote operations
- `GIT_CLONE_PROTECTION_ACTIVE=false` to bypass protections

**Progress Events** (reference: `app/src/models/progress.ts`):
```typescript
{
  kind: 'clone'
  title: string              // "Cloning into /path/to/repo"
  description: string        // Current operation text
  value: number              // 0-1 percentage
}
```

#### 3.2 Add Existing Repository

**No git command needed** - just validate that:
1. Path exists
2. Path contains `.git` directory
3. `.git/config` file exists and is valid

Create `Repository` object and add to repositories store.

#### 3.3 Initialize New Repository

**Reference:** `app/src/lib/git/init.ts`

```bash
git -c init.defaultBranch=main init PATH
```

#### 3.4 Remove Repository

Frontend operation only:
- Remove from repositories list/database
- Optionally move to trash (via IPC `move-to-trash`)
- Never delete `.git` directory automatically (safety)

### 4. Working Directory Status

**Reference:** `app/src/lib/git/status.ts:32-68`

#### Get Repository Status

**Function:**
```typescript
async function getStatus(
  repository: Repository
): Promise<IStatusResult>
```

**Status Result Interface** (reference: `app/src/lib/git/status.ts:33-68`):
```typescript
{
  currentBranch?: string                    // Current branch name
  currentUpstreamBranch?: string            // Tracking branch
  currentTip?: string                       // HEAD commit SHA
  branchAheadBehind?: {                     // Sync status
    ahead: number
    behind: number
  }
  exists: boolean                           // Repository exists
  mergeHeadFound: boolean                   // In merge conflict
  squashMsgFound: boolean                   // In squash merge
  rebaseInternalState: object | null        // Rebasing state
  isCherryPickingHeadFound: boolean        // Cherry-picking
  workingDirectory: WorkingDirectoryStatus  // File changes
  doConflictedFilesExist: boolean          // Has conflicts
}
```

**Git Command:**
```bash
git status --porcelain=v2 --branch --untracked-files=all
```

**Porcelain v2 Format Parsing:**
The output is machine-readable with lines like:
```
# branch.oid <commit SHA>
# branch.head <branch name>
# branch.upstream <upstream name>
# branch.ab +<ahead> -<behind>
1 <X><Y> N... <mode> <hash> <path>
```

**File Status Codes:**
- `1` - ordinary changed entry
- `2` - renamed entry
- `u` - unmerged (conflict)
- `?` - untracked
- `!` - ignored

**Reference parser:** `app/src/lib/status-parser.ts` (parsePorcelainStatus function)

#### Working Directory File Change Model

```typescript
{
  path: string                        // Relative file path
  status: AppFileStatus               // Change type (see below)
  oldPath?: string                    // For renames
  selection: DiffSelection            // Staged/unstaged lines
}
```

**File Status Types:**
- New (untracked)
- Modified
- Deleted
- Copied
- Renamed
- Conflicted
- Unmerged

### 5. Staging and Unstaging Files

#### 5.1 Stage Files

**Reference:** `app/src/lib/git/update-index.ts` and `app/src/lib/git/add.ts`

**Methods:**

**Stage Specific Files:**
```bash
git add -- <file1> <file2> ...
```

**Stage All Changes:**
```bash
git add --all
```

**Stage with Intent-to-Add (for new files):**
```bash
git add --intent-to-add -- <file>
```

**Function Signature:**
```typescript
async function stageFiles(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<void>
```

#### 5.2 Unstage Files

**Reference:** `app/src/lib/git/reset.ts`

**Unstage Specific Files:**
```bash
git reset HEAD -- <file1> <file2> ...
```

**Unstage All:**
```bash
git reset HEAD
```

**Function:**
```typescript
async function unstageAll(
  repository: Repository
): Promise<void>
```

### 6. Committing Changes

**Reference:** `app/src/lib/git/commit.ts:15-43`

#### Create Commit

**Function Signature:**
```typescript
async function createCommit(
  repository: Repository,
  message: string,
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  amend: boolean = false
): Promise<string>  // Returns commit SHA
```

**Implementation Flow:**
1. **Clear staging area** - `git reset HEAD` (ensures clean state)
2. **Stage specified files** - `git add -- <files>`
3. **Create commit** - `git commit -F -` (message via stdin)
4. **Parse SHA from output**

**Git Command:**
```bash
git commit -F - [--amend]
```

**Pass message via stdin** for proper handling of:
- Multi-line messages
- Special characters
- Unicode
- Very long messages

**Commit Message Parsing:**
Parse output to extract SHA:
```
[branch-name abc123d] Commit message
 1 file changed, 5 insertions(+)
```

Extract SHA: `abc123d` (reference: `app/src/lib/git/core.ts` - parseCommitSHA function)

**Amend Commit:**
Same flow but with `--amend` flag. Rewrites most recent commit.

### 7. Commit History

**Reference:** `app/src/lib/git/log.ts`

#### Get Commit Log

**Function:**
```typescript
async function getCommits(
  repository: Repository,
  revisionRange: string,
  limit: number,
  skip?: number
): Promise<ReadonlyArray<Commit>>
```

**Git Command:**
```bash
git log <revisionRange> \
  --format="%H%x00%aN%x00%aE%x00%at%x00%cN%x00%cE%x00%ct%x00%P%x00%B%x00" \
  --no-show-signature \
  --no-color \
  -z \
  --max-count=<limit> \
  [--skip=<skip>]
```

**Format Codes:**
- `%H` - Commit hash
- `%aN` - Author name
- `%aE` - Author email
- `%at` - Author timestamp
- `%cN` - Committer name
- `%cE` - Committer email
- `%ct` - Committer timestamp
- `%P` - Parent SHAs
- `%B` - Full commit body
- `%x00` - NULL delimiter
- `-z` - NULL-terminate records

**Commit Model:**
```typescript
{
  sha: string
  shortSha: string                    // First 7 chars
  summary: string                     // First line of message
  body: string                        // Rest of message
  author: {
    name: string
    email: string
    date: Date
  }
  committer: {
    name: string
    email: string
    date: Date
  }
  parentSHAs: string[]
  tags: string[]                      // Tags pointing to this commit
  coAuthors: Array<{name, email}>     // Co-authored-by trailers
}
```

### 8. Branch Operations

**Reference:** `app/src/lib/git/branch.ts`

#### 8.1 Create Branch

**Function:** (reference: `app/src/lib/git/branch.ts:20-37`)
```typescript
async function createBranch(
  repository: Repository,
  name: string,
  startPoint: string | null,  // Commit SHA, branch name, or null for HEAD
  noTrack?: boolean
): Promise<void>
```

**Git Commands:**
```bash
# From HEAD
git branch <name>

# From specific commit/branch
git branch <name> <startPoint>

# Without tracking
git branch --no-track <name> <startPoint>
```

**No-track usage:** When creating branch from remote branch to avoid setting upstream to fork's upstream.

#### 8.2 Rename Branch

**Reference:** `app/src/lib/git/branch.ts:40-50`

```bash
git branch -m <old-name> <new-name>
```

#### 8.3 Delete Branch

**Local:** (reference: `app/src/lib/git/branch.ts:55-61`)
```bash
git branch -D <branch-name>
```

**Remote:** (reference: `app/src/lib/git/branch.ts:69-93`)
```bash
git push <remote-name> :<branch-name>
```

The colon prefix (`:`) deletes the remote branch.

#### 8.4 List Branches

**Function:**
```typescript
async function getBranches(
  repository: Repository,
  ...prefixes: string[]  // 'refs/heads/', 'refs/remotes/', etc.
): Promise<ReadonlyArray<Branch>>
```

**Git Command:**
```bash
git for-each-ref \
  --format="%(refname)%00%(objectname)%00%(upstream)%00%(upstream:track)" \
  refs/heads/ refs/remotes/
```

**Branch Model:**
```typescript
{
  name: string                      // Full ref name
  nameWithoutRemote: string         // Short name
  upstream: string | null           // Tracking branch
  upstreamWithoutRemote: string | null
  tip: {                           // Tip commit
    sha: string
    author: Author
  }
  type: BranchType                 // Local | Remote
  remoteName: string | null        // For remote branches
}
```

#### 8.5 Checkout Branch

**Reference:** `app/src/lib/git/checkout.ts`

```bash
git checkout <branch-name>
```

For new branch from remote:
```bash
git checkout -b <local-name> <remote-branch>
```

### 9. Sync Operations (Push, Pull, Fetch)

#### 9.1 Fetch

**Reference:** `app/src/lib/git/fetch.ts`

**Function:**
```typescript
async function fetch(
  repository: Repository,
  remote: string,
  progressCallback?: (progress: IFetchProgress) => void
): Promise<void>
```

**Git Command:**
```bash
git fetch [--progress] --prune <remote>
```

**Flags:**
- `--prune` - Remove remote-tracking branches that no longer exist on remote
- `--progress` - Report progress

**Environment:**
Must set environment for authentication (reference: `app/src/lib/git/environment.ts` - envForRemoteOperation)

#### 9.2 Pull

**Reference:** `app/src/lib/git/pull.ts`

**Function:**
```typescript
async function pull(
  repository: Repository,
  remote: string,
  branch: string,
  progressCallback?: (progress: IPullProgress) => void
): Promise<void>
```

**Git Command:**
```bash
git pull [--progress] <remote> <branch>
```

Equivalent to:
```bash
git fetch <remote>
git merge <remote>/<branch>
```

**Pull may result in merge conflicts** - handle via status check after pull.

#### 9.3 Push

**Reference:** `app/src/lib/git/push.ts`

**Function:**
```typescript
async function push(
  repository: Repository,
  remote: string,
  localBranch: string,
  remoteBranch?: string,
  progressCallback?: (progress: IPushProgress) => void
): Promise<void>
```

**Git Commands:**

**Push to existing upstream:**
```bash
git push [--progress] <remote> <local-branch>
```

**Push and set upstream:**
```bash
git push --set-upstream [--progress] <remote> <local-branch>:<remote-branch>
```

**Force push (dangerous):**
```bash
git push --force-with-lease <remote> <local-branch>
```

**Note:** Use `--force-with-lease` instead of `--force` for safety. It only force-pushes if remote hasn't changed since last fetch.

### 10. Diff Operations

**Reference:** `app/src/lib/git/diff.ts` (largest git module - 23,970 lines)

#### 10.1 Get Working Directory Diff

**Function:**
```typescript
async function getWorkingDirectoryDiff(
  repository: Repository,
  file: WorkingDirectoryFileChange
): Promise<IDiff>
```

**Git Command:**
```bash
# For modified files
git diff HEAD -- <file-path>

# For new files
git diff --no-index /dev/null <file-path>

# For staged changes
git diff --cached HEAD -- <file-path>
```

#### 10.2 Get Commit Diff

```bash
git diff <parent-sha> <commit-sha> -- <file-path>
```

#### 10.3 Diff Format

**Unified diff format** with optional patches for line-by-line staging.

**Diff Model:**
```typescript
{
  kind: DiffType                      // Text | Image | Binary | LargeText | Unrenderable
  text?: string                       // Raw diff text
  hunks?: ReadonlyArray<DiffHunk>     // Parsed hunks
  hasHiddenBidiChars?: boolean        // Security warning
  maxLineNumber: number
}
```

**Diff Hunk:**
```typescript
{
  header: string                      // @@ -10,5 +10,7 @@ context
  oldStartLine: number
  oldLineCount: number
  newStartLine: number
  newLineCount: number
  lines: ReadonlyArray<DiffLine>
}
```

**Diff Line:**
```typescript
{
  type: DiffLineType                  // Add | Delete | Context | Hunk
  text: string
  oldLineNumber: number | null
  newLineNumber: number | null
  noTrailingNewLine: boolean
}
```

### 11. Discard Changes

**Function:**
```typescript
async function discardChanges(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<void>
```

**For modified/deleted files:**
```bash
git checkout HEAD -- <file-paths>
```

**For new files:**
```bash
rm <file-path>
```

### 12. Remote Management

**Reference:** `app/src/lib/git/remote.ts`

#### List Remotes

```bash
git remote -v
```

**Parse output:**
```
origin  https://github.com/user/repo.git (fetch)
origin  https://github.com/user/repo.git (push)
upstream  https://github.com/parent/repo.git (fetch)
upstream  https://github.com/parent/repo.git (push)
```

**Remote Model:**
```typescript
{
  name: string              // origin, upstream, etc.
  url: string               // Remote URL
}
```

#### Add Remote

```bash
git remote add <name> <url>
```

#### Remove Remote

```bash
git remote remove <name>
```

### 13. Git Configuration

**Reference:** `app/src/lib/git/config.ts`

#### Get Config Value

```bash
git config --get <key>
```

#### Set Config Value

**Local (repository):**
```bash
git config <key> <value>
```

**Global (user):**
```bash
git config --global <key> <value>
```

**Common Config Keys:**
- `user.name` - Committer name
- `user.email` - Committer email
- `core.autocrlf` - Line ending conversion
- `core.editor` - Text editor
- `merge.tool` - Merge tool
- `remote.origin.url` - Remote URL
- `branch.<name>.remote` - Branch upstream remote
- `branch.<name>.merge` - Branch upstream ref

### 14. Error Handling

**Reference:** `app/src/lib/git/core.ts:118-150` (GitError class)

#### Git Error Types

**From Dugite** (the git wrapper library):
- `AuthenticationFailed` - Credentials rejected
- `RemoteDisconnection` - Network error
- `SSHAuthenticationFailed` - SSH key error
- `SSHPermissionDenied` - SSH access denied
- `PushNotFastForward` - Need to pull first
- `BranchAlreadyExists` - Branch name conflict
- `BadRevision` - Invalid commit SHA
- `NotAGitRepository` - Not in a git repo
- `CannotMergeUnrelatedHistories` - No common ancestor
- `LFSAttributeDoesNotMatch` - LFS config issue
- `ProtectedBranchRequiresReview` - GitHub protection
- `ProtectedBranchForcePush` - Can't force push
- `ProtectedBranchDeleteRejected` - Can't delete
- `MergeConflicts` - Merge conflicts
- `RebaseConflicts` - Rebase conflicts

**Error Handling Pattern:**
```typescript
const result = await git(args, path, 'operationName', {
  expectedErrors: new Set([
    DugiteError.AuthenticationFailed,
    DugiteError.PushNotFastForward
  ])
})

if (result.gitError === DugiteError.AuthenticationFailed) {
  // Handle auth error
} else if (result.gitError === DugiteError.PushNotFastForward) {
  // Handle push rejection
}
```

### 15. Progress Reporting

**For long operations** (clone, fetch, push, pull):

**Progress Parser Pattern:**
```typescript
class CloneProgressParser {
  parse(line: string): ICloneProgress | null {
    // Parse git progress output
    // "Receiving objects: 75% (1500/2000)"
    // Returns { percent: 0.75, text: "Receiving objects" }
  }
}
```

**Hook into git stdout/stderr** and parse progress lines in real-time.

**Progress Update via Callback:**
```typescript
progressCallback({
  kind: 'clone',
  title: 'Cloning repository',
  description: 'Receiving objects',
  value: 0.75  // 0-1 range
})
```

## IPC Integration

All git operations run in the **backend process** (main/server). Frontend requests operations via IPC.

**Example IPC Channels:**
```typescript
'clone-repository': (url, path, options) => Promise<void>
'get-status': (repositoryId) => Promise<IStatusResult>
'create-commit': (repositoryId, message, files) => Promise<string>
'fetch': (repositoryId, remote) => Promise<void>
'push': (repositoryId, remote, branch) => Promise<void>
'create-branch': (repositoryId, name, startPoint) => Promise<void>
'checkout-branch': (repositoryId, branchName) => Promise<void>
```

**Progress Events:**
Send progress updates via IPC message (not request/response):
```typescript
ipcMain.send('git-operation-progress', progress)
```

## Success Criteria

At the end of Phase 2, you should have:

1. ✅ Clone repository from URL
2. ✅ Add existing local repository
3. ✅ View repository status (changed files)
4. ✅ Stage and unstage files
5. ✅ Create commits with messages
6. ✅ View commit history
7. ✅ Create new branches
8. ✅ Switch between branches
9. ✅ Delete branches
10. ✅ Fetch from remote
11. ✅ Pull changes
12. ✅ Push commits
13. ✅ View diffs for files
14. ✅ Discard uncommitted changes
15. ✅ Progress reporting for long operations
16. ✅ Error handling for common git errors

## What This Phase Does NOT Include

- Complex UI (just basic forms and lists)
- Merge conflict resolution UI
- Rebase operations
- Cherry-pick
- Stash
- Tags
- Submodule management
- LFS (Large File Storage)
- GPG signing
- Advanced diff features (split view, syntax highlighting)
- GitHub integration
- Pull requests

## Key Files to Reference

```
app/src/lib/git/
  ├── core.ts                      (Git execution wrapper - 150+ lines)
  ├── clone.ts                     (Clone operation)
  ├── status.ts                    (Working directory status)
  ├── commit.ts                    (Create commits)
  ├── branch.ts                    (Branch operations - 5,149 lines)
  ├── checkout.ts                  (Switch branches)
  ├── fetch.ts                     (Fetch from remote)
  ├── pull.ts                      (Pull changes)
  ├── push.ts                      (Push commits)
  ├── diff.ts                      (Diff generation - 23,970 lines)
  ├── add.ts                       (Stage files)
  ├── reset.ts                     (Unstage files)
  ├── log.ts                       (Commit history - 10,849 lines)
  ├── remote.ts                    (Remote management)
  ├── config.ts                    (Git config)
  ├── environment.ts               (Git environment setup)
  └── spawn.ts                     (Process spawning)

app/src/lib/
  ├── status-parser.ts             (Parse porcelain status)
  ├── progress/                    (Progress parsers)
  └── trampoline/                  (Credential helper)

app/src/models/
  ├── repository.ts                (Repository model)
  ├── status.ts                    (Status models)
  ├── commit.ts                    (Commit model)
  ├── branch.ts                    (Branch model)
  ├── diff.ts                      (Diff models)
  └── progress.ts                  (Progress models)
```

## Technology-Specific Implementation Notes

### For All Technologies

**Git Binary Requirement:**
- Option 1: Bundle git with application (recommended for consistency)
  - This app uses Dugite which bundles git
  - See: `app/package.json` - dugite@3.0.0
- Option 2: Use system git (user must have git installed)
  - Detect with `which git` or `where git`

**Credential Helper:**
Must implement trampoline/askpass pattern for authentication (covered in Phase 1).

### For Electron (Current)
- Use Dugite npm package
- Child process via Node.js `child_process`

### For Tauri
- Execute git via Rust `std::process::Command`
- Parse output in Rust, send to frontend via events

### For Wails
- Execute git via Go `os/exec`
- Stream progress via Wails events

### For Web-Based
- **Cannot use git directly**
- Must use isomorphic-git (JavaScript implementation)
- Limited feature set compared to native git
- Consider backend API approach instead

## Estimated Complexity

**Time Estimate:** 5-7 days for experienced developer
**Difficulty:** Medium-High
**Critical Path:** Status parsing and diff generation are most complex

## Dependencies

- **Phase 1** - IPC and application foundation

## Next Phase Preview

Phase 3 will implement the UI layer and state management to display repositories, file changes, commit history, and branch lists with a proper React component architecture.
