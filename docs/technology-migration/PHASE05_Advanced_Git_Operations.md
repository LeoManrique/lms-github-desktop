# Phase 5: Advanced Git Operations

## Overview

This phase implements advanced Git operations that go beyond basic commit/push/pull workflows: merging with conflict resolution, rebasing, cherry-picking, stashing, tagging, and reset operations. These features enable complex development workflows and collaboration patterns.

## Prerequisites

- Phase 1 completed (IPC, window management)
- Phase 2 completed (Core Git operations)
- Phase 3 completed (UI and state management)
- Phase 4 completed (GitHub integration)

## Technology-Agnostic Requirements

### 1. Merge Operations

**Reference:** `app/src/lib/git/merge.ts`

#### 1.1 Basic Merge

**Function Signature:**
```typescript
async function merge(
  repository: Repository,
  branch: string,
  isSquash: boolean = false
): Promise<MergeResult>
```

**Merge Result** (reference: `app/src/lib/git/merge.ts:8-20`):
```typescript
enum MergeResult {
  Success,              // Merge completed successfully
  AlreadyUpToDate,      // No changes to merge
  Failed,               // Merge conflicts or other error
}
```

**Git Command:**
```bash
git merge <branch>
```

**Implementation** (reference: `app/src/lib/git/merge.ts:23-58`):
```typescript
const { exitCode, stdout } = await git(
  ['merge', branch],
  repository.path,
  'merge',
  { expectedErrors: new Set([GitError.MergeConflicts]) }
)

if (exitCode !== 0) {
  return MergeResult.Failed
}

return stdout === 'Already up to date.\n'
  ? MergeResult.AlreadyUpToDate
  : MergeResult.Success
```

#### 1.2 Squash Merge

**What it does:** Combines all commits from branch into one commit

**Git Command:**
```bash
git merge --squash <branch>
git commit --no-edit
```

**Use Case:** Clean up commit history when merging feature branches

#### 1.3 Get Merge Base

**Purpose:** Find common ancestor of two branches

**Function** (reference: `app/src/lib/git/merge.ts:68-90`):
```typescript
async function getMergeBase(
  repository: Repository,
  firstCommitish: string,
  secondCommitish: string
): Promise<string | null>
```

**Git Command:**
```bash
git merge-base <commit1> <commit2>
```

**Returns:** SHA of common ancestor, or null if no common history

**Usage:**
- Preview what will be merged
- Calculate commits to be merged
- Determine if fast-forward is possible

#### 1.4 Abort Merge

**When:** User wants to cancel mid-merge (usually during conflicts)

**Function** (reference: `app/src/lib/git/merge.ts:97-99`):
```typescript
async function abortMerge(repository: Repository): Promise<void>
```

**Git Command:**
```bash
git merge --abort
```

**Effect:**
- Restores repository to pre-merge state
- Discards conflict markers
- Returns to original branch HEAD

#### 1.5 Detect Merge State

**Check for ongoing merge** (reference: `app/src/lib/git/merge.ts:105-108`):
```typescript
async function isMergeHeadSet(repository: Repository): Promise<boolean> {
  const path = Path.join(repository.path, '.git', 'MERGE_HEAD')
  return await pathExists(path)
}
```

**Explanation:**
When git is mid-merge, `.git/MERGE_HEAD` contains the SHA of the commit being merged.

### 2. Conflict Resolution

**When merge/rebase/cherry-pick fails** due to conflicts, user must resolve them.

#### 2.1 Conflict Detection

**From status** (Phase 2): Files with `AppFileStatusKind.Conflicted` status

**Conflicted File Status:**
```typescript
interface ConflictedFileStatus {
  kind: AppFileStatusKind.Conflicted
  entry: UnmergedEntry
  conflictMarkerCount: number  // Number of <<<<<<< markers
}
```

**Conflict Types:**
- **Both Added** - Same file added in both branches
- **Both Modified** - Same lines modified in both branches
- **Both Deleted** - File deleted in both branches
- **Added By Us** - We added, they modified
- **Added By Them** - They added, we modified
- **Deleted By Us** - We deleted, they modified
- **Deleted By Them** - They deleted, we modified

#### 2.2 Conflict Markers

Git inserts conflict markers into files:

```
Normal content before conflict

<<<<<<< HEAD (Current Change)
Our version of the code
=======
Their version of the code
>>>>>>> branch-name (Incoming Change)

Normal content after conflict
```

