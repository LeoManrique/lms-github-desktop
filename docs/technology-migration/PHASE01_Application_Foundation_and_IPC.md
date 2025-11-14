# Phase 1: Application Foundation and IPC

## Overview

This phase establishes the foundational architecture for the desktop application, including the dual-process model (main/backend and renderer/frontend), inter-process communication (IPC), window management, and basic application lifecycle. This is the absolute minimum viable foundation that all subsequent phases will build upon.

## Technology-Agnostic Requirements

### 1. Dual-Process Architecture

The application must implement a clear separation between:

1. **Backend Process** (equivalent to Electron's Main Process)
   - Has access to native OS APIs, file system, and system resources
   - Manages application lifecycle and window creation
   - Runs privileged operations
   - Entry point implementation: `app/src/main-process/main.ts`

2. **Frontend Process** (equivalent to Electron's Renderer Process)
   - Runs the UI framework (React in this case)
   - Sandboxed with limited system access
   - Communicates with backend via IPC
   - Entry point implementation: `app/src/ui/index.tsx`

**Reference Implementation:**
- Main process entry: `app/src/main-process/main.ts:1-100`
- Renderer process entry: `app/src/ui/index.tsx:1-429`
- Both processes run in separate contexts with defined boundaries

### 2. Inter-Process Communication (IPC)

Implement a **type-safe, bidirectional IPC system** with two communication patterns:

#### Pattern 1: One-Way Messages (Fire-and-Forget)
Frontend sends message to backend without expecting a response.

**Type Definition Reference:** `app/src/lib/ipc-shared.ts:27-89`

Required channels (minimum):
```typescript
{
  'renderer-ready': (time: number) => void
  'log': (level: LogLevel, message: string) => void
  'uncaught-exception': (error: Error) => void
  'send-error-report': (error: Error, extra: Record<string, string>, nonFatal: boolean) => void
  'menu-event': (name: MenuEvent) => void
  'window-state-changed': (windowState: WindowState) => void
  'minimize-window': () => void
  'maximize-window': () => void
  'unmaximize-window': () => void
  'close-window': () => void
  'focus-window': () => void
  'quit-app': () => void
}
```

#### Pattern 2: Request-Response (Async)
Frontend sends request and awaits backend response.

**Type Definition Reference:** `app/src/lib/ipc-shared.ts:99-136`

Required channels (minimum):
```typescript
{
  'get-path': (path: PathType) => Promise<string>
  'get-app-path': () => Promise<string>
  'move-to-trash': (path: string) => Promise<void>
  'show-item-in-folder': (path: string) => Promise<void>
  'open-external': (path: string) => Promise<boolean>
  'is-window-focused': () => Promise<boolean>
  'show-save-dialog': (options: SaveDialogOptions) => Promise<string | null>
  'show-open-dialog': (options: OpenDialogOptions) => Promise<string | null>
  'is-window-maximized': () => Promise<boolean>
  'get-current-window-state': () => Promise<WindowState | undefined>
}
```

**Implementation Requirements:**
1. **Type Safety**: All IPC channels must be typed on both sender and receiver
2. **Security**: Backend must validate sender origin (see `isTrustedIPCSender()` pattern)
3. **Error Handling**: IPC errors must be caught and reported appropriately
4. **Serialization**: Complex objects must be serializable (no functions, class instances)

**Reference Files:**
- Type definitions: `app/src/lib/ipc-shared.ts`
- Main process handlers: `app/src/main-process/ipc-main.ts`
- Renderer process client: `app/src/lib/ipc-renderer.ts`

#### IPC Implementation Workflow (Request-Response Pattern)

**Detailed Implementation Steps:**

**Step 1: Define Channel Contract in Shared Types**
```typescript
// app/src/lib/ipc-shared.ts
export interface IRequestResponseChannels {
  'get-path': (pathType: 'home' | 'appData' | 'temp') => Promise<string>
}
```

**Step 2: Implement Backend Handler**
```typescript
// app/src/main-process/ipc-main.ts
import { ipcMain, app } from 'electron'  // or equivalent

// Register handler
ipcMain.handle('get-path', async (event, pathType: string): Promise<string> => {
  // Security: Validate sender
  if (!isTrustedIPCSender(event.senderFrame)) {
    throw new Error('Untrusted IPC sender')
  }

  // Validate input
  const validPaths = ['home', 'appData', 'temp', 'desktop', 'documents']
  if (!validPaths.includes(pathType)) {
    throw new Error(`Invalid path type: ${pathType}`)
  }

  // Execute operation
  try {
    const path = app.getPath(pathType as any)
    return path
  } catch (error) {
    console.error(`Failed to get path ${pathType}:`, error)
    throw error
  }
})
```

**Step 3: Implement Frontend Client**
```typescript
// app/src/lib/ipc-renderer.ts
import { ipcRenderer } from 'electron'  // or equivalent

export async function getPath(pathType: string): Promise<string> {
  try {
    const result = await ipcRenderer.invoke('get-path', pathType)
    return result
  } catch (error) {
    console.error('IPC get-path failed:', error)
    throw new Error(`Failed to get ${pathType} path: ${error.message}`)
  }
}
```

**Step 4: Usage in Frontend**
```typescript
// app/src/ui/components/settings.tsx
const homePath = await getPath('home')
const tempPath = await getPath('temp')
```

#### IPC Error Handling Strategy

**Error Categories:**
1. **Network/Transport Errors** - IPC channel disconnected
2. **Validation Errors** - Invalid parameters
3. **Security Errors** - Untrusted sender
4. **Operation Errors** - Backend operation failed

**Error Handling Pattern:**
```typescript
// Wrap all IPC calls with try-catch
async function safeIPCCall<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error.message.includes('IPC channel')) {
      // Transport error - critical
      showFatalError('Application communication error')
      throw error
    } else if (error.message.includes('Validation')) {
      // Validation error - log and use fallback
      console.warn('IPC validation error:', error)
      return fallback!
    } else {
      // Unknown error - rethrow
      throw error
    }
  }
}

// Usage
const path = await safeIPCCall(
  () => getPath('home'),
  '/home/default'  // fallback
)
```

### 3. Application Lifecycle Management

#### Startup Sequence

**Reference:** `app/src/main-process/main.ts:55-100`

**Complete Startup Workflow with Timing:**

```
T+0ms:    Backend Process Starts
T+10ms:   ├── Initialize Logging System
T+20ms:   ├── Install Source Map Support
T+30ms:   ├── Register Global Error Handlers
T+50ms:   ├── Initialize Application (app.whenReady())
T+100ms:  ├── Create Main Window
T+150ms:  ├── Load Frontend HTML
T+200ms:  ├── Frontend Process Starts
T+300ms:  ├── Frontend: Initialize Stores
T+500ms:  ├── Frontend: Mount React
T+600ms:  ├── Frontend: Send 'renderer-ready' IPC
T+610ms:  └── Application Ready ✓
```

**Step 1: Initialize Logging System**

```typescript
// app/src/main-process/main.ts:1-10
import { initializeLogging } from './logging'

// Set log file path
const logPath = path.join(
  app.getPath('userData'),
  'logs',
  `desktop-${Date.now()}.log`
)

// Initialize Winston logger
initializeLogging(logPath, {
  level: __DEV__ ? 'debug' : 'info',
  enableConsole: __DEV__,
  enableFile: true,
  maxFiles: 7,  // Keep 1 week of logs
  maxSize: 10 * 1024 * 1024  // 10MB per file
})

// Enable source map support for better stack traces
require('source-map-support').install()

console.log(`[T+${performance.now()}ms] Logging initialized`)
```

**Reference:** `app/src/main-process/main.ts:1` (imports logging/main/install)

**Step 2: Launch Time Tracking**

```typescript
// app/src/main-process/main.ts:60
const launchTime = performance.now()
let rendererReadyTime: number | null = null

// Listen for renderer ready signal
ipcMain.on('renderer-ready', (event, renderTime: number) => {
  rendererReadyTime = performance.now()
  const totalLaunchTime = rendererReadyTime - launchTime
  const frontendBootTime = renderTime

  console.log(`[PERF] Application launch metrics:`)
  console.log(`  - Backend init: ${rendererReadyTime - launchTime - frontendBootTime}ms`)
  console.log(`  - Frontend init: ${frontendBootTime}ms`)
  console.log(`  - Total: ${totalLaunchTime}ms`)

  // Send to analytics if enabled
  if (statsEnabled) {
    recordTiming('app.launch', totalLaunchTime)
  }
})
```

**Reference:** `app/src/main-process/main.ts:60` (`const launchTime = now()`)

**Step 3: Register Global Error Handlers**

```typescript
// app/src/main-process/main.ts:69-86
let preventQuit = false  // Used to prevent quit during critical operations

function handleUncaughtException(error: Error) {
  console.error('Uncaught exception in main process:', error)

  // Write crash log
  const crashLog = {
    timestamp: new Date().toISOString(),
    error: error.stack || error.message,
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion()
  }

  const crashPath = path.join(app.getPath('userData'), 'crashes', `crash-${Date.now()}.log`)
  fs.writeFileSync(crashPath, JSON.stringify(crashLog, null, 2))

  // Show error dialog
  dialog.showMessageBoxSync({
    type: 'error',
    title: 'Application Error',
    message: 'GitHub Desktop encountered a fatal error',
    detail: error.message,
    buttons: ['Quit', 'Copy Error', 'Send Report']
  })

  // Allow quit
  preventQuit = false
  app.quit()
}

// Register handlers
process.on('uncaughtException', handleUncaughtException)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason)
  handleUncaughtException(new Error(`Unhandled rejection: ${reason}`))
})

console.log(`[T+${performance.now()}ms] Error handlers registered`)
```

**Reference:** `app/src/main-process/main.ts:69-86` (handleUncaughtException)

**Step 4: Create Main Window**

```typescript
// app/src/main-process/main.ts:90-150
import { AppWindow } from './app-window'

// Wait for app ready
app.whenReady().then(async () => {
  console.log(`[T+${performance.now()}ms] App ready, creating window`)

  // Load saved window state
  const savedState = await loadWindowState()
  const windowState = savedState || {
    x: undefined,  // Center on screen
    y: undefined,
    width: 1000,
    height: 700,
    maximized: false,
    fullscreen: false
  }

  // Create window
  const mainWindow = new AppWindow(windowState)

  // Set up window event handlers
  mainWindow.onClose(() => {
    // Save window state before close
    saveWindowState(mainWindow.getBounds())
  })

  mainWindow.onShow(() => {
    console.log(`[T+${performance.now()}ms] Window visible`)
  })

  // Load frontend HTML
  const htmlPath = __DEV__
    ? 'http://localhost:3000/index.html'
    : `file://${__dirname}/renderer/index.html`

  await mainWindow.load(htmlPath)
  console.log(`[T+${performance.now()}ms] Frontend loaded`)
})
```

**Window State Persistence:**

```typescript
// app/src/main-process/window-state.ts
interface WindowState {
  x: number | undefined
  y: number | undefined
  width: number
  height: number
  maximized: boolean
  fullscreen: boolean
}

