# Implementation Plan: Claude Code Commit Message Generation Button

## Implementation Status

### ✅ Phase 1: MVP - COMPLETED

**Status:** Working! Button appears and generates commit messages.

**Completed:**
- ✅ Claude icon created and styled to match Copilot button
- ✅ Basic CLI integration with WSL support for Windows
- ✅ Uses Haiku model for faster, cheaper commit message generation
- ✅ Button rendering in UI (both `ChangesList` and `FilterChangesList`)
- ✅ Event handlers and dispatcher routing
- ✅ App-store integration with diff generation
- ✅ Comprehensive logging for debugging
- ✅ 2-minute timeout for generation
- ✅ JSON parsing with markdown code block stripping
- ✅ Override warning dialog integration (calls Claude, not Copilot)

**Issues Encountered & Fixed:**
1. **FilterChangesList missing handler** - App uses filtered changes list feature, needed to add handler to both `ChangesList` AND `FilterChangesList`
2. **Windows WSL PATH issues** - Claude CLI installed via NVM in WSL doesn't have PATH set when running `wsl claude`. Fixed by using `wsl bash -i -c` to load `.bashrc`
3. **Claude CLI output format** - `--output-format json` returns wrapper JSON with `result` field containing markdown code blocks. Added parsing to extract and clean the actual JSON.
4. **Timeout too short** - Increased from 30s to 120s (2 minutes) to account for interactive bash startup + Claude processing time
5. **Button styling** - Added CSS to match Copilot button appearance
6. **Override button calling wrong method** - When user had existing commit message, clicking "Override" was calling Copilot generation instead of Claude. Fixed by adding `provider` parameter through entire override flow (popup type → dispatcher → dialog component)

**Files Modified:**
- ✅ `app/src/ui/octicons/claude.ts` (new)
- ✅ `app/src/ui/octicons/index.ts`
- ✅ `app/src/lib/claude-cli.ts` (new)
- ✅ `app/src/ui/changes/commit-message.tsx`
- ✅ `app/src/ui/changes/changes-list.tsx`
- ✅ `app/src/ui/changes/filter-changes-list.tsx` ⚠️ (discovered during implementation)
- ✅ `app/src/ui/dispatcher/dispatcher.ts`
- ✅ `app/src/lib/stores/app-store.ts`
- ✅ `app/src/styles/ui/changes/_commit-message.scss`
- ✅ `app/src/models/popup.ts` (override fix)
- ✅ `app/src/ui/generate-commit-message/generate-commit-message-override-warning.tsx` (override fix)
- ✅ `app/src/ui/app.tsx` (override fix)

**Time Spent:** ~5-6 hours (including debugging WSL/PATH issues and override dialog fix)

---

## Overview

Add a second AI-powered commit message generation button that uses Claude Code CLI instead of GitHub Copilot API. This will leverage the user's Claude Code subscription through terminal command invocation.

---

## Key Differences from Copilot Implementation

| Aspect | Copilot | Claude Code |
|--------|---------|-------------|
| **Authentication** | OAuth token via GitHub API | Claude Code CLI subscription |
| **Invocation** | HTTP API request | Terminal command execution |
| **Feature Flag** | `account.isCopilotDesktopEnabled` | Check if `claude` CLI is installed |
| **Endpoint** | `copilotEndpoint` from account | Local CLI binary |
| **Request Format** | JSON over HTTP | Command args with `--output-format json` |
| **Disclaimer** | Required by GitHub | Optional (can show once) |
| **UI When Unavailable** | Button hidden if no account | Button shown but **disabled** with tooltip |

**UX Improvement:** Unlike Copilot (which hides when unavailable), Claude button is always visible. When CLI not installed, button is disabled with helpful tooltip. This:
- ✅ Promotes feature discovery
- ✅ Provides clear installation guidance
- ✅ Reduces user confusion ("where did the button go?")
- ✅ Encourages CLI adoption

---

## Architecture Changes

### 1. UI Layer Changes

**File:** `app/src/ui/changes/commit-message.tsx`

**New Method:** `renderClaudeButton()`