**Counting Conflict Markers:**
Scan file for `<<<<<<<` to count unresolved conflicts.

#### 2.3 Manual Conflict Resolution

**User has three choices for each conflict:**

**Option 1: Keep Ours (Current)**
- Use version from current branch
- Discard incoming changes

**Option 2: Keep Theirs (Incoming)**
- Use version from merging branch
- Discard current changes

**Option 3: Manual Edit**
- User edits file in external editor
- Removes conflict markers
- Combines changes as desired

**Manual Resolution Model:**
```typescript
enum ManualConflictResolution {
  ours,    // Keep our version
  theirs,  // Keep their version
}
```

#### 2.4 Stage Resolved Conflicts

**After resolving** conflicts, stage the files:

```typescript
async function stageManualConflictResolution(
  repository: Repository,
  file: WorkingDirectoryFileChange,
  resolution: ManualConflictResolution
): Promise<void>
```

**Process:**
1. If resolution is `ours`: `git checkout --ours -- <file>`
2. If resolution is `theirs`: `git checkout --theirs -- <file>`
3. Stage file: `git add -- <file>`

#### 2.5 Continue Merge

**After all conflicts resolved:**

For merge:
```bash
git commit --no-edit
```

For rebase:
```bash
git rebase --continue
```

For cherry-pick:
```bash
git cherry-pick --continue
```

### 3. Rebase Operations

**Reference:** `app/src/lib/git/rebase.ts` (17,312 lines - extensive)

Rebase rewrites commit history by replaying commits on a new base.

#### 3.1 Rebase Result Types

**Enum** (reference: `app/src/lib/git/rebase.ts:35-68`):
```typescript
enum RebaseResult {
  CompletedWithoutError,      // Success
  AlreadyUpToDate,            // Nothing to rebase
  ConflictsEncountered,       // User must resolve conflicts
  OutstandingFilesNotStaged,  // Unstaged changes blocking rebase
  Aborted,                    // Rebase was aborted
  Error,                      // Unexpected error
}
```

#### 3.2 Basic Rebase

**Function:**
```typescript
async function rebase(
  repository: Repository,
  baseBranch: Branch,
  targetBranch: Branch,
  progressCallback?: (progress: IMultiCommitOperationProgress) => void
): Promise<RebaseResult>
```

**Git Command:**
```bash
git rebase <base-branch>
```

**What it does:**
Takes commits from current branch and replays them on top of base branch.

**Before:**
```
A---B---C  main
     \
      D---E  feature
```

**After rebase feature onto main:**
```
A---B---C  main
         \
          D'---E'  feature
```

Commits D and E are rewritten as D' and E' (new SHAs).

#### 3.3 Interactive Rebase

**Allows user to:**
- Reorder commits
- Squash commits (combine multiple into one)
- Edit commit messages
- Drop commits
- Edit commits

**Git Command:**
```bash
git rebase -i <base>
```

**Desktop's approach:**
Uses programmatic rebase with specific actions rather than interactive editor.

#### 3.4 Rebase State Detection

**Check for ongoing rebase** (reference: `app/src/lib/git/rebase.ts:74-77`):
```typescript
function isRebaseHeadSet(repository: Repository): Promise<boolean> {
  const path = Path.join(repository.path, '.git', 'REBASE_HEAD')
  return pathExists(path)
}
```

#### 3.5 Get Rebase Internal State

**When rebase is in progress**, read state files:

**Reference:** `app/src/lib/git/rebase.ts:87-136`

**Rebase State Files** (in `.git/rebase-merge/`):
- `orig-head` - Original branch tip SHA
- `head-name` - Branch being rebased
- `onto` - Base branch SHA
- `end` - Total number of commits
- `msgnum` - Current commit number

**State Model:**
```typescript
interface RebaseInternalState {
  originalBranchTip: string   // SHA before rebase
  targetBranch: string        // Branch name being rebased
  baseBranchTip: string       // SHA we're rebasing onto
}
```

**Use Case:**
- Show progress to user ("Rebasing commit 3 of 5")
- Provide context in conflict resolution
- Resume rebase after app restart

#### 3.6 Abort Rebase

**Function:**
```typescript
async function abortRebase(repository: Repository): Promise<void> {
  await git(['rebase', '--abort'], repository.path, 'abortRebase')
}
```