async function loadWindowState(): Promise<WindowState | null> {
  const statePath = path.join(app.getPath('userData'), 'window-state.json')

  if (!fs.existsSync(statePath)) {
    return null
  }

  try {
    const data = await fs.promises.readFile(statePath, 'utf8')
    const state = JSON.parse(data)

    // Validate state is still valid (e.g., screen still exists)
    if (!isWindowPositionValid(state)) {
      console.warn('Saved window position is off-screen, ignoring')
      return null
    }

    return state
  } catch (error) {
    console.error('Failed to load window state:', error)
    return null
  }
}

function isWindowPositionValid(state: WindowState): boolean {
  const { screen } = require('electron')
  const displays = screen.getAllDisplays()

  // Check if window position intersects with any display
  return displays.some(display => {
    const { x, y, width, height } = display.bounds
    const windowX = state.x || 0
    const windowY = state.y || 0

    return (
      windowX >= x &&
      windowX < x + width &&
      windowY >= y &&
      windowY < y + height
    )
  })
}
```

**Step 5: Frontend Initialization**

**Frontend Entry Point (`app/src/ui/index.tsx`):**

```typescript
// Record frontend start time
const frontendStartTime = performance.now()

// Step 1: Environment setup (development tools)
if (__DEV__) {
  // Install React DevTools, etc.
  require('electron-react-devtools').install()
}

