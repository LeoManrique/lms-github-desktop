# Phase 3: Basic UI and State Management

## Overview

This phase implements the UI layer and state management architecture that displays repositories, file changes, commit history, and allows user interaction with the Git operations from Phase 2. It establishes the foundational React component hierarchy, state management pattern (stores and dispatcher), and creates the main application layout.

## Prerequisites

- Phase 1 completed (IPC, window management)
- Phase 2 completed (Core Git operations)

## Technology-Agnostic Requirements

### 1. State Management Architecture

This application uses a **unidirectional data flow** pattern with:
- **Stores** - Hold application state
- **Dispatcher** - Central command hub for state mutations
- **React Components** - View layer that subscribes to stores

#### 1.1 AppState Structure

**Reference:** `app/src/lib/app-state.ts:74-200`

The central application state is a single immutable object:

```typescript
interface IAppState {
  // User accounts
  accounts: ReadonlyArray<Account>

  // Repository management
  repositories: ReadonlyArray<Repository | CloningRepository>
  recentRepositories: ReadonlyArray<number>  // Recently opened repo IDs
  localRepositoryStateLookup: Map<number, ILocalRepositoryState>

  // Current selection (which repo/view is active)
  selectedState: PossibleSelections | null

  // Authentication state
  signInState: SignInState | null

  // Window state
  windowState: WindowState | null  // minimized/maximized/fullscreen
  windowZoomFactor: number         // 1.0 = 100%
  appIsFocused: boolean

  // UI state
  showWelcomeFlow: boolean
  focusCommitMessage: boolean
  currentPopup: Popup | null              // Modal dialogs
  allPopups: ReadonlyArray<Popup>        // Dialog stack
  currentFoldout: Foldout | null         // Dropdown menus
  currentBanner: Banner | null            // Top banner messages
  currentDragElement: DragElement | null  // Drag-and-drop

  // Application menu (Windows/Linux)
  appMenuState: ReadonlyArray<IMenu>

  // Errors
  errorCount: number

  // Emoji data (for commit messages)
  emoji: Map<string, Emoji>

  // Layout dimensions
  sidebarWidth: IConstrainedValue           // Repository sidebar
  commitSummaryWidth: IConstrainedValue     // History column
  stashedFilesWidth: IConstrainedValue
  pullRequestFilesListWidth: IConstrainedValue
  branchDropdownWidth: IConstrainedValue
  pushPullButtonWidth: IConstrainedValue

  // Keyboard shortcuts (Windows/Linux)
  accessKeyHighlight: boolean

  // Theme
  selectedTheme: ApplicationTheme  // Light | Dark | System
  customTheme: object | null

  // Updates
  updateState: IUpdateState | null

  // Other state...
}
```

**Selection Types** (reference: `app/src/lib/app-state.ts:55-72`):

The app can be in one of three selection states:

```typescript
enum SelectionType {
  Repository,          // Normal repository view
  CloningRepository,   // Repository currently being cloned
  MissingRepository,   // Repository that can't be found on disk
}

type PossibleSelections =
  | {
      type: SelectionType.Repository
      repository: Repository
      state: IRepositoryState  // Detailed state for this repo
    }
  | {
      type: SelectionType.CloningRepository
      repository: CloningRepository
      progress: ICloneProgress
    }
  | {
      type: SelectionType.MissingRepository
      repository: Repository
    }
```

#### 1.2 Repository State Structure

**When a repository is selected**, the app loads detailed state about it:

```typescript
interface IRepositoryState {
  // Current git status
  status: WorkingDirectoryStatus | null

  // Branch info
  allBranches: ReadonlyArray<Branch>
  recentBranches: ReadonlyArray<Branch>
  currentBranch: Branch | null
  defaultBranch: Branch | null
  upstreamDefaultBranch: Branch | null

  // Tips (HEAD state)
  tip: Tip  // Detached HEAD, valid branch, or unborn

  // Remotes
  remote: IRemote | null
  remotes: ReadonlyArray<IRemote>

  // UI tab selection
  selectedSection: RepositorySectionTab  // Changes | History

  // History state (when History tab active)
  commitSelection: {
    shas: ReadonlyArray<string>
    isContiguous: boolean
    file: CommittedFileChange | null
    changesetData: IChangesetData
    diff: IDiff | null
  }
  commitHistory: {
    history: ReadonlyArray<Commit>
    hasMore: boolean  // Can load more commits
  }

  // Changes state (when Changes tab active)
  changesState: {
    workingDirectory: WorkingDirectoryStatus
    selection: ChangesSelection
    commitMessage: ICommitMessage | null
    commitAuthor: CommitIdentity | null
    coAuthors: ReadonlyArray<Author>
    showCoAuthoredBy: boolean
    isCommitting: boolean
  }

  // Compare branch (for viewing branch diffs)
  compareState: ICompareState | null

  // Pull requests
  pullRequests: Map<number, PullRequest>
  currentPullRequest: PullRequest | null

  // Ahead/behind counts
  aheadBehind: IAheadBehind | null

  // Stashes
  stashEntries: ReadonlyArray<IStashEntry>

  // Tags
  tags: Map<string, string>  // tag name -> commit SHA

  // Multi-commit operations (rebase, cherry-pick, squash)
  multiCommitOperationState: IMultiCommitOperationState | null

  // Merge/rebase/cherry-pick conflict state
  conflictState: ConflictState | null
}
```