**Effect:**
- Stops rebase operation
- Returns branch to pre-rebase state
- Discards any conflict resolutions

#### 3.7 Continue Rebase

**After resolving conflicts:**
```typescript
async function continueRebase(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  progressCallback?: (progress: IMultiCommitOperationProgress) => void
): Promise<RebaseResult>
```

**Git Command:**
```bash
git rebase --continue
```

**Process:**
1. Stage resolved files
2. Run `git rebase --continue`
3. Parse output for progress
4. Repeat if more conflicts
5. Return result when complete

### 4. Cherry-Pick Operations

**Reference:** `app/src/lib/git/cherry-pick.ts`

Apply specific commits from one branch to another.

#### 4.1 Cherry-Pick Single Commit

**Function:**
```typescript
async function cherryPick(
  repository: Repository,
  commit: CommitOneLine
): Promise<CherryPickResult>
```

**Git Command:**
```bash
git cherry-pick <commit-sha>
```

**Cherry-Pick Result:**
```typescript
enum CherryPickResult {
  CompletedWithoutError,
  ConflictsEncountered,
  Cancelled,
  UnableToStart,
  Error,
}
```

**Use Case:**
- Apply bug fix from main to release branch
- Port feature to different branch
- Extract specific commits from feature branch

#### 4.2 Cherry-Pick Multiple Commits

**Function:**
```typescript
async function cherryPickRange(
  repository: Repository,
  commits: ReadonlyArray<CommitOneLine>,
  progressCallback?: (progress: IMultiCommitOperationProgress) => void
): Promise<CherryPickResult>
```

**Git Command:**
```bash
git cherry-pick <commit1> <commit2> <commit3> ...
```

**Implementation:**
Cherry-picks one at a time, handling conflicts for each.

#### 4.3 Detect Cherry-Pick State

**Check if cherry-pick is in progress:**
```typescript
function isCherryPickHeadFound(repository: Repository): Promise<boolean> {
  const path = Path.join(repository.path, '.git', 'CHERRY_PICK_HEAD')
  return pathExists(path)
}
```

#### 4.4 Abort Cherry-Pick

```bash
git cherry-pick --abort
```

### 5. Stash Operations

**Reference:** `app/src/lib/git/stash.ts` (9,866 lines)

Stash temporarily saves uncommitted changes.

#### 5.1 Stash Entry Model

**Stash Entry:**
```typescript
interface IStashEntry {
  name: string              // stash@{0}, stash@{1}, etc.
  stashSha: string          // SHA of stash commit
  branchName: string        // Branch stash was created on
  tree: string              // Tree SHA
  parents: string[]         // Parent commit SHAs
  files: StashedFileChanges // Changed files (lazy-loaded)
}
```

#### 5.2 Create Stash

**Function:**
```typescript
async function createDesktopStash(
  repository: Repository,
  branch: Branch
): Promise<boolean>
```

**Git Command:**
```bash
git stash push -m "On <branch>: !!GitHub_Desktop<branch>"
```

**Special Marker** (reference: `app/src/lib/git/stash.ts:18-26`):
Desktop adds marker `!!GitHub_Desktop<branch>` to stash message to identify stashes created by Desktop.

**Use Cases:**
- Switch branches without committing
- Pull changes with local modifications
- Temporarily set aside work

#### 5.3 List Stashes

**Function:**
```typescript
async function getStashes(repository: Repository): Promise<StashResult>
```

**Git Command:**
```bash
git log -g --format=... refs/stash
```

**Result:**
```typescript
{
  desktopEntries: IStashEntry[]  // Stashes created by Desktop
  stashEntryCount: number        // Total stashes (including manual)
}
```

**Only show Desktop stashes** to avoid confusion with user-created stashes.

#### 5.4 Apply Stash

**Function:**
```typescript
async function popStash(
  repository: Repository,
  stashEntry: IStashEntry
): Promise<void>
```

**Git Command:**
```bash
git stash pop stash@{0}
```

**Effect:**
- Applies stashed changes to working directory
- Removes stash from stash list

**Alternative - Apply without removing:**
```bash
git stash apply stash@{0}
```

#### 5.5 Drop Stash

**Delete stash without applying:**
```bash
git stash drop stash@{0}
```

#### 5.6 Get Stash Files

**List files changed in stash:**
```typescript
async function getStashedFiles(
  repository: Repository,
  stashEntry: IStashEntry
): Promise<ReadonlyArray<CommittedFileChange>>
```