// Step 2: Shell environment patching (macOS fix for PATH)
import { updateEnvironmentForProcess } from './lib/shell'
if (needsShellEnvironmentPatching()) {
  await updateEnvironmentForProcess()
}

// Step 3: Git environment setup
process.env.LOCAL_GIT_DIRECTORY = path.join(process.resourcesPath, 'git')
delete process.env.GIT_EXEC_PATH  // Prevent conflicts

// Step 4: Error tracking setup
setupErrorHandling()

// Step 5: Initialize stores
const accountsStore = new AccountsStore(localStorage, TokenStore)
const repositoriesStore = new RepositoriesStore(new RepositoriesDatabase('GitHubDesktop'))
// ... more stores

// Step 6: Initialize dispatcher
const dispatcher = new Dispatcher(appStore, repositoryStateManager, statsStore)

// Step 7: Mount React app
const container = document.getElementById('desktop-app-container')
ReactDOM.render(
  <App
    dispatcher={dispatcher}
    appStore={appStore}
    startTime={frontendStartTime}
  />,
  container
)

// Step 8: Send ready signal to backend
const totalBootTime = performance.now() - frontendStartTime
ipcRenderer.send('renderer-ready', totalBootTime)
console.log(`[Frontend] Ready in ${totalBootTime}ms`)
```

**Frontend Reference:** `app/src/ui/index.tsx:191-217` (onUncaughtException)

#### Shutdown Sequence

**Reference:** `app/src/main-process/main.ts:62` (preventQuit flag)

**Shutdown State Machine:**

```
User Triggers Quit
       ↓
   [before-quit event]
       ↓
   Check preventQuit flag
       ├── true  → Cancel quit, show message
       └── false → Continue
           ↓
       Check for uncommitted changes
           ├── true  → Show confirmation dialog
           │           ├── Cancel → Cancel quit
           │           └── Confirm → Continue
           └── false → Continue
               ↓
           [will-quit event]
               ↓
           Cleanup Operations:
           ├── Save window state
           ├── Close all databases
           ├── Flush logs
           ├── Terminate git processes
           └── Clear temp files
               ↓
           [quit event]
               ↓
           Process exits