### 2. Store Pattern

**Reference:** `app/src/lib/stores/app-store.ts`

The application uses multiple specialized stores:

#### 2.1 AppStore (Central Store)

**Reference:** `app/src/lib/stores/app-store.ts:1-200`

The main store that coordinates all other stores and owns the `IAppState`.

**Initialization** (from `app/src/ui/index.tsx:307-319`):
```typescript
const appStore = new AppStore(
  gitHubUserStore,
  cloningRepositoriesStore,
  issuesStore,
  statsStore,
  signInStore,
  accountsStore,
  repositoriesStore,
  pullRequestCoordinator,
  repositoryStateManager,
  apiRepositoriesStore,
  notificationsStore
)
```

**Store Update Pattern:**
```typescript
class AppStore {
  private emitter = new Emitter()
  private state: IAppState

  // Subscribe to state changes
  onDidUpdate(fn: (state: IAppState) => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  // Emit state change
  private emitUpdate() {
    this.emitter.emit('did-update', this.state)
  }

  // State mutation
  private setState(newState: Partial<IAppState>) {
    this.state = { ...this.state, ...newState }
    this.emitUpdate()
  }
}
```

#### 2.2 Other Stores

**RepositoriesStore** - Manages repository list and persistence
- Backed by IndexedDB (`RepositoriesDatabase`)
- Stores repository metadata, paths, GitHub associations
- Reference: `app/src/lib/stores/repositories-store.ts`

**AccountsStore** - User authentication accounts
- GitHub.com and GitHub Enterprise accounts
- Token storage (via secure credential store)
- Reference: `app/src/lib/stores/accounts-store.ts`

**GitHubUserStore** - GitHub user profile cache
- Avatars, names, emails
- Backed by `GitHubUserDatabase` (IndexedDB)
- Reference: `app/src/lib/stores/github-user-store.ts`

**IssuesStore** - GitHub issues cache
- Reference: `app/src/lib/stores/issues-store.ts`

**PullRequestStore** - Pull request data
- Backed by `PullRequestDatabase` (IndexedDB)
- Reference: `app/src/lib/stores/pull-request-store.ts`

**StatsStore** - Analytics and usage stats
- Reference: `app/src/lib/stats/stats-store.ts`

**SignInStore** - OAuth flow state
- Reference: `app/src/lib/stores/sign-in-store.ts`

**RepositoryStateCache** - Per-repository git state cache
- Holds `IRepositoryState` for each repository
- Refreshed when repository is opened or refreshed
- Reference: `app/src/lib/stores/repository-state-cache.ts`

### 3. Dispatcher Pattern

**Reference:** `app/src/ui/dispatcher/dispatcher.ts:145-250`

The Dispatcher is the **command hub** - all actions flow through it.