**Git Command:**
```bash
git stash show stash@{0} --numstat
```

**Lazy Loading:**
Stash file lists are loaded on-demand (when user opens stash) for performance.

### 6. Tag Operations

**Reference:** `app/src/lib/git/tag.ts`

Tags mark specific commits (usually releases).

#### 6.1 Create Tag

**Function:**
```typescript
async function createTag(
  repository: Repository,
  name: string,
  targetCommitSha: string
): Promise<void>
```

**Git Command:**
```bash
git tag <name> <commit-sha>
```

**Annotated Tag** (with message):
```bash
git tag -a <name> -m <message> <commit-sha>
```

#### 6.2 Delete Tag

**Local:**
```bash
git tag -d <tag-name>
```

**Remote:**
```bash
git push <remote> :refs/tags/<tag-name>
```

#### 6.3 List Tags

**Git Command:**
```bash
git tag --list
```

**Get Tag Target:**
```bash
git rev-list -n 1 <tag-name>
```

Returns SHA that tag points to.

#### 6.4 Push Tags

**Push all tags:**
```bash
git push --tags
```

**Push specific tag:**
```bash
git push <remote> <tag-name>
```

### 7. Reset Operations

**Reference:** `app/src/lib/git/reset.ts`

Reset moves branch pointer and optionally modifies working directory.

#### 7.1 Reset Modes

**Enum:**
```typescript
enum GitResetMode {
  Soft,    // Keep changes staged
  Mixed,   // Keep changes unstaged (default)
  Hard,    // Discard all changes
}
```

#### 7.2 Reset to Commit

**Function:**
```typescript
async function reset(
  repository: Repository,
  mode: GitResetMode,
  ref: string
): Promise<void>
```

**Git Commands:**
```bash
git reset --soft <commit>   # Keep changes staged
git reset --mixed <commit>  # Keep changes unstaged
git reset --hard <commit>   # Discard changes
```

**Use Cases:**
- Undo commits (keep changes): `--soft`
- Move branch pointer: `--mixed`
- Completely reset to commit: `--hard`

**Warning:** `--hard` is destructive!

#### 7.3 Unstage All

**Convenience function:**
```bash
git reset HEAD
```

Unstages all staged files without moving branch pointer.

### 8. Multi-Commit Operation Framework

**Reference:** `app/src/models/multi-commit-operation.ts`

Desktop uses a unified framework for operations affecting multiple commits: rebase, cherry-pick, squash.

#### 8.1 Operation Types

**Enum:**
```typescript
enum MultiCommitOperationKind {
  Rebase,
  CherryPick,
  Squash,
  Reorder,
}
```

#### 8.2 Operation State

**State Model:**
```typescript
interface IMultiCommitOperationState {
  kind: MultiCommitOperationKind
  currentStep: MultiCommitOperationStep
  progress: IMultiCommitOperationProgress
  commits: ReadonlyArray<CommitOneLine>
  targetBranch: Branch
  sourceBranch?: Branch
}
```

**Progress:**
```typescript
interface IMultiCommitOperationProgress {
  kind: 'multiCommitOperation'
  title: string
  value: number              // 0-1 percentage
  currentCommitSummary: string
  position: number           // Current commit index
  totalCommitCount: number
}
```

#### 8.3 Operation Steps

**Step Types:**
```typescript
enum MultiCommitOperationStepKind {
  ShowProgress,      // Operation in progress
  ShowConflicts,     // Conflicts encountered
  ConfirmAbort,      // User confirming abort
  Completed,         // Operation finished
  HideConflicts,     // Conflicts resolved, continuing
}
```

**State Machine:**
```
Start → ShowProgress → [Success: Completed]
                    ↓
                  [Conflict: ShowConflicts]
                    ↓
                  [User resolves]
                    ↓
                  HideConflicts → ShowProgress → ...
```

#### 8.4 Unified UI

**Multi-Commit Operation Dialog:**
Shows progress, conflicts, and controls for all multi-commit operations.

**Features:**
- Progress bar (X of Y commits)
- Current commit being processed
- Conflict resolution UI
- Abort button
- Continue button (after resolving conflicts)

### 9. Conflict Resolution UI

**Reference:** `app/src/ui/merge-conflicts/`

#### 9.1 Conflict List