```typescript
private renderClaudeButton() {
  const {
    isCommitting,
    isGeneratingCommitMessage,
    filesSelected,
    commitToAmend,
    claudeCliAvailable,
  } = this.props

  const noFilesSelected = filesSelected.length === 0
  const noChangesAvailable = !commitToAmend && noFilesSelected

  // Determine disabled state and tooltip
  const cliNotInstalled = claudeCliAvailable === false
  const isDisabled =
    cliNotInstalled ||
    isCommitting === true ||
    isGeneratingCommitMessage ||
    noChangesAvailable

  const tooltip = cliNotInstalled
    ? 'Install Claude CLI to use this feature'
    : isGeneratingCommitMessage
    ? 'Generating commit message...'
    : noChangesAvailable
    ? 'Files must be selected to generate a commit message'
    : 'Generate commit message with Claude Code'

  return (
    <>
      <div className="separator" />
      <Button
        className="claude-button"
        onClick={this.onClaudeButtonClick}
        ariaLabel={tooltip}
        tooltip={tooltip}
        disabled={isDisabled}
      >
        <Octicon symbol={octicons.claude} />
      </Button>
    </>
  )
}

private onClaudeButtonClick = async (
  e: React.MouseEvent<HTMLButtonElement>
) => {
  e.preventDefault()
  const { commitMessage } = this.state

  this.props.onGenerateCommitMessageWithClaude?.(
    this.props.filesSelected,
    !!commitMessage.summary || !!commitMessage.description
  )
}
```

**Update:** `renderActionBar()` to include both buttons

```typescript
private renderActionBar() {
  if (!this.isCoAuthorInputEnabled) {
    return null
  }

  return (
    <div className={className}>
      {this.renderCoAuthorToggleButton()}
      {this.renderCopilotButton()}
      {this.renderClaudeButton()}  {/* Add Claude button */}
    </div>
  )
}
```

**New Props:**
```typescript
interface ICommitMessageProps {
  // ... existing props
  readonly claudeCliAvailable?: boolean
  readonly onGenerateCommitMessageWithClaude?: (
    filesSelected: ReadonlyArray<WorkingDirectoryFileChange>,
    mustOverrideExistingMessage: boolean
  ) => void
}
```

---

### 2. Event Handler Layer

**File:** `app/src/ui/changes/changes-list.tsx`

**New Method:**

```typescript
private onGenerateCommitMessageWithClaude = (
  filesSelected: ReadonlyArray<WorkingDirectoryFileChange>,
  mustOverrideExistingMessage: boolean
) => {
  this.props.dispatcher.incrementMetric(
    'generateCommitMessageWithClaudeButtonClickCount'
  )

  return mustOverrideExistingMessage
    ? this.props.dispatcher.promptOverrideWithGeneratedCommitMessage(
        this.props.repository,
        filesSelected,
        'claude' // Indicate which provider
      )
    : this.props.dispatcher.generateCommitMessageWithClaude(
        this.props.repository,
        filesSelected
      )
}
```

**Pass to CommitMessage:**
```typescript
<CommitMessage
  // ... existing props
  claudeCliAvailable={this.props.claudeCliAvailable}
  onGenerateCommitMessageWithClaude={this.onGenerateCommitMessageWithClaude}
/>
```

---

### 3. Dispatcher Layer

**File:** `app/src/ui/dispatcher/dispatcher.ts`

**New Methods:**

```typescript
public generateCommitMessageWithClaude(
  repository: Repository,
  filesSelected: ReadonlyArray<WorkingDirectoryFileChange>
) {
  return this.appStore._generateCommitMessageWithClaude(
    repository,
    filesSelected
  )
}

public checkClaudeCliAvailability(): Promise<boolean> {
  return this.appStore._checkClaudeCliAvailability()
}
```

---

### 4. Business Logic Layer

**File:** `app/src/lib/stores/app-store.ts`

**New State:**
```typescript
private claudeCliAvailable: boolean = false
```

**Initialize on Startup:**
```typescript
public async loadInitialState() {
  // ... existing initialization
  this.claudeCliAvailable = await this._checkClaudeCliAvailability()
}
```

**Main Generation Method:**

```typescript
public async _generateCommitMessageWithClaude(
  repository: Repository,
  filesSelected: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<boolean> {
  // Optional: Show disclaimer first time (less strict than Copilot)
  if (!this.claudeCommitMessageDisclaimerSeen) {
    await this._showPopup({
      type: PopupType.GenerateCommitMessageWithClaudeDisclaimer,
      repository,
      filesSelected,
    })
    return false
  }

  return this.withIsGeneratingCommitMessage(repository, async () => {
    // Get diff (same as Copilot)
    const commitToAmend = this.repositoryStateCache
      .get(repository)?.commitToAmend?.sha ?? undefined

    const diff = await getFilesDiffText(
      repository,
      filesSelected,
      commitToAmend ? `${commitToAmend}^` : undefined
    )

    if (!diff) {
      return false
    }

    try {
      // Invoke Claude CLI
      const response = await invokeClaude(diff)

      // Update commit message
      this._setCommitMessage(repository, {
        summary: response.title,
        description: response.description,
        timestamp: Date.now(),
        generatedByClaude: true, // New flag
      })

      this.statsStore.increment('generateCommitMessageWithClaudeCount')
      return true
    } catch (e) {
      this.emitError(
        new ErrorWithMetadata(e, {
          repository,
          message: 'Failed to generate commit message with Claude Code',
        })
      )
      return false
    }
  })
}
```