**Class Definition:**
```typescript
class Dispatcher {
  constructor(
    private appStore: AppStore,
    private repositoryStateManager: RepositoryStateCache,
    private statsStore: StatsStore,
    private commitStatusStore: CommitStatusStore
  )

  // Error handling
  private errorHandlers: Array<ErrorHandler>
  registerErrorHandler(handler: ErrorHandler): void

  // Repository actions
  addRepositories(paths: string[]): Promise<Repository[]>
  removeRepository(repo: Repository, moveToTrash: boolean): Promise<void>
  selectRepository(repository: Repository): void
  refreshRepository(repository: Repository): void

  // Git operations (delegates to Phase 2 git functions + updates state)
  createCommit(repo: Repository, msg: string, files: FileChange[]): Promise<void>
  fetch(repo: Repository, remote: string): Promise<void>
  push(repo: Repository): Promise<void>
  pull(repo: Repository): Promise<void>
  createBranch(repo: Repository, name: string, startPoint: string): Promise<void>
  checkoutBranch(repo: Repository, branch: Branch): Promise<void>

  // File operations
  stageFile(repo: Repository, file: FileChange): void
  unstageFile(repo: Repository, file: FileChange): void
  discardChanges(repo: Repository, files: FileChange[]): Promise<void>

  // History
  loadNextCommitBatch(repo: Repository): Promise<void>
  changeCommitSelection(repo: Repository, shas: string[]): void

  // UI state
  showPopup(popup: Popup): void
  closePopup(popup: Popup): void
  showFoldout(foldout: Foldout): void
  closeFoldout(foldout: Foldout): void
  setBanner(banner: Banner): void
  clearBanner(): void

  // Commit message
  setCommitMessage(repo: Repository, message: ICommitMessage): void

  // Compare
  showCompare(repo: Repository, branch: Branch): void

  // And many more actions...
}
```

**Dispatcher Initialization** (from `app/src/ui/index.tsx:325-347`):
```typescript
const dispatcher = new Dispatcher(appStore, repositoryStateManager, statsStore, commitStatusStore)

// Register error handlers (middleware pattern)
dispatcher.registerErrorHandler(defaultErrorHandler)
dispatcher.registerErrorHandler(upstreamAlreadyExistsHandler)
dispatcher.registerErrorHandler(externalEditorErrorHandler)
dispatcher.registerErrorHandler(openShellErrorHandler)
dispatcher.registerErrorHandler(mergeConflictHandler)
dispatcher.registerErrorHandler(pushNeedsPullHandler)
// ... more error handlers
```

**Error Handler Pattern:**
An error handler can intercept errors and show appropriate UI:

```typescript
type ErrorHandler = (error: Error, dispatcher: Dispatcher) => Promise<Error | null>

// Example: handle merge conflicts
async function mergeConflictHandler(error: Error, dispatcher: Dispatcher): Promise<Error | null> {
  if (error instanceof GitError && error.result.gitError === DugiteError.MergeConflicts) {
    // Show merge conflict UI
    dispatcher.showPopup({ type: PopupType.MergeConflicts, ... })
    return null  // Error handled
  }
  return error  // Pass to next handler
}
```

### 4. Root React Component

**Reference:** `app/src/ui/app.tsx:1-200`

The main `<App>` component orchestrates the entire UI.

**Component Definition:**
```typescript
interface IAppProps {
  dispatcher: Dispatcher
  appStore: AppStore
  repositoryStateManager: RepositoryStateCache
  issuesStore: IssuesStore
  gitHubUserStore: GitHubUserStore
  aheadBehindStore: AheadBehindStore
  startTime: number  // For performance metrics
}

interface IAppState {
  state: IAppState  // Yes, component state contains app state
}

class App extends React.Component<IAppProps, IAppState> {
  componentDidMount() {
    // Subscribe to store updates
    this.props.appStore.onDidUpdate(state => {
      this.setState({ state })
    })

    // Load initial state
    this.props.dispatcher.loadInitialState()
  }

  render() {
    const { state } = this.state

    return (
      <div id="desktop-app-contents">
        <TitleBar />
        {this.renderToolbar()}
        {this.renderRepository()}
        {this.renderPopup()}
        {this.renderBanner()}
        {this.renderAppMenu()}
      </div>
    )
  }
}
```

### 5. Application Layout

The app has a **three-column layout**:

```
┌──────────────────────────────────────────────────────────┐
│ Title Bar (window controls, menu on Windows/Linux)      │
├──────────────────────────────────────────────────────────┤
│ Toolbar (repo selector, branch, push/pull)              │
├────────────┬────────────────────────┬────────────────────┤
│            │                        │                    │
│ Repository │   Changes/History      │  Diff/File List   │
│ List       │   (Tab Content)        │  (Detail Pane)     │
│            │                        │                    │
│ - Repo 1   │  ┌─────────────────┐  │                    │
│ - Repo 2   │  │  Changed Files  │  │  [File Diff View]  │
│ - Repo 3   │  │  - file1.ts     │  │                    │
│            │  │  - file2.tsx    │  │  +added line       │
│            │  │                 │  │  -removed line     │
│            │  └─────────────────┘  │                    │
│            │                        │                    │
│            │  [Commit Message]      │                    │
│            │  [Commit Button]       │                    │
│            │                        │                    │
└────────────┴────────────────────────┴────────────────────┘
```