```

**Implementation:**

```typescript
// app/src/main-process/main.ts
let preventQuit = false
let isQuitting = false

// Set this flag during critical operations
export function setPreventQuit(prevent: boolean) {
  preventQuit = prevent
}

// before-quit: First chance to prevent quit
app.on('before-quit', (event) => {
  if (preventQuit && !isQuitting) {
    event.preventDefault()

    dialog.showMessageBox({
      type: 'warning',
      title: 'Operation in Progress',
      message: 'Cannot quit while operation is in progress',
      detail: 'Please wait for the current operation to complete',
      buttons: ['OK']
    })

    return
  }

  // Check for uncommitted changes
  if (hasUncommittedChanges() && !isQuitting) {
    event.preventDefault()

    const choice = dialog.showMessageBoxSync({
      type: 'question',
      title: 'Uncommitted Changes',
      message: 'You have uncommitted changes',
      detail: 'Are you sure you want to quit?',
      buttons: ['Cancel', 'Quit Anyway'],
      defaultId: 0,
      cancelId: 0
    })

    if (choice === 1) {  // Quit Anyway
      isQuitting = true
      app.quit()
    }

    return
  }
})

// will-quit: Perform cleanup
app.on('will-quit', async (event) => {
  event.preventDefault()  // Prevent immediate quit

  console.log('Application shutting down, performing cleanup...')

  try {
    // 1. Save window state
    if (mainWindow) {
      const bounds = mainWindow.getBounds()
      await saveWindowState(bounds)
      console.log('✓ Window state saved')
    }

    // 2. Close all databases
    await closeAllDatabases()
    console.log('✓ Databases closed')

    // 3. Flush logs
    await logger.flush()
    console.log('✓ Logs flushed')

    // 4. Kill all git processes
    await killAllGitProcesses()
    console.log('✓ Git processes terminated')

    // 5. Clear temp files
    await clearTempFiles()
    console.log('✓ Temp files cleared')

    console.log('Cleanup complete, exiting')
  } catch (error) {
    console.error('Error during cleanup:', error)
    // Continue with quit even if cleanup fails
  } finally {
    // Now actually quit
    app.exit(0)
  }
})