**CLI Availability Check:**

```typescript
public async _checkClaudeCliAvailability(): Promise<boolean> {
  try {
    // Try to execute: claude --version
    const result = await spawn('claude', ['--version'])

    // If successful, CLI is available
    return result.exitCode === 0
  } catch (e) {
    // CLI not found or not accessible
    log.info('Claude CLI not available:', e)
    return false
  }
}
```

---

### 5. CLI Integration Layer

**New File:** `app/src/lib/claude-cli.ts`

```typescript
import { spawn } from './spawn'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface IClaudeCommitMessage {
  title: string
  description: string
}

/**
 * Builds the prompt for Claude Code to generate a commit message.
 *
 * Unlike Copilot (which uses a hidden server-side prompt), we have full control
 * over this prompt and can optimize it for better results.
 */
function buildCommitMessagePrompt(diff: string): string {
  return `You are an expert Git commit message generator. Analyze the following git diff and generate a high-quality commit message.

## Requirements:

1. **Summary Line (title)**:
   - Maximum 50 characters (strict limit)
   - Use imperative mood (e.g., "Add feature" not "Added feature")
   - Start with a verb (Add, Update, Fix, Remove, Refactor, etc.)
   - Do NOT end with a period
   - Be specific and descriptive

2. **Description**:
   - Scale the description based on the complexity and size of changes:
     * Small changes (1-2 files, <50 lines): Brief 1-2 sentence explanation
     * Medium changes (3-10 files, <500 lines): Detailed paragraph with bullet points
     * Large changes (>10 files or >500 lines): Comprehensive explanation with sections
   - Explain WHAT changed and WHY (not how - the diff shows how)
   - Use bullet points for multiple changes
   - Include context that would help reviewers understand the changes
   - Mention any breaking changes, deprecations, or important notes
   - Reference issue numbers if you see patterns like "fixes #123" in code
   - For large refactorings, explain the motivation and benefits

3. **Format**:
   - Respond with ONLY valid JSON
   - No markdown code blocks, no explanations, no preamble
   - Use this exact structure:
   {
     "title": "your summary here",
     "description": "your detailed description here"
   }

## Examples:

**Small change:**
{
  "title": "Fix typo in README",
  "description": "Corrects spelling of 'repository' in the installation section."
}

**Medium change:**
{
  "title": "Add user authentication middleware",
  "description": "Implements JWT-based authentication for API routes.\\n\\n- Add auth middleware to verify tokens\\n- Protect sensitive endpoints\\n- Include token refresh logic\\n\\nThis enables secure access control for the application."
}

**Large change:**
{
  "title": "Refactor database layer to use TypeORM",
  "description": "Migrates the entire database layer from raw SQL to TypeORM for better maintainability and type safety.\\n\\n**Changes:**\\n- Replace all raw SQL queries with TypeORM repositories\\n- Add entity definitions for User, Post, Comment models\\n- Implement database migrations system\\n- Update all service layer code to use new ORM\\n- Add comprehensive integration tests\\n\\n**Benefits:**\\n- Type-safe database queries\\n- Automatic migration management\\n- Better error handling\\n- Easier to write and maintain queries\\n\\n**Breaking changes:**\\n- Database schema has changed - run migrations before deploying\\n- Some query response formats are different\\n\\nFixes #456, closes #789"
}

## Git Diff to Analyze:

\`\`\`diff
${diff}
\`\`\`

Analyze the scope and complexity of these changes, then generate an appropriately detailed commit message as JSON.`
}

/**
 * Invokes Claude Code CLI to generate commit message from diff.
 *
 * Uses stdin to bypass OS command length limits.
 * Supports diffs up to 20MB (2x better than Copilot's 10MB limit).
 */
export async function invokeClaude(
  diff: string
): Promise<IClaudeCommitMessage> {
  // Diff size limit: 20MB (2x Copilot's 10MB)
  const MAX_DIFF_SIZE = 20 * 1024 * 1024

  if (diff.length > MAX_DIFF_SIZE) {
    const sizeMB = (diff.length / 1024 / 1024).toFixed(1)
    const maxMB = MAX_DIFF_SIZE / 1024 / 1024
    throw new Error(
      `Diff is too large (${sizeMB}MB). Maximum size is ${maxMB}MB. ` +
      `Try selecting fewer files.`
    )
  }

  // Build prompt for Claude
  // Note: Unlike Copilot (which uses server-side prompt), we control this!
  const prompt = buildCommitMessagePrompt(diff)

  try {
    // Execute via stdin (bypasses OS command length limits)
    const result = await spawn('claude', [
      '--print',
      '--output-format',
      'json'
    ], {
      stdin: prompt,  // Send via stdin, not args!
      timeout: 30000, // 30 second timeout
    })

    if (result.exitCode !== 0) {
      throw new Error(
        `Claude CLI exited with code ${result.exitCode}: ${result.stderr}`
      )
    }

    // Parse response - should be clean JSON with --output-format json
    const output = result.stdout.trim()
    const parsed = JSON.parse(output) as IClaudeCommitMessage

    if (!parsed.title || !parsed.description) {
      throw new Error('Invalid response format from Claude CLI')
    }

    return parsed
  } catch (e) {
    log.error('Failed to invoke Claude CLI:', e)
    throw e
  }
}