### 6. Key UI Components (Minimum for Phase 3)

#### 6.1 Title Bar

**Reference:** `app/src/ui/window/title-bar.tsx`

Platform-specific title bar:
- **macOS**: Native title bar (minimal custom UI)
- **Windows/Linux**: Custom title bar with window controls and menu

**Features:**
- Application name
- Window controls (minimize, maximize, close)
- App menu button (Windows/Linux)
- Draggable region for window movement

#### 6.2 Toolbar

**Reference:** `app/src/ui/toolbar/toolbar.tsx`

Horizontal toolbar with:
- **Repository dropdown** - Switch between repositories
- **Current branch dropdown** - Switch branches, create new branch
- **Push/Pull button** - Sync with remote (shows ahead/behind count)
- **Fetch indicator** - Shows when background fetch happens

**Branch Dropdown Reference:** `app/src/ui/toolbar/branch-dropdown.tsx`
- Lists all local and remote branches
- Search/filter branches
- Create new branch action
- Show current branch with checkmark

**Push/Pull Button Reference:** `app/src/ui/toolbar/push-pull-button.tsx`
- Shows "Push" when ahead of remote
- Shows "Pull" when behind remote
- Shows "Fetch" when up to date
- Shows ahead/behind count (e.g., "↑3 ↓2")
- Click to push/pull

#### 6.3 Repository List

**Reference:** `app/src/ui/repositories-list/repositories-list.tsx`

Left sidebar showing all repositories:

**Features:**
- Filter/search repositories
- Group by (all, local, GitHub.com, Enterprise)
- Show repository name (or alias)
- Show GitHub avatar/icon
- Right-click context menu (open in file manager, remove, etc.)
- Drag to reorder

**List Item Reference:** `app/src/ui/repositories-list/repository-list-item.tsx`

#### 6.4 Repository View

**Reference:** `app/src/ui/repository/repository.tsx`

Main content area when repository is selected:

**Contains:**
- Tab bar (Changes | History)
- Tab content based on selection
- Sidebar for file list
- Main pane for diff/details

**Tab Types:**
```typescript
enum RepositorySectionTab {
  Changes,  // Working directory changes
  History,  // Commit history
}
```

#### 6.5 Changes View

**Reference:** `app/src/ui/changes/changes.tsx`

Shows working directory changes:

**Layout:**
```
┌─────────────────────┬──────────────────────┐
│ Changed Files       │ File Diff            │
│                     │                      │
│ ☐ file1.ts (M)     │ @@ -10,5 +10,7 @@  │
│ ☑ file2.tsx (A)    │ +added line         │
│ ☐ file3.css (D)    │ -removed line       │
│                     │                      │
├─────────────────────┴──────────────────────┤
│ Commit Message                             │
│ ┌────────────────────────────────────────┐│
│ │ Summary                                ││
│ ├────────────────────────────────────────┤│
│ │ Description (optional)                 ││
│ └────────────────────────────────────────┘│
│                                            │
│ [Commit to main] button                   │
└────────────────────────────────────────────┘
```

**File List:**
- Checkbox to stage/unstage each file
- File status indicator (M=modified, A=added, D=deleted, R=renamed)
- File path
- Discard changes button

**File Change Model** (reference: `app/src/models/status.ts`):
```typescript
interface WorkingDirectoryFileChange {
  path: string
  status: AppFileStatus
  selection: DiffSelection  // Which lines are staged
  oldPath?: string  // For renames
}

enum AppFileStatusKind {
  New,
  Modified,
  Deleted,
  Copied,
  Renamed,
  Conflicted,
  Unmerged,
}
```

**Diff View Reference:** `app/src/ui/diff/diff.tsx`
- Syntax highlighted diff
- Side-by-side or unified view
- Line numbers
- Expandable hunks

**Commit Message Reference:** `app/src/ui/commit-message/commit-message.tsx`
- Summary field (max 72 chars, shows warning)
- Description field (optional, multi-line)
- Co-authors picker
- Commit button (disabled if no changes staged)

#### 6.6 History View

**Reference:** `app/src/ui/history/history.tsx`

Shows commit history:

**Layout:**
```
┌──────────────────────┬────────────────────┐
│ Commit List          │ Commit Details     │
│                      │                    │
│ • abc123 Fix bug     │ Commit: abc123     │
│   Author             │ Author: Name       │
│   2 hours ago        │ Date: ...          │
│                      │                    │
│ • def456 Add feature │ Message:           │
│   Author             │ Fix bug in parser  │
│   1 day ago          │                    │
│                      │ Changed Files:     │
│ • ghi789 Initial     │ - file1.ts         │
│   Author             │ - file2.tsx        │
│   2 days ago         │                    │
│                      │                    │
└──────────────────────┴────────────────────┘
```

**Commit List Reference:** `app/src/ui/history/commit-list.tsx`
- Virtual scrolling (react-virtualized) for performance
- Infinite scroll (load more on scroll)
- Avatar for author
- Short SHA
- Commit summary (first line of message)
- Author name
- Relative time
- Branch/tag labels

**Commit Detail Reference:** `app/src/ui/history/commit-details.tsx`
- Full commit message
- Author and committer info
- Timestamp
- SHA (with copy button)
- List of changed files
- Diff view for selected file

**Commit Model** (reference: `app/src/models/commit.ts`):
```typescript
interface Commit {
  sha: string
  shortSha: string  // First 7 chars
  summary: string   // First line
  body: string      // Rest of message
  author: CommitIdentity
  committer: CommitIdentity
  parents: string[]
  tags: string[]
  coAuthors: Author[]
}

interface CommitIdentity {
  name: string
  email: string
  date: Date
  tzOffset: number
}
```

### 7. Popup/Dialog System

**Reference:** `app/src/models/popup.ts`

Popups are modal dialogs.

**Popup Types:**
```typescript
enum PopupType {
  // Repository management
  CloneRepository,
  AddRepository,
  CreateRepository,
  RemoveRepository,

  // Branch operations
  CreateBranch,
  RenameBranch,
  DeleteBranch,

  // Preferences and settings
  Preferences,
  RepositorySettings,

  // Errors
  Error,

  // Authentication
  SignIn,

  // Merge conflicts
  MergeConflicts,

  // And many more...
}

type Popup =
  | { type: PopupType.Error; error: Error }
  | { type: PopupType.CreateBranch; repository: Repository }
  | { type: PopupType.Preferences; selectedTab?: PreferencesTab }
  | ... // Union of all popup types with their data
```

**Showing Popups:**
```typescript
dispatcher.showPopup({
  type: PopupType.CreateBranch,
  repository: selectedRepository
})
```

**Rendering Popups** (reference: `app/src/ui/app.tsx`):
```typescript
renderPopup() {
  const popup = this.state.currentPopup
  if (!popup) return null

  switch (popup.type) {
    case PopupType.CreateBranch:
      return <CreateBranch repository={popup.repository} dispatcher={...} />
    case PopupType.Error:
      return <AppError error={popup.error} />
    // ... handle all popup types
  }
}
```

### 8. Banner System

**Reference:** `app/src/models/banner.ts`

Banners are **non-modal** top-of-screen messages.

**Banner Types:**
```typescript
enum BannerType {
  SuccessfulMerge,
  MergeConflictsFound,
  SuccessfulRebase,
  RebaseConflictsFound,
  BranchAlreadyUpToDate,
  SuccessfulCherryPick,
  CherryPickConflictsFound,
  UpdateAvailable,
  // ... many more
}

type Banner =
  | { type: BannerType.SuccessfulMerge; ourBranch: string; theirBranch: string }
  | { type: BannerType.UpdateAvailable; version: string }
  | ... // Union type
```

**Rendering Banners** (reference: `app/src/ui/banners/`):
Each banner type has a component that renders with appropriate message, icon, and action buttons.

### 9. Data Flow Example

**User clicks "Commit" button:**

**Complete Flow with Timing:**

```
T+0ms:     User clicks "Commit" button
           ↓
T+5ms:     CommitMessage.onCommit() triggered
           ├── Validate inputs (message not empty, files staged)
           ├── Disable commit button (prevent double-click)
           └── Call dispatcher.createCommit()
               ↓
T+10ms:    Dispatcher.createCommit()
           ├── Log action: "Creating commit"
           ├── Call Phase 2 git.createCommit()
           │   ↓
T+20ms:    │   Git.createCommit()
           │   ├── git reset HEAD (clear staging)
           │   ├── git add <files> (stage selected files)
           │   ├── git commit -F - (create commit via stdin)
           │   └── Parse SHA from output
           │       ↓
T+150ms:   │   ← Returns SHA: "abc123..."
           │
           ├── Update local state
           ├── Call appStore._refreshRepository()
           │   ↓
T+160ms:   │   AppStore._refreshRepository()
           │   ├── Call git.getStatus() → new status
           │   ├── Call git.getCommits() → updated history
           │   ├── Update repositoryStateManager
           │   └── Call emitUpdate()
           │       ↓
T+300ms:   │   ← State refresh complete
           │
           ├── Set success banner
           ├── Clear commit message
           ├── Re-enable commit button
           └── Log success
               ↓
T+310ms:   App.onDidUpdate() receives new state
           ├── Call setState({ state: newState })
           └── Trigger React re-render
               ↓
T+320ms:   React reconciliation
           ├── Changes view re-renders (no staged files)
           ├── History view re-renders (new commit visible)
           ├── Banner appears at top
           └── Commit button enabled
               ↓
T+350ms:   UI update complete ✓
```