**Shows all conflicted files:**
- File path
- Conflict type (both modified, both added, etc.)
- Conflict marker count
- Resolution choice (ours/theirs/manual)

#### 9.2 Conflict Resolution Actions

**For each file:**

**Button: "Use Mine"**
```typescript
dispatcher.resolveConflict(repository, file, ManualConflictResolution.ours)
```

**Button: "Use Theirs"**
```typescript
dispatcher.resolveConflict(repository, file, ManualConflictResolution.theirs)
```

**Button: "Open in Editor"**
```typescript
dispatcher.openInExternalEditor(repository, file.path)
```

**After manual edit:**
User saves file and marks as resolved.

#### 9.3 Commit Merge

**After all conflicts resolved:**

**Button: "Commit Merge"**
```typescript
dispatcher.finishConflictedMerge(repository, resolvedFiles)
```

**Process:**
1. Stage all resolved files
2. Create merge commit
3. Clear conflict state
4. Show success banner

## Success Criteria

At the end of Phase 5, you should have:

1. ✅ Merge branches
2. ✅ Squash merge
3. ✅ Detect merge conflicts
4. ✅ Conflict resolution UI
5. ✅ Manual conflict resolution (ours/theirs/manual edit)
6. ✅ Abort merge
7. ✅ Rebase branch onto another
8. ✅ Detect rebase conflicts
9. ✅ Continue/abort rebase
10. ✅ Cherry-pick commits
11. ✅ Cherry-pick multiple commits
12. ✅ Stash changes
13. ✅ Apply/pop stash
14. ✅ List stashes
15. ✅ Drop stash
16. ✅ Create tags
17. ✅ Delete tags (local and remote)
18. ✅ Reset to commit (soft/mixed/hard)
19. ✅ Multi-commit operation UI framework
20. ✅ Progress tracking for multi-commit operations

## What This Phase Does NOT Include

- Interactive rebase UI (reorder/squash commits visually)
- Bisect operations
- Submodule management
- Worktree management
- Reflog viewer
- Patch operations
- Archive operations

## Key Files to Reference

```
app/src/lib/git/
  ├── merge.ts                     (Merge operations)
  ├── rebase.ts                    (Rebase - 17,312 lines)
  ├── cherry-pick.ts               (Cherry-pick operations)
  ├── stash.ts                     (Stash - 9,866 lines)
  ├── tag.ts                       (Tag operations)
  ├── reset.ts                     (Reset operations)
  └── stage.ts                     (Conflict staging)

app/src/models/
  ├── multi-commit-operation.ts    (Operation framework)
  ├── rebase.ts                    (Rebase models)
  ├── stash-entry.ts               (Stash models)
  └── manual-conflict-resolution.ts

app/src/ui/
  ├── merge-conflicts/             (Conflict resolution UI)
  ├── multi-commit-operation/      (Unified operation UI)
  ├── rebase/                      (Rebase-specific UI)
  ├── stash-changes/               (Stash UI)
  ├── create-tag/                  (Tag creation)
  └── reset/                       (Reset UI)

app/src/lib/
  ├── rebase.ts                    (Rebase helpers)
  ├── merge.ts                     (Merge helpers)
  └── multi-commit-operation.ts    (Operation helpers)
```

## Technology-Specific Implementation Notes

### Conflict Markers

All technologies must parse conflict markers from files:
```
<<<<<<< HEAD
Our content
=======
Their content
>>>>>>> branch
```

Count occurrences of `<<<<<<<` to detect unresolved conflicts.

### Rebase Progress

Parse git output to track rebase progress:
```
Rebasing (1/5)
Rebasing (2/5)
...
```

Or read from `.git/rebase-merge/msgnum` and `.git/rebase-merge/end`.

### State Persistence

When operation is interrupted (app closes during rebase):
- Detect ongoing operation on next launch
- Resume operation or offer to abort
- Restore operation state from git state files

## Estimated Complexity

**Time Estimate:** 10-14 days for experienced developer
**Difficulty:** High
**Critical Path:** Conflict resolution UI must be intuitive; state management for multi-commit operations is complex

## Dependencies

- **Phase 1** - IPC foundation
- **Phase 2** - Core Git operations
- **Phase 3** - UI and state management
- **Phase 4** - GitHub integration (for conflict detection in PRs)

## Next Phase Preview

Phase 6 will implement the complete UI component library including advanced components like popovers, tooltips, dialogs, and specialized input controls that are used throughout the application.