/**
 * Check if Claude CLI is installed and accessible.
 */
export async function isClaudeCliAvailable(): Promise<boolean> {
  try {
    const result = await spawn('claude', ['--version'], {
      timeout: 5000,
    })
    return result.exitCode === 0
  } catch (e) {
    return false
  }
}
```

---

### 6. Prompt Engineering (Major Advantage Over Copilot)

**File:** `app/src/lib/claude-cli.ts`

**Key Discovery:** Unlike Copilot (which uses a proprietary server-side prompt at `/agents/github-desktop-commit-message-generation`), we have **full control** over our prompt.

**Our Prompt Strategy:**

1. **Adaptive Descriptions:**
   - Small changes (<50 lines): Brief 1-2 sentences
   - Medium changes (50-500 lines): Detailed with bullet points
   - Large changes (>500 lines): Comprehensive with sections (Changes, Benefits, Breaking Changes)

2. **Best Practices Enforced:**
   - Imperative mood ("Add" not "Added")
   - 50 character summary limit
   - Explain WHAT and WHY (not HOW)
   - Reference issue numbers
   - Highlight breaking changes

3. **Examples Provided:**
   - Small, medium, and large commit examples in the prompt
   - Shows Claude exactly what format we want
   - Ensures consistent output quality

4. **Future Customization Opportunities:**
   - Can add conventional commits format (feat:, fix:, etc.)
   - Can add emoji support (✨, 🐛, etc.)
   - Can add repository-specific guidelines
   - Can add language-specific context

**Prompt Function:**

See `buildCommitMessagePrompt(diff: string)` above for the complete implementation.

**Why This Is Better Than Copilot:**

| Aspect | Copilot | Claude Code |
|--------|---------|-------------|
| **Prompt Location** | Server-side (hidden) | Client-side (fully visible) |
| **Customization** | Impossible | Fully customizable |
| **Transparency** | Proprietary | Open and modifiable |
| **Adaptive Detail** | Unknown | Scales with change size |
| **Examples** | Unknown | Includes 3 examples |
| **Format Control** | Fixed | Can add conventions, emojis, etc. |

---

### 7. Data Model Changes

**File:** `app/src/models/commit-message.ts`

```typescript
export interface ICommitMessage {
  readonly summary: string
  readonly description: string | null
  readonly timestamp: number
  readonly generatedByCopilot?: boolean
  readonly generatedByClaude?: boolean  // New flag
}
```

**Note:** Both flags can coexist. User might generate with one, then regenerate with the other.

---

### 8. Popup Types

**File:** `app/src/models/popup.ts`

Add:
```typescript
GenerateCommitMessageWithClaudeDisclaimer
```

---

### 9. Disclaimer Dialog

**New File:** `app/src/ui/generate-commit-message/generate-commit-message-claude-disclaimer.tsx`

```typescript
import * as React from 'react'
import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'

interface IGenerateCommitMessageClaudeDisclaimerProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly filesSelected: ReadonlyArray<WorkingDirectoryFileChange>
  readonly onDismissed: () => void
}

export class GenerateCommitMessageClaudeDisclaimer extends React.Component<
  IGenerateCommitMessageClaudeDisclaimerProps