**Detailed Implementation:**

**Step 1: UI Component** (`CommitMessage.tsx`):

```typescript
class CommitMessage extends React.Component<ICommitMessageProps, ICommitMessageState> {
  state = {
    summary: '',
    description: '',
    isCommitting: false
  }

  onCommit = async () => {
    // Validation
    if (!this.state.summary.trim()) {
      this.props.dispatcher.showError(new Error('Commit message cannot be empty'))
      return
    }

    if (this.props.stagedFiles.length === 0) {
      this.props.dispatcher.showError(new Error('No files staged for commit'))
      return
    }

    // Prevent double-submit
    if (this.state.isCommitting) {
      return
    }

    this.setState({ isCommitting: true })

    try {
      await this.props.dispatcher.createCommit(
        this.props.repository,
        {
          summary: this.state.summary,
          description: this.state.description
        },
        this.props.stagedFiles
      )

      // Success - clear form
      this.setState({
        summary: '',
        description: '',
        isCommitting: false
      })
    } catch (error) {
      // Error handled by dispatcher error handlers
      this.setState({ isCommitting: false })
    }
  }

  render() {
    return (
      <div className="commit-message">
        <TextArea
          placeholder="Summary (required)"
          value={this.state.summary}
          onChange={summary => this.setState({ summary })}
          disabled={this.state.isCommitting}
        />
        <TextArea
          placeholder="Description (optional)"
          value={this.state.description}
          onChange={description => this.setState({ description })}
          disabled={this.state.isCommitting}
        />
        <Button
          onClick={this.onCommit}
          disabled={this.state.isCommitting || !this.state.summary}
          label={this.state.isCommitting ? 'Committing...' : 'Commit to main'}
        />
      </div>
    )
  }
}
```

**Step 2: Dispatcher** (`dispatcher.ts`):

```typescript
class Dispatcher {
  async createCommit(
    repo: Repository,
    message: ICommitMessage,
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): Promise<void> {
    console.log(`[Dispatcher] Creating commit in ${repo.name}`)

    try {
      // Call git operation (Phase 2)
      const sha = await createCommit(
        repo,
        `${message.summary}\n\n${message.description}`,
        files,
        false  // not amend
      )

      console.log(`[Dispatcher] Commit created: ${sha}`)

      // Update state - this will trigger UI refresh
      await this.appStore._refreshRepository(repo)

      // Show success feedback
      this.setBanner({
        type: BannerType.SuccessfulCommit,
        sha: sha.substring(0, 7),
        onUndo: () => this.undoCommit(repo, sha)
      })

      // Clear commit message
      await this.appStore.setCommitMessage(repo, null)

      // Record stats
      this.statsStore.increment('commits.created')
    } catch (error) {
      console.error(`[Dispatcher] Commit failed:`, error)

      // Error handlers will process this and show appropriate UI
      throw error
    }
  }
}
```

**Step 3: AppStore** (`app-store.ts`):