// window-all-closed: Platform-specific behavior
app.on('window-all-closed', () => {
  // On macOS, apps typically stay open even with no windows
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Example of preventing quit during critical operation
async function performCriticalOperation() {
  setPreventQuit(true)

  try {
    await doSomethingCritical()
  } finally {
    setPreventQuit(false)
  }
}
```

**Cleanup Functions:**

```typescript
async function closeAllDatabases() {
  // Close IndexedDB connections
  const databases = [
    repositoriesDatabase,
    pullRequestDatabase,
    issuesDatabase
    // ... more databases
  ]

  await Promise.all(databases.map(db => db.close()))
}

async function killAllGitProcesses() {
  // Track all spawned git processes
  for (const gitProcess of activeGitProcesses) {
    if (!gitProcess.killed) {
      gitProcess.kill('SIGTERM')

      // Wait up to 5 seconds for graceful shutdown
      await Promise.race([
        new Promise(resolve => gitProcess.on('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 5000))
      ])

      // Force kill if still running
      if (!gitProcess.killed) {
        gitProcess.kill('SIGKILL')
      }
    }
  }

  activeGitProcesses.clear()
}

async function clearTempFiles() {
  const tempDir = path.join(app.getPath('temp'), 'github-desktop')

  if (fs.existsSync(tempDir)) {
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  }
}
```

### 4. Window Management

Implement a window manager class that handles:

#### Window State Persistence

**Data Structure** (reference: `app/src/lib/window-state.ts`):
```typescript
{
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
  fullscreen: boolean
}
```

**Requirements:**
- Save window state on close
- Restore window state on launch
- Handle multiple displays
- Validate restored bounds (ensure window is visible on available displays)

#### Window Operations

**Reference:** `app/src/main-process/app-window.ts` (14,339 lines - comprehensive window management)

Must support:
- Minimize
- Maximize/Unmaximize
- Close
- Focus/Blur
- Fullscreen toggle
- Zoom factor (for accessibility)
- Window state queries (is maximized, is focused, etc.)

**IPC Integration:**
Windows operations are triggered via IPC messages from frontend:
- `minimize-window` → minimize
- `maximize-window` / `unmaximize-window` → toggle maximize
- `close-window` → close
- `focus-window` → bring to front

**State Synchronization:**
Backend must notify frontend of window state changes:
- `window-state-changed` (WindowState) - position/size/maximization
- `focus` / `blur` - focus state
- `zoom-factor-changed` (number) - zoom level

### 5. Frontend Initialization

**Reference:** `app/src/ui/index.tsx:79-428`

#### Environment Setup

1. **Development Tools** (dev mode only)
   - Install global debugging helpers
   - Reference: `app/src/ui/index.tsx:79-81`

2. **Shell Environment**
   - Detect if shell needs patching
   - Update environment variables for proper PATH
   - Reference: `app/src/ui/index.tsx:85-87`
   - Utility: `app/src/lib/shell.ts`

3. **Source Maps**
   - Enable source map support for stack traces
   - Reference: `app/src/ui/index.tsx:89`

4. **Git Environment**
   - Set `LOCAL_GIT_DIRECTORY` to bundled git location
   - Clear `GIT_EXEC_PATH` to prevent conflicts
   - Reference: `app/src/ui/index.tsx:93-99`

#### Error Tracking

**Global Error Handler Reference:** `app/src/ui/index.tsx:118-186`

Implement context-aware error reporting:
- Capture uncaught exceptions
- Capture unhandled promise rejections
- Attach application state context (current screen, repository count, etc.)
- Send to error reporting service
- In dev mode: log to console only

**Context Data to Capture:**
```typescript
{
  osVersion: string
  currentBanner: string | null
  currentPopup: string | null
  selectedState: string | null
  selectedRepositorySection: string | null
  inWelcomeFlow: boolean
  windowZoomFactor: number
  activeAppErrors: number
  repositoryCount: number
  windowState: string
  accounts: number
}
```

#### Store Initialization

**Reference:** `app/src/ui/index.tsx:247-319`

Create all data stores before rendering UI:

**Required Stores (Phase 1 minimum):**
1. **AccountsStore** - User authentication state
2. **RepositoriesStore** - Repository list and metadata
3. **AppStore** - Central application state
4. **SignInStore** - Authentication flow state

**Store Pattern:**
- Stores use event emitter pattern for change notifications
- Stores backed by IndexedDB for persistence where needed
- Stores communicate via Dispatcher (command pattern)

Each store initialization example:
```typescript
const accountsStore = new AccountsStore(localStorage, TokenStore)
const repositoriesStore = new RepositoriesStore(
  new RepositoriesDatabase('Database')
)
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

#### Dispatcher Initialization

**Reference:** `app/src/ui/index.tsx:325-347`

The Dispatcher is the central command handler (see `app/src/ui/dispatcher/` - 4,095 lines)

Pattern:
```typescript
const dispatcher = new Dispatcher(appStore, repositoryStateManager, statsStore)

// Register error handlers
dispatcher.registerErrorHandler(defaultErrorHandler)
dispatcher.registerErrorHandler(customHandler1)
// ... more handlers
```

Error handlers are middleware that intercept specific error types and present appropriate UI.

#### React Rendering

**Reference:** `app/src/ui/index.tsx:416-428`

Final step: Mount React app
```typescript
ReactDOM.render(
  <App
    dispatcher={dispatcher}
    appStore={appStore}
    repositoryStateManager={repositoryStateManager}
    issuesStore={issuesStore}
    gitHubUserStore={gitHubUserStore}
    aheadBehindStore={aheadBehindStore}
    startTime={startTime}
  />,
  document.getElementById('desktop-app-container')!
)
```

Send ready signal to backend:
```typescript
ipcRenderer.send('renderer-ready', performance.now() - startTime)
```

### 6. Logging Infrastructure

**Main Process Logging:** `app/src/main-process/log.ts`

Requirements:
- Log to file in application data directory
- Log to console in dev mode
- Support multiple log levels (error, warn, info, debug)
- Include timestamps
- Rotate log files to prevent excessive size
- Enable/disable based on environment

**Frontend Logging:** `app/src/lib/logging/renderer/install`

- Frontend logs should be forwarded to main process via IPC
- Use 'log' IPC channel
- Reference: `app/src/lib/ipc-shared.ts:49`

### 7. Path Management

The backend must provide OS-specific paths to the frontend via IPC.

**Path Types** (reference: `app/src/ui/lib/app-proxy.ts`):
- `home` - User home directory
- `appData` - Application data directory
- `userData` - User-specific app data
- `temp` - Temporary files
- `exe` - Executable path
- `desktop` - Desktop directory
- `documents` - Documents directory

**IPC Channel:** `get-path`
**Reference:** `app/src/lib/ipc-shared.ts:100`

### 8. Platform Detection

Must detect and expose to frontend:
- Operating system (macOS, Windows, Linux)
- CPU architecture (x64, arm64)
- Whether running under Rosetta translation (macOS only)

**IPC Channels:**
- `get-app-architecture` - Returns CPU architecture
- `is-running-under-arm64-translation` - ARM64 emulation check

**References:**
- `app/src/lib/ipc-shared.ts:101-103`
- `app/src/lib/get-architecture.ts`

### 9. Application Menu

Implement basic application menu structure:

**Menu Categories:**
- File (New, Open, Preferences, Quit)
- Edit (Undo, Redo, Cut, Copy, Paste, Select All)
- View (Toggle Fullscreen, Zoom In/Out/Reset)
- Window (Minimize, Maximize)
- Help (About, Documentation)

**Reference:** `app/src/main-process/menu/` directory

**IPC Flow:**
1. Backend builds menu → sends to frontend via `app-menu` channel
2. Frontend displays menu state
3. User clicks menu item → frontend sends `menu-event` IPC message
4. Backend handles menu event

**Menu State Synchronization:**
- Menu items can be enabled/disabled dynamically
- Frontend sends `update-menu-state` with current item states
- Reference: `app/src/lib/ipc-shared.ts:30-32`

### 10. Development vs Production Modes

Implement environment detection:

**Environment Flags:**
- `__DEV__` - Development mode
- `process.env.NODE_ENV` - 'development' | 'production'
- `process.env.TEST_ENV` - Test mode

**Conditional Behavior:**
- Development: Enable DevTools, verbose logging, disable crash reporting
- Production: Disable DevTools, minimal logging, enable crash reporting, enable auto-updates
- Test: Mock IPC, disable external services

**References:**
- `app/src/ui/index.tsx:79` (dev globals)
- `app/src/ui/index.tsx:127` (dev error handling)

### 11. Native OS Integration (Basic)

#### Dialog APIs

**File Dialogs:**
- Open file/folder dialog
- Save file dialog
- Return selected path(s)

**IPC Channels:**
- `show-open-dialog` (options) → Promise<string | null>
- `show-save-dialog` (options) → Promise<string | null>

**References:** `app/src/lib/ipc-shared.ts:118-123`

#### Shell Integration

**Operations:**
- Open path in file manager (`show-item-in-folder`)
- Open URL in default browser (`open-external`)
- Move file to trash/recycle bin (`move-to-trash`)

**References:** `app/src/lib/ipc-shared.ts:104-105, 111`

### 12. Basic Data Persistence

#### Local Storage
Use browser LocalStorage API for simple key-value pairs:
- Window state
- User preferences
- UI state

#### IndexedDB
Use IndexedDB for structured data:
- Repository metadata
- User accounts
- Application state

**Wrapper Library:** Dexie (reference: `app/package.json` - dexie@3.2.3)

**Initial Database Setup:**
```typescript
class BaseDatabase {
  protected database: Dexie

  constructor(name: string, schemaVersion: number) {
    this.database = new Dexie(name)
    this.database.version(schemaVersion).stores({
      // Schema definition
    })
  }
}
```

**Reference Pattern:** `app/src/lib/databases/base-database.ts`

## Success Criteria

At the end of Phase 1, you should have:

1. ✅ A desktop application that launches with main and renderer processes
2. ✅ Functional IPC communication in both directions
3. ✅ Window that can be minimized, maximized, closed
4. ✅ Window state persists between sessions
5. ✅ Logging system writing to file and console
6. ✅ Error reporting capturing uncaught exceptions
7. ✅ Basic application menu
8. ✅ File/folder dialogs working
9. ✅ Application can be quit gracefully
10. ✅ Development and production builds working
11. ✅ Empty React app renders successfully
12. ✅ Store infrastructure initialized
13. ✅ Dispatcher pattern established

## What This Phase Does NOT Include

- Any Git operations
- Any GitHub integration
- Any UI beyond a blank window
- Repository management
- User authentication
- Complex data models
- Advanced features

## Key Files to Reference

```
app/src/main-process/
  ├── main.ts                    (Entry point, lifecycle - 23,882 lines)
  ├── app-window.ts              (Window management - 14,339 lines)
  ├── ipc-main.ts                (IPC handlers - 2,032 lines)
  ├── log.ts                     (Logging)
  ├── menu/                      (Menu building)
  └── exception-reporting.ts     (Error reporting)

app/src/ui/
  ├── index.tsx                  (Frontend entry - 429 lines)
  ├── app.tsx                    (Root React component - 3,710 lines)
  └── lib/
      └── app-proxy.ts           (IPC helpers)

app/src/lib/
  ├── ipc-shared.ts              (IPC type definitions - 136 lines)
  ├── ipc-renderer.ts            (IPC client)
  ├── window-state.ts            (Window state type)
  ├── shell.ts                   (Shell utilities)
  ├── get-architecture.ts        (Platform detection)
  ├── logging/                   (Logging infrastructure)
  └── databases/
      └── base-database.ts       (Database foundation)

app/src/models/
  └── window-state.ts            (Window state model)
```

## Technology-Specific Implementation Notes

### For Electron
- Use `electron` module directly
- `ipcMain.on()` / `ipcMain.handle()` for backend
- `ipcRenderer.send()` / `ipcRenderer.invoke()` for frontend
- `BrowserWindow` class for window management

### For Tauri
- Use Tauri IPC via `@tauri-apps/api`
- Commands defined in Rust with `#[tauri::command]`
- Frontend uses `invoke()` function
- Window management via `@tauri-apps/api/window`

### For Wails
- Use Wails v2/v3 runtime
- Go functions exposed via `wails.Bind()`
- Frontend uses `window.go.main.FunctionName()`
- Window management via Wails runtime API

### For NW.js
- Similar to Electron but single-process model
- IPC not needed (shared context)
- Use `nw.Window.get()` for window management

## Estimated Complexity

**Time Estimate:** 3-5 days for experienced developer
**Difficulty:** Medium
**Critical Path:** IPC system must work perfectly before proceeding to Phase 2

## Dependencies

**None** - This is the foundation layer

## Next Phase Preview

Phase 2 will implement core Git operations (clone, commit, push, pull, branch) building on this IPC and window foundation.