> {
  public render() {
    return (
      <Dialog
        title="Claude Code"
        id="generate-commit-message-claude-disclaimer"
        type="warning"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p>
            Claude Code will generate a commit message based on your changes.
            This requires the Claude CLI to be installed and you to be signed in.
            Review and edit the generated message before committing.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Continue" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    this.props.dispatcher.setClaudeCommitMessageDisclaimerSeen()
    this.props.dispatcher.generateCommitMessageWithClaude(
      this.props.repository,
      this.props.filesSelected
    )
    this.props.onDismissed()
  }
}
```

---

## Creating the Claude Icon

### Where to Save It

**New File:** `app/src/ui/octicons/claude.ts`

This follows the same pattern as other custom icons (`sync-clockwise.ts`, `diff.ts`).

### File Structure

```typescript
import { OcticonSymbolVariant } from '.'

/**
 * Claude AI icon for commit message generation.
 * Custom icon since Claude is not in the official Octicons library.
 *
 * Source: Anthropic's official Claude logo
 * Uses 24x24 viewBox (larger than standard 16x16 octicons)
 */
export const claude: OcticonSymbolVariant = {
  w: 24,
  h: 24,
  p: [
    'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z',
  ],
}
```

### SVG Path Extraction ✅

The Claude logo above uses a **24x24 viewBox** (larger than standard 16x16 octicons). This is fine - the Octicon component automatically scales icons based on height.

**Key features of this SVG:**
- ✅ Uses `fill="currentColor"` - automatically inherits color from CSS
- ✅ Single path element - simple and performant
- ✅ No hard-coded colors - adapts to light/dark themes
- ✅ Official Anthropic Claude logo

### Export from Index

**File:** `app/src/ui/octicons/index.ts`

Add this line:

```typescript
export * from './octicons.generated'
export { Octicon } from './octicon'
export { iconForRepository } from './repository'
export { iconForStatus } from './status'
export { syncClockwise } from './sync-clockwise'
export { claude } from './claude'  // ← Add this line
```

### Usage in Component

Once created and exported, use it like this:

```typescript
import * as octicons from './octicons/octicons.generated'

<Octicon symbol={octicons.claude} />
```

### Styling (Automatic Theme Support)

**No additional work needed!** The icon inherits color from the button via CSS:

```scss
// app/styles/ui/changes/_commit-message.scss
.claude-button {
  color: var(--text-secondary-color);  // Icon uses this color

  &:hover {
    color: var(--text-color);  // Icon changes on hover
  }
}
```

This works in both light and dark mode automatically via CSS variables. ✅

---

## Implementation Steps

This implementation is divided into 4 phases, prioritizing **making it work first, then making it work better**.

### Phase 1: MVP - Make It Work (3-4 hours)

**Goal:** Get a basic working Claude button that generates commit messages.

**What to Build:**
1. **Create Claude icon**
   - Create `app/src/ui/octicons/claude.ts` with Anthropic's SVG (ready to use!)
   - Export from `app/src/ui/octicons/index.ts`

2. **Create basic CLI integration**
   - Create `app/src/lib/claude-cli.ts` with minimal `invokeClaude()` function
   - Use simple 10-15 line prompt (no adaptive descriptions, no examples)
   - Basic spawn with `--print --output-format json`
   - Simple JSON parsing, throw on error

3. **Add button to UI**
   - Add `renderClaudeButton()` to `commit-message.tsx`
   - Always show button (no CLI availability check yet)
   - Add `onClaudeButtonClick` handler
   - Wire up through changes-list.tsx

4. **Add app-store method**
   - Create basic `_generateCommitMessageWithClaude()` in app-store
   - Get diff, call `invokeClaude()`, set commit message
   - No error handling beyond try/catch with console.log

5. **Add dispatcher routing**
   - Add `generateCommitMessageWithClaude()` to dispatcher
   - Connect UI → Dispatcher → AppStore

**What to Skip:**
- ❌ CLI availability check (assume it's installed)
- ❌ Disclaimer dialog
- ❌ Error handling (just log to console)
- ❌ Override warning (reuse Copilot's automatically)
- ❌ Metrics/analytics
- ❌ Loading states
- ❌ Diff size limits
- ❌ Custom styling

**Expected Result:** Button appears, click it, get a commit message. If it breaks, you see console errors.

---

### Phase 2: Make It Reliable (2-3 hours)

**Goal:** Add proper error handling so it doesn't crash.

**What to Add:**
1. **Error handling**
   - Catch spawn errors with user-friendly messages
   - Handle invalid JSON responses
   - Handle CLI timeout (30s)
   - Show error notifications instead of console.log

2. **Diff size limits**
   - Check diff size before sending (20MB limit)
   - Show helpful error: "Diff too large (X MB). Try selecting fewer files."

3. **CLI availability check**
   - Add `isClaudeCliAvailable()` function
   - Add `claudeCliAvailable` state to app-store
   - Check on app startup
   - Disable button if CLI not found
   - Show tooltip: "Install Claude CLI to use this feature"

4. **Override warning**
   - Check if commit message already exists
   - Use Copilot's existing override dialog (no new component needed!)
   - Pass `mustOverrideExistingMessage` flag through handlers

5. **Loading states**
   - Set `isGeneratingCommitMessage = true` during generation
   - Disable button while loading
   - Show spinner or loading text

**What to Skip:**
- ❌ Disclaimer dialog (not critical)
- ❌ Metrics/analytics
- ❌ Enhanced prompt with examples
- ❌ Custom styling

**Expected Result:** Button is reliable. Shows clear errors when things go wrong. Doesn't break the app.

---

### Phase 3: Make It Good (2-3 hours)

**Goal:** Polish the UX and improve commit message quality.

**What to Add:**
1. **Enhanced prompt**
   - Replace simple prompt with full prompt (from Section 6)
   - Add adaptive descriptions (scale with change size)
   - Include examples (small, medium, large commits)
   - Add best practices enforcement

2. **Disclaimer dialog**
   - Create `generate-commit-message-claude-disclaimer.tsx`
   - Add popup type to models
   - Wire up in app.tsx
   - Show once, cache response for 30 days
   - Simple message: "Claude will generate a commit message based on your changes. Review before committing."

3. **Visual polish**
   - Add button tooltip with context-aware messages
   - Ensure icon scales correctly
   - Test hover states
   - Verify light/dark mode appearance
   - Optional: Custom CSS if needed

4. **Better error messages**
   - Detect authentication errors specifically
   - Suggest `claude setup-token` if not authenticated
   - Provide actionable guidance in all error cases

**What to Skip:**
- ❌ Metrics/analytics
- ❌ Advanced CLI features (model selection, system prompts)
- ❌ Performance optimizations

**Expected Result:** Button looks professional. Generates high-quality commit messages. Clear, helpful UX.

---

### Phase 4: Make It Great (1-2 hours)

**Goal:** Add analytics and optional enhancements.

**What to Add:**
1. **Analytics metrics**
   - Track `generateCommitMessageWithClaudeButtonClickCount`
   - Track `generateCommitMessageWithClaudeCount` (successful generations)
   - Track error rates
   - Track average generation time

2. **Model data flag**
   - Add `generatedByClaude` flag to `ICommitMessage`
   - Track which provider generated each message
   - Useful for future analytics/debugging

3. **Performance optimizations**
   - Cache CLI availability check (already done on startup)
   - Consider debouncing if users spam the button
   - Profile generation time

4. **Future enhancements** (optional)
   - Add conventional commits format option
   - Add emoji support option
   - Allow users to customize prompt
   - Model selection (sonnet vs opus)
   - System prompt customization

**Expected Result:** Production-ready feature with full observability and optional customizations.

---

### Phase Summary

| Phase | Time | What It Does | Can Ship? |
|-------|------|-------------|-----------|
| **Phase 1: MVP** | 3-4h | Button works, generates messages | ⚠️ Internal testing only |
| **Phase 2: Reliable** | 2-3h | Error handling, won't crash | ✅ Yes (minimal) |
| **Phase 3: Good** | 2-3h | Polish UX, better messages | ✅ Yes (recommended) |
| **Phase 4: Great** | 1-2h | Analytics, enhancements | ✅ Yes (production) |

**Total:** 8-12 hours (same as original estimate, but now incremental!)

**Recommended Shipping Point:** After Phase 3 (Good UX + reliable + quality messages)

---

## Technical Considerations

### 1. Claude CLI Command Syntax

**✅ CONFIRMED - Optimal Command:**

```bash
claude --print --output-format json --model haiku "your prompt here"
```

**Why Haiku?**
- **Faster**: Haiku responds 2-3x faster than Sonnet
- **Cheaper**: Lower cost per token for users
- **Sufficient**: Commit message generation is a structured task that doesn't need the most powerful model
- **Quality**: Haiku excels at following structured prompts with clear examples

**⚠️ Windows WSL Implementation - IMPORTANT:**

On Windows, Claude CLI must run through WSL with an interactive shell to load the user's PATH:

```bash
# ❌ DOESN'T WORK - PATH not loaded
wsl claude --version

# ❌ DOESN'T WORK - bash -l doesn't source .bashrc properly
wsl bash -l -c "claude --version"

# ✅ WORKS - Interactive shell loads .bashrc and NVM
wsl bash -i -c "claude --version"
```

**Why `-i` (interactive) is needed:**
- Claude CLI is typically installed via npm/nvm
- NVM adds Claude to PATH via `.bashrc`
- Non-interactive shells don't source `.bashrc`
- The `-i` flag makes bash load `.bashrc`, which sets up NVM and adds Claude to PATH

**Actual command used in code:**
```typescript
if (isWindows) {
  command = 'wsl'
  args = ['bash', '-i', '-c', 'claude --print --output-format json --model haiku']
} else {
  command = 'claude'
  args = ['--print', '--output-format', 'json', '--model', 'haiku']
}
```

**Why `--output-format json`?**
- Eliminates need to parse markdown code blocks
- Returns clean JSON directly
- More reliable than extracting from conversational text

**Example:**
```bash
claude --print "say hi"
# Output: Hi! I'm here to help you with software engineering tasks...

claude --print --output-format json '{"task": "greet"}'
# Output: {"response": "..."}  (clean JSON)
```

**For Commit Messages (Small Diffs):**
```bash
claude --print --output-format json "Based on this git diff, generate a JSON commit message with 'title' and 'description' fields:\n\n${diff}"
```

**For Large Diffs (Bypass OS Command Length Limits):**
```bash
echo "${prompt_with_diff}" | claude --print --output-format json
```

**Available Output Formats:**
- `text` (default) - Conversational response
- `json` - Single JSON result (✅ PERFECT for our use case)
- `stream-json` - Realtime streaming (overkill for commit messages)

**Why stdin?**
- Bypasses OS command length limits (8KB on Windows!)
- Allows diffs up to 20MB+ (2x better than Copilot's 10MB)

### 2. Response Parsing

**✅ SIMPLIFIED with `--output-format json`:**

With the `--output-format json` flag, Claude returns **clean JSON directly**:

```typescript
const result = await spawn('claude', ['--print', '--output-format', 'json', prompt])
const parsed = JSON.parse(result.stdout) as IClaudeCommitMessage
```

**No need for:**
- ❌ Markdown code block extraction
- ❌ Regex pattern matching
- ❌ Fallback parsing strategies
- ❌ Complex string manipulation

**Fallback (if JSON parsing fails):**
- Show error: "Claude returned invalid response format"
- Log the raw output for debugging
- User can try again

### 3. Error Handling

| Error Scenario | Detection | Handling |
|----------------|-----------|----------|
| CLI not installed | `claude --version` fails | Show **disabled** button with tooltip: "Install Claude CLI to use this feature" |
| CLI not authenticated | Check stderr for "subscription" or "token" | Show error notification: "Sign in to Claude Code: run `claude setup-token`" |
| CLI timeout | Spawn timeout (30s) | Show error notification: "Claude Code took too long to respond" |
| Invalid JSON response | `JSON.parse()` throws | Show error notification: "Could not parse Claude response" |
| Spawn error | Process spawn exception | Show error notification: "Failed to execute Claude CLI" |
| Rate limiting | Check stderr/exit code | Show error notification: "Rate limited, please try again later" |

**Authentication Detection:**
```typescript
if (result.exitCode !== 0) {
  const error = result.stderr.toLowerCase()
  if (error.includes('subscription') || error.includes('token') || error.includes('auth')) {
    throw new ClaudeAuthError('Please run: claude setup-token')
  }
  throw new Error(`Claude CLI error: ${result.stderr}`)
}
```

### 4. Additional CLI Options Available

From `claude --help`, we also have these useful options:

**For Future Enhancements:**
- `--model <model>` - Choose specific model (sonnet, opus, etc.)
- `--fallback-model <model>` - Auto fallback when model overloaded
- `--system-prompt <prompt>` - Add custom system instructions
- `--permission-mode <mode>` - Control tool permissions
- `--allowedTools <tools>` - Restrict which tools Claude can use

**For Debugging:**
- `--debug` - Enable debug mode
- `--verbose` - Verbose output
- `claude doctor` - Check installation health

**Current Implementation:** We'll use basic flags only:
```bash
claude --print --output-format json "prompt"
```

### 5. Performance

**Concern:** Spawning CLI processes might be slow

**Mitigation:**
- Show loading state immediately
- Set reasonable timeout (30s)
- Don't block UI thread
- Cache CLI availability check on app startup
- Spawn is async, won't block renderer process

**Expected Performance:**
- CLI availability check: <100ms (cached after first check)
- Commit message generation: 2-10 seconds (similar to Copilot API)
- Process spawn overhead: ~50-100ms

### 6. Security

**Considerations:**
- Diff contains code changes (potentially sensitive)
- Diff sent to Claude's servers (user must consent)
- CLI uses user's Claude Code subscription credentials
- No additional API keys needed (relies on `claude` CLI auth)

**Disclaimer text should mention:**
- Code will be sent to Claude's servers
- Requires active Claude Code subscription
- User is responsible for reviewing output

---

## User Experience Flow

### Scenario A: CLI Not Installed

```
App startup checks CLI availability
    ↓ (Not available)
Claude button appears next to Copilot button (DISABLED)
    ↓
User hovers over button
    ↓
Tooltip shows: "Install Claude CLI to use this feature"
    ↓
User installs CLI and restarts app
    ↓
Button becomes enabled
```

### Scenario B: CLI Installed

```
User installs Claude CLI → Signs in to Claude Code
    ↓
App startup checks CLI availability
    ↓ (Available)
Claude button appears next to Copilot button (ENABLED)
    ↓
User selects files and clicks Claude button
    ↓
First time: Show disclaimer
    ↓ User accepts
Set isGeneratingCommitMessage = true
    ↓
Generate diff from selected files
    ↓
Build prompt with diff embedded
    ↓
Execute: claude --print "Generate commit message for this diff: ${diff}"
    ↓ (Waiting 2-10 seconds)
Receive response (likely with markdown)
    ↓
Extract JSON from response (handle code blocks)
    ↓
Parse {title, description}
    ↓
Update commit message fields
Set generatedByClaude = true
    ↓
Set isGeneratingCommitMessage = false
    ↓
User reviews and commits
```

---

## Differences in Implementation Complexity

### Simpler Than Copilot:
- ✅ No HTTP API, just CLI invocation
- ✅ No OAuth token management
- ✅ No endpoint configuration
- ✅ No rate limiting to handle (likely)
- ✅ No quota exceeded errors (likely)
- ✅ No 30-day disclaimer re-prompting (optional)
- ✅ Simple command: `claude --print --output-format json`
- ✅ Use stdin to bypass OS command limits

### Better Than Copilot:
- 🚀 **20MB diff limit** (2x Copilot's 10MB!)
- 🚀 **Full control over prompt** (Copilot's is server-side/hidden)
- 🚀 **Adaptive descriptions** (scales from 1 sentence to comprehensive)
- 🚀 **Can optimize prompt** for better commit messages
- 🚀 **Can add custom instructions** (conventional commits, emojis, etc.)
- 🚀 **Better error messages** (show diff size, suggest solutions)
- 🚀 **Transparent and modifiable** (users can customize the prompt)

### More Complex Than Copilot:
- ❌ Process spawning and management
- ❌ CLI availability detection
- ❌ Stdout/stderr parsing
- ❌ Less predictable error messages (auth, etc.)

---

## Testing Checklist

- [ ] CLI not installed → Button shown but **disabled** with tooltip
- [ ] CLI installed but not authenticated → Error notification when clicked
- [ ] CLI installed and authenticated → Successful generation
- [ ] First use → Disclaimer shown
- [ ] Repeat use → No disclaimer
- [ ] Existing message → Override warning
- [ ] No files selected → Button disabled
- [ ] During commit → Button disabled
- [ ] CLI timeout → Error message
- [ ] Invalid JSON response → Error message
- [ ] Process spawn failure → Error message
- [ ] Amend workflow → Correct diff generated
- [ ] Both buttons present → No conflicts
- [ ] Generate with Copilot, then Claude → Both work independently
- [ ] Metrics tracked correctly

---

## File Changes Summary

### New Files (4):
1. `app/src/lib/claude-cli.ts` - CLI invocation logic with prompt
2. `app/src/ui/octicons/claude.ts` - Claude icon definition
3. `app/src/ui/generate-commit-message/generate-commit-message-claude-disclaimer.tsx` - Disclaimer dialog
4. `app/styles/ui/changes/_claude-button.scss` - Button styling (optional)

### Modified Files (8):
1. `app/src/ui/octicons/index.ts` - Export Claude icon
2. `app/src/ui/changes/commit-message.tsx` - Add Claude button rendering
3. `app/src/ui/changes/changes-list.tsx` - Add event handler
4. `app/src/ui/dispatcher/dispatcher.ts` - Add dispatcher methods
5. `app/src/lib/stores/app-store.ts` - Add generation logic and CLI check
6. `app/src/models/commit-message.ts` - Add `generatedByClaude` flag
7. `app/src/models/popup.ts` - Add popup type
8. `app/src/ui/app.tsx` - Handle new popup type

---

## Estimated Effort

See **Implementation Steps** section above for detailed phased approach.

**Quick Summary:**
- **Phase 1 (MVP - Make It Work):** 3-4 hours
- **Phase 2 (Make It Reliable):** 2-3 hours
- **Phase 3 (Make It Good):** 2-3 hours
- **Phase 4 (Make It Great):** 1-2 hours

**Total:** 8-12 hours

**Recommended Shipping Point:** After Phase 3 (Good UX + reliable + quality messages)

---

## Success Criteria

✅ Claude button always appears (even when CLI not installed)
✅ When CLI not installed: Button is disabled with tooltip "Install Claude CLI to use this feature"
✅ When CLI installed: Button generates commit messages successfully
✅ **Commit messages are high quality:**
   - Descriptions scale appropriately (brief for small changes, detailed for large)
   - Follow best practices (imperative mood, 50 char limit, etc.)
   - Include context and reasoning (WHAT and WHY)
✅ Handles diffs up to 20MB (2x better than Copilot)
✅ Error handling covers all failure scenarios
✅ Disclaimer shown on first use
✅ Override warning works for both providers
✅ Metrics tracked for analytics
✅ No conflicts with existing Copilot button
✅ Loading states work correctly
✅ Code follows existing patterns and style