```typescript
class AppStore {
  private state: IAppState
  private emitter = new Emitter()

  async _refreshRepository(repo: Repository): Promise<void> {
    console.log(`[AppStore] Refreshing repository ${repo.name}`)

    try {
      // Load fresh git status
      const status = await getStatus(repo)

      // Load updated commit history
      const commits = await getCommits(repo, 'HEAD', 100)

      // Load branches (current might have changed)
      const branches = await getBranches(repo, 'refs/heads/', 'refs/remotes/')
      const currentBranch = branches.find(b => b.type === BranchType.Local && b.isHead)

      // Load tags
      const tags = await getTags(repo)

      // Load ahead/behind counts
      const aheadBehind = currentBranch && currentBranch.upstream
        ? await getAheadBehind(repo, currentBranch.name, currentBranch.upstream)
        : null

      // Update repository state cache
      this.repositoryStateManager.updateStatus(repo, status)
      this.repositoryStateManager.updateHistory(repo, {
        history: commits,
        hasMore: commits.length === 100
      })
      this.repositoryStateManager.updateBranches(repo, branches, currentBranch)
      this.repositoryStateManager.updateTags(repo, tags)
      this.repositoryStateManager.updateAheadBehind(repo, aheadBehind)

      // Emit state change to trigger UI update
      this.emitUpdate()

      console.log(`[AppStore] Repository refreshed successfully`)
    } catch (error) {
      console.error(`[AppStore] Failed to refresh repository:`, error)
      throw error
    }
  }

  private emitUpdate() {
    // Emit change event
    this.emitter.emit('did-update', this.state)
  }

  onDidUpdate(fn: (state: IAppState) => void): Disposable {
    return this.emitter.on('did-update', fn)
  }
}
```

**Step 4: React Component** (`App.tsx`):

```typescript
class App extends React.Component<IAppProps, IAppState> {
  private unsubscribe: Disposable | null = null

  componentDidMount() {
    // Subscribe to store updates
    this.unsubscribe = this.props.appStore.onDidUpdate(state => {
      console.log('[App] State updated, re-rendering')
      this.setState({ state })  // Triggers React re-render
    })

    // Load initial state
    const initialState = this.props.appStore.getState()
    this.setState({ state: initialState })
  }

  componentWillUnmount() {
    // Cleanup subscription
    if (this.unsubscribe) {
      this.unsubscribe.dispose()
    }
  }

  render() {
    const { state } = this.state

    if (!state) {
      return <Loading />
    }

    return (
      <div id="desktop-app-contents">
        <TitleBar />
        <Toolbar
          currentBranch={state.currentBranch}
          aheadBehind={state.aheadBehind}
        />
        {this.renderRepository(state)}
        {this.renderBanner(state.currentBanner)}
      </div>
    )
  }
}
```

**Step 5: UI Updates**:

After `emitUpdate()` is called:

1. **Changes View** (`Changes.tsx`):
   - Receives new `workingDirectory` prop with no staged files
   - Re-renders file list (now empty)
   - Clears commit message box
   - Updates commit button state

2. **History View** (`History.tsx`):
   - Receives new `commitHistory` prop with new commit at top
   - Re-renders commit list with new commit highlighted
   - Virtual scroll updates to show new item

3. **Banner** (`Banner.tsx`):
   - Receives new `currentBanner` prop
   - Renders success message: "Successfully created commit abc123"
   - Shows "Undo" button

4. **Toolbar** (`Toolbar.tsx`):
   - Receives updated `aheadBehind` prop (now 1 commit ahead)
   - Updates push/pull button to show "Push 1 commit"

### 10. Styling Architecture

**Reference:** `app/styles/` directory

**Technology:** SCSS (Sass)

**Structure:**
```
app/styles/
├── desktop.scss              # Main entry point
├── ui/
│   ├── _variables.scss       # Colors, spacing, fonts
│   ├── _mixins.scss          # Reusable style patterns
│   ├── changes/              # Changes view styles
│   ├── history/              # History view styles
│   ├── toolbar/              # Toolbar styles
│   ├── repository-list/      # Repository list styles
│   └── ... (one directory per feature)
└── themes/
    ├── light.scss
    └── dark.scss
```

**Theme System:**
Uses CSS variables for theme switching:
```scss
:root {
  --background-color: #ffffff;
  --text-color: #000000;
  // ... many more
}

[data-theme="dark"] {
  --background-color: #1e1e1e;
  --text-color: #ffffff;
  // ... overrides for dark theme
}
```

**Component Styling Pattern:**
Each component has its own SCSS file with BEM naming:
```scss
.commit-message {
  &__summary {
    font-size: 14px;
  }

  &__description {
    font-size: 12px;
  }

  &__button {
    background: var(--button-background);
  }
}
```

### 11. Performance Considerations

#### Virtual Scrolling

**For long lists** (commit history, file lists), use virtual scrolling:

**Library:** react-virtualized (reference: `app/package.json`)

**Implementation:**
```typescript
import { List } from 'react-virtualized'

<List
  width={width}
  height={height}
  rowCount={commits.length}
  rowHeight={50}
  rowRenderer={({ index, key, style }) => (
    <div key={key} style={style}>
      <CommitListItem commit={commits[index]} />
    </div>
  )}
/>
```

This only renders visible rows, keeping performance high with 10,000+ commits.

#### Memoization

**Use memoization** for expensive computations:

```typescript
import memoizeOne from 'memoize-one'

class HistoryView extends React.Component {
  // Only recomputes if commits array changes
  getFilteredCommits = memoizeOne((commits: Commit[], filter: string) => {
    return commits.filter(c => c.summary.includes(filter))
  })

  render() {
    const filtered = this.getFilteredCommits(this.props.commits, this.state.filter)
    return <CommitList commits={filtered} />
  }
}
```

Reference: `memoize-one` package used throughout codebase

### 12. Loading States

**Show loading indicators** during async operations:

```typescript
interface IChangesState {
  isCommitting: boolean
  isLoading: boolean
}

render() {
  if (this.state.isLoading) {
    return <LoadingSpinner />
  }

  return (
    <div>
      <FileList />
      <CommitButton
        disabled={this.state.isCommitting}
        label={this.state.isCommitting ? 'Committing...' : 'Commit'}
      />
    </div>
  )
}
```

## Success Criteria

At the end of Phase 3, you should have:

1. ✅ Store architecture with AppStore and specialized stores
2. ✅ Dispatcher pattern handling all actions
3. ✅ Root App component rendering
4. ✅ Repository list sidebar
5. ✅ Repository selection and switching
6. ✅ Changes view showing modified files
7. ✅ File staging/unstaging with checkboxes
8. ✅ Commit message input
9. ✅ Commit creation flow
10. ✅ History view showing commit list
11. ✅ Commit selection and detail view
12. ✅ Branch dropdown with switching
13. ✅ Push/pull button
14. ✅ Basic popup/dialog system
15. ✅ Banner notification system
16. ✅ Theme switching (light/dark)
17. ✅ Error handling with error handlers

## What This Phase Does NOT Include

- Advanced UI components (complex dialogs, tooltips, popovers)
- GitHub-specific UI (pull requests, issues)
- Merge conflict resolution UI
- Advanced git operations UI (rebase, cherry-pick, stash)
- Drag and drop
- Advanced diff features (split view, syntax highlighting)
- Animations and transitions
- Accessibility features
- Keyboard shortcuts

## Key Files to Reference

```
app/src/ui/
  ├── app.tsx                          (Root component - 3,710 lines)
  ├── index.tsx                        (React initialization)
  ├── dispatcher/
  │   ├── dispatcher.ts                (Command hub - 4,095 lines)
  │   └── error-handlers.ts            (Error middleware)
  │
  ├── repositories-list/               (Repository sidebar)
  ├── repository/                      (Main repository view)
  ├── changes/                         (Changes tab)
  ├── history/                         (History tab)
  ├── toolbar/                         (Top toolbar)
  ├── window/                          (Title bar)
  ├── commit-message/                  (Commit UI)
  └── diff/                            (Diff viewer)

app/src/lib/
  ├── app-state.ts                     (State type definitions - 200+ lines)
  ├── stores/
  │   ├── app-store.ts                 (Central store)
  │   ├── repositories-store.ts
  │   ├── accounts-store.ts
  │   ├── sign-in-store.ts
  │   └── repository-state-cache.ts
  │
  └── databases/                       (IndexedDB wrappers)

app/src/models/
  ├── popup.ts                         (Popup types)
  ├── banner.ts                        (Banner types)
  ├── repository.ts
  ├── commit.ts
  ├── branch.ts
  ├── status.ts
  └── diff.ts

app/styles/                            (SCSS stylesheets)
```

## Technology-Specific Implementation Notes

### For React (Current)
- React 16.8.4 with hooks
- react-virtualized for lists
- memoize-one for memoization
- SCSS for styling

### For Vue
- Vuex for state management
- Virtual scroller component
- Computed properties for memoization
- SCSS or CSS modules

### For Svelte
- Svelte stores for state
- Reactive declarations for memoization
- CSS-in-Svelte or SCSS
- Virtual list component

### For Solid.js
- Signals and stores for state
- createMemo for memoization
- CSS modules or SCSS
- Virtual scrolling library

## Estimated Complexity

**Time Estimate:** 7-10 days for experienced developer
**Difficulty:** Medium-High
**Critical Path:** State management architecture must be solid before building UI components

## Dependencies

- **Phase 1** - IPC foundation
- **Phase 2** - Git operations

## Next Phase Preview

Phase 4 will implement GitHub integration including OAuth authentication, API calls, and GitHub repository association.
