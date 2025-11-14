# Phase 9: AI Commit Message Generation

## Overview

Implements AI-powered commit message generation using multiple providers: GitHub Copilot (upstream), Claude Code CLI (this fork), and Ollama (this fork). This is a **unique feature of this fork** that provides alternatives to the official Copilot integration.

## Prerequisites

- Phases 1-6 completed
- Phase 4 (GitHub integration) for Copilot

## Technology-Agnostic Requirements

### 1. Provider Architecture

**Reference:** `app/src/lib/alternative-commit-providers/`

#### 1.1 Base Provider Interface

**File:** `app/src/lib/alternative-commit-providers/providers/base-provider.ts`

```typescript
abstract class BaseAlternativeCommitMessageProvider {
  abstract readonly id: string
  abstract readonly displayName: string
  abstract readonly icon: OcticonSymbol

  /**
   * Check if provider is available (installed, configured, etc.)
   */
  abstract isAvailable(): Promise<boolean>

  /**
   * Generate commit message from diff
   */
  abstract generateCommitMessage(diff: string): Promise<IProviderCommitMessage>

  /**
   * Validate diff before sending
   */
  protected validateDiff(diff: string): void {
    if (!diff || diff.trim().length === 0) {
      throw new ProviderError('No changes to summarize', 'NO_CHANGES', false)
    }
  }
}
```

#### 1.2 Provider Types

**Type Definitions:** `app/src/lib/alternative-commit-providers/common/types.ts`

```typescript
interface IProviderCommitMessage {
  summary: string         // First line (50 chars)
  description?: string    // Optional body
}

class ProviderError extends Error {
  code: string           // Error code for handling
  retryable: boolean     // Should retry?

  constructor(message: string, code: string, retryable: boolean)
}
```

### 2. Provider Implementations

#### 2.1 Copilot Provider (Official - Upstream)

**How it works:**
1. Check if user has Copilot Desktop enabled
2. Get Copilot API endpoint from GitHub
3. Send diff to Copilot API
4. Parse response

**API Request:**
```http
POST {copilot_endpoint}/chat/completions
Authorization: Bearer {github_token}
Content-Type: application/json

{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant that writes git commit messages."
    },
    {
      "role": "user",
      "content": "Write a commit message for this diff:\n\n{diff}"
    }
  ],
  "model": "gpt-4",
  "temperature": 0.3
}
```

**Response:**
```json
{
  "choices": [{
    "message": {
      "content": "Fix parser error handling\n\nAdd proper error recovery for invalid input"
    }
  }]
}
```

**Requirements:**
- User must have GitHub Copilot subscription
- Copilot for Desktop must be enabled
- Active internet connection

**Limitations:**
- Requires paid subscription
- GitHub dependency
- Privacy concerns (sends code to GitHub/OpenAI)

#### 2.2 Claude Code Provider (This Fork)

**Reference:** `app/src/lib/alternative-commit-providers/providers/claude-provider.ts:69-100`

**How it works:**
1. Check if Claude CLI is installed
2. Spawn Claude CLI subprocess
3. Pass diff via stdin
4. Parse commit message from stdout

**Complete Workflow:**

```
User clicks "Generate with Claude Code"
       ↓
T+0ms: Check provider availability
       ├── Platform check: Windows vs Unix
       ├── Windows: Check WSL (wsl --version)
       ├── Unix: Check CLI (which claude)
       └── Return available status
           ↓
T+50ms: Validate diff
       ├── Check diff not empty
       ├── Check size < 20MB
       └── Sanitize for security
           ↓
T+100ms: Build command
       ├── Windows: ['wsl', 'claude', '--model', 'haiku', ...]
       ├── Unix: ['claude', '--model', 'haiku', ...]
       └── Include prompt template
           ↓
T+150ms: Spawn subprocess
       ├── Set stdin to diff content
       ├── Set timeout to 120 seconds
       ├── Capture stdout for result
       └── Capture stderr for errors
           ↓
[Claude API processes diff - 5-30 seconds]
           ↓
T+15000ms: Process completes
       ├── Check exit code
       ├── Parse stdout for message
       └── Validate format
           ↓
T+15100ms: Return commit message
       ├── Split summary/description
       ├── Validate length limits
       └── Return to UI
           ↓
T+15200ms: Fill commit message box ✓
```

**Complete Implementation:**

**Availability Check:**
```typescript
// app/src/lib/alternative-commit-providers/providers/claude-provider.ts
export class ClaudeProvider extends BaseAlternativeCommitMessageProvider {
  readonly id = 'claude'
  readonly displayName = 'Claude Code'
  readonly icon = OcticonSymbol.sparkle

  async isAvailable(): Promise<boolean> {
    const isWindows = process.platform === 'win32'

    console.log(`[ClaudeProvider] Checking availability (platform: ${process.platform})`)

    try {
      if (isWindows) {
        // On Windows, require WSL
        const wslResult = await this.spawnProcess('wsl', ['--version'], {
          timeout: 5000
        })

        if (wslResult.exitCode !== 0) {
          console.log('[ClaudeProvider] WSL not available')
          return false
        }

        // Check if claude is installed in WSL
        const claudeResult = await this.spawnProcess('wsl', ['which', 'claude'], {
          timeout: 5000
        })

        const available = claudeResult.exitCode === 0
        console.log(`[ClaudeProvider] WSL available, Claude CLI: ${available}`)
        return available

      } else {
        // On Unix, check if claude command exists
        const result = await this.spawnProcess('which', ['claude'], {
          timeout: 5000
        })

        const available = result.exitCode === 0
        console.log(`[ClaudeProvider] Claude CLI available: ${available}`)
        return available
      }
    } catch (error) {
      console.error('[ClaudeProvider] Availability check failed:', error)
      return false
    }
  }
}
```

**Generate Commit Message:**
```typescript
async generateCommitMessage(diff: string): Promise<IProviderCommitMessage> {
  // Step 1: Validate diff
  console.log('[ClaudeProvider] Generating commit message')
  this.validateDiff(diff)

  // Step 2: Check diff size (max 20MB for Claude)
  const maxSize = 20 * 1024 * 1024
  if (diff.length > maxSize) {
    console.error(`[ClaudeProvider] Diff too large: ${diff.length} bytes (max ${maxSize})`)
    throw new ProviderError(
      `Diff is ${(diff.length / 1024 / 1024).toFixed(1)}MB. Maximum is 20MB for Claude Code.`,
      'DIFF_TOO_LARGE',
      false
    )
  }

  console.log(`[ClaudeProvider] Diff size: ${(diff.length / 1024).toFixed(1)}KB`)

  // Step 3: Build prompt
  const prompt = this.buildPrompt()
  const isWindows = process.platform === 'win32'

  // Step 4: Build command
  const command = isWindows ? 'wsl' : 'claude'
  const baseArgs = isWindows
    ? ['claude', '--model', 'haiku', '--prompt', prompt]
    : ['--model', 'haiku', '--prompt', prompt]

  console.log(`[ClaudeProvider] Command: ${command} ${baseArgs.join(' ')}`)

  // Step 5: Spawn subprocess
  try {
    const result = await this.spawnProcess(command, baseArgs, {
      stdin: diff,
      timeout: 120000,  // 2 minutes
      encoding: 'utf8'
    })

    // Step 6: Check exit code
    if (result.exitCode !== 0) {
      console.error(`[ClaudeProvider] CLI failed with exit code ${result.exitCode}`)
      console.error(`[ClaudeProvider] stderr: ${result.stderr}`)

      // Parse specific errors
      if (result.stderr.includes('API key')) {
        throw new ProviderError(
          'Claude API key not configured. Run: claude config set api_key',
          'NO_API_KEY',
          false
        )
      }

      if (result.stderr.includes('rate limit')) {
        throw new ProviderError(
          'Claude API rate limit exceeded. Please wait and try again.',
          'RATE_LIMIT',
          true  // retryable
        )
      }

      if (result.stderr.includes('timeout')) {
        throw new ProviderError(
          'Claude API request timed out. The diff may be too large.',
          'TIMEOUT',
          true  // retryable
        )
      }

      // Generic error
      throw new ProviderError(
        `Claude CLI failed: ${result.stderr.trim() || 'Unknown error'}`,
        'CLI_ERROR',
        false
      )
    }

    // Step 7: Parse response
    console.log('[ClaudeProvider] Successfully received response')

    const message = this.parseCommitMessage(result.stdout.trim())

    console.log(`[ClaudeProvider] Generated message: "${message.summary}"`)

    return message

  } catch (error) {
    if (error instanceof ProviderError) {
      throw error
    }

    console.error('[ClaudeProvider] Unexpected error:', error)
    throw new ProviderError(
      `Failed to generate commit message: ${error.message}`,
      'UNKNOWN_ERROR',
      false
    )
  }
}

private buildPrompt(): string {
  return `You are a Git commit message generator. Given a git diff, write a concise commit message following these rules:

1. First line: < 50 characters, imperative mood (e.g., "Add", "Fix", "Update")
2. Blank line
3. Body: Explain what and why, not how. Wrap at 72 characters.
4. Focus on the most important changes
5. Use conventional commit types when appropriate: feat, fix, docs, refactor, test, chore

Output ONLY the commit message, no explanations or markdown formatting.

Examples:
- "Fix parser error handling\n\nAdd proper error recovery for invalid input\nto prevent crashes when processing malformed files."
- "Add user authentication system\n\nImplement JWT-based authentication with refresh\ntokens to improve security and user experience."

Now, analyze the following diff and generate an appropriate commit message:`
}

private parseCommitMessage(output: string): IProviderCommitMessage {
  // Remove any markdown code blocks if present
  let cleaned = output
    .replace(/^```.*\n/gm, '')
    .replace(/^```$/gm, '')
    .trim()

  // Split into summary and description
  const lines = cleaned.split('\n')
  const summary = lines[0].trim()

  // Validate summary
  if (!summary) {
    throw new ProviderError(
      'Claude returned empty commit message',
      'EMPTY_RESPONSE',
      false
    )
  }

  if (summary.length > 72) {
    console.warn(`[ClaudeProvider] Summary too long (${summary.length} chars), truncating`)
    // Truncate but warn
  }

  // Extract description (everything after first blank line)
  let description: string | undefined

  const blankLineIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '')

  if (blankLineIndex !== -1 && blankLineIndex < lines.length - 1) {
    description = lines
      .slice(blankLineIndex + 1)
      .join('\n')
      .trim()

    if (!description) {
      description = undefined
    }
  }

  return {
    summary: summary,
    description: description
  }
}
```

**Subprocess Execution Helper:**

```typescript
private async spawnProcess(
  command: string,
  args: string[],
  options: {
    stdin?: string
    timeout?: number
    encoding?: string
  } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {

  const { spawn } = require('child_process')

  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    // Set up timeout
    const timeout = options.timeout || 30000
    const timer = setTimeout(() => {
      killed = true
      process.kill('SIGTERM')

      // Force kill after 5 seconds
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL')
        }
      }, 5000)
    }, timeout)

    // Collect output
    process.stdout.on('data', (data: Buffer) => {
      stdout += data.toString(options.encoding || 'utf8')
    })

    process.stderr.on('data', (data: Buffer) => {
      stderr += data.toString(options.encoding || 'utf8')
    })

    // Handle completion
    process.on('exit', (code: number) => {
      clearTimeout(timer)

      if (killed) {
        reject(new Error(`Process timed out after ${timeout}ms`))
      } else {
        resolve({
          exitCode: code || 0,
          stdout: stdout,
          stderr: stderr
        })
      }
    })

    // Handle errors
    process.on('error', (error: Error) => {
      clearTimeout(timer)
      reject(error)
    })

    // Send stdin if provided
    if (options.stdin) {
      process.stdin.write(options.stdin)
      process.stdin.end()
    }
  })
}
```

**Platform-Specific Handling:**

**Windows:**
- Use WSL (Windows Subsystem for Linux)
- Command: `wsl claude --model haiku --prompt "..." < diff`
- Requires WSL2 with Claude CLI installed in Linux environment

**macOS/Linux:**
- Use Claude CLI directly
- Command: `claude --model haiku --prompt "..." < diff`
- Requires Claude Code CLI installed

**Configuration:**
- Max diff size: 20MB
- Timeout: 2 minutes
- Model: Claude Haiku (fast and cost-effective)

**Requirements:**
- Claude Code CLI installed
- Active Anthropic API key (in CLI)
- Internet connection

**Advantages:**
- Fast (Haiku model)
- Good quality
- Alternative to Copilot

**Disadvantages:**
- Requires external CLI installation
- Windows requires WSL setup
- Sends code to Anthropic API

#### 2.3 Ollama Provider (This Fork)

**Reference:** `app/src/lib/alternative-commit-providers/providers/ollama-provider.ts:9-100`

**How it works:**
1. Check if Ollama is running on localhost
2. Send HTTP request to Ollama API
3. Use specialized `tavernari/git-commit-message` model
4. Parse response

**Implementation Details:**

**Availability Check:**
```typescript
async isAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      return false
    }

    const data = await response.json()
    // Check if git-commit-message model is installed
    return data.models.some((m: any) =>
      m.name.includes('git-commit-message')
    )
  } catch (e) {
    return false
  }
}
```

**Generate Commit Message:**
```typescript
async generateCommitMessage(diff: string): Promise<IProviderCommitMessage> {
  this.validateDiff(diff)

  // Check diff size (max 50MB - local = generous!)
  if (diff.length > 50 * 1024 * 1024) {
    throw new ProviderError('Diff too large', 'DIFF_TOO_LARGE', false)
  }

  // Call Ollama API
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'tavernari/git-commit-message:latest',
      prompt: diff,
      stream: false,
      format: 'json'
    }),
    signal: AbortSignal.timeout(120000)  // 2 minutes
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new ProviderError(
        'Model not found. Install with: ollama pull tavernari/git-commit-message',
        'MODEL_NOT_FOUND',
        false
      )
    }
    throw new ProviderError('Ollama API error', 'API_ERROR', true)
  }

  const data = await response.json()

  // Parse commit message from response
  const message = parseOllamaResponse(data.response)
  return message
}
```

**Configuration:**
- URL: `http://localhost:11434`
- Model: `tavernari/git-commit-message:latest`
- Max diff size: 50MB (local processing, so generous)
- Timeout: 2 minutes

**Requirements:**
- Ollama installed and running
- Model pulled: `ollama pull tavernari/git-commit-message`
- No internet connection needed (100% local)

**Advantages:**
- **Privacy**: 100% local, no data leaves machine
- **Free**: No API costs
- **Offline**: Works without internet
- **Large diffs**: 50MB limit vs 20MB for others

**Disadvantages:**
- Requires Ollama installation
- Model quality depends on hardware
- Slower on low-end machines

### 3. Provider Manager

**Reference:** `app/src/lib/alternative-commit-providers/provider-manager.ts`

**Manages provider lifecycle:**

```typescript
class ProviderManager {
  private providers: BaseAlternativeCommitMessageProvider[] = [
    new CopilotProvider(),
    new ClaudeProvider(),
    new OllamaProvider()
  ]

  /**
   * Get all available providers
   */
  async getAvailableProviders(): Promise<BaseAlternativeCommitMessageProvider[]> {
    const available: BaseAlternativeCommitMessageProvider[] = []

    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        available.push(provider)
      }
    }

    return available
  }

  /**
   * Get provider by ID
   */
  getProvider(id: string): BaseAlternativeCommitMessageProvider | null {
    return this.providers.find(p => p.id === id) || null
  }

  /**
   * Generate commit message with specified provider
   */
  async generateCommitMessage(
    providerId: string,
    diff: string
  ): Promise<IProviderCommitMessage> {
    const provider = this.getProvider(providerId)

    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`)
    }

    if (!(await provider.isAvailable())) {
      throw new Error(`Provider not available: ${providerId}`)
    }

    return await provider.generateCommitMessage(diff)
  }
}
```

### 4. UI Integration

**Reference:** `app/src/ui/generate-commit-message/`

#### 4.1 Generate Button

**Location:** Commit message box

**UI:**
```
┌──────────────────────────────────┐
│ [✨] Generate commit message ▼  │  ← Dropdown button
└──────────────────────────────────┘
```

**Click behavior:**
Opens dropdown menu with available providers:
- ✓ GitHub Copilot (if available)
- ✓ Claude Code (if available)
- ✓ Ollama (if available)

#### 4.2 Provider Selection

**Dropdown Menu:**
```
┌────────────────────────────┐
│ ✓ GitHub Copilot          │
│   Claude Code             │
│   Ollama (Local)          │
│ ──────────────────────── │
│   Learn more...           │
└────────────────────────────┘
```

**Checkmark** indicates last used provider.

#### 4.3 Generation Flow

**User clicks provider:**

1. **Validation:**
   - Check if there are staged changes
   - Get diff of staged files
   - Validate diff is not empty

2. **Show Loading:**
   ```
   Generating commit message with Claude Code...
   [Spinner animation]
   ```

3. **Call Provider:**
   ```typescript
   const diff = await getWorkingDirectoryDiff(repository, stagedFiles)
   const message = await providerManager.generateCommitMessage('claude', diff)
   ```

4. **Handle Response:**
   - Success: Fill in commit message box
   - Error: Show error message in dialog

5. **User Review:**
   - Message is editable
   - User can modify before committing

#### 4.4 Override Warning

**Reference:** `app/src/ui/generate-commit-message/generate-commit-message-override-warning.tsx`

**If commit message already exists:**

**Dialog:**
```
┌─────────────────────────────────────────┐
│ Override Commit Message?                │
│                                         │
│ You already have a commit message.      │
│ Generate a new one and replace it?      │
│                                         │
│     [Cancel]  [Override]                │
└─────────────────────────────────────────┘
```

#### 4.5 Disclaimer

**Reference:** `app/src/ui/generate-commit-message/generate-commit-message-disclaimer.tsx`

**First-time use:**

**Banner:**
```
AI-generated commit messages are suggestions only.
Always review before committing.
[Don't show again]
```

### 5. Error Handling

**Common Errors:**

**No Changes:**
```
Error: No staged changes to generate message from
Action: Stage files first
```

**Provider Unavailable:**
```
Error: Claude Code CLI not found
Action: Install Claude CLI or use different provider
```

**Diff Too Large:**
```
Error: Diff is 25MB. Maximum is 20MB for Claude Code.
Action: Try Ollama (50MB limit) or stage fewer files
```

**API Error:**
```
Error: Claude API returned error: Rate limited
Action: Wait and retry, or use different provider
```

**Timeout:**
```
Error: Generation timed out after 2 minutes
Action: Try with smaller diff or different provider
```

### 6. Preferences

**Settings:**

**Preferred Provider:**
- Dropdown: Copilot | Claude Code | Ollama
- Used as default when clicking main button
- Stored in preferences

**Behavior:**
- Auto-fill message on generation
- Show disclaimer on first use
- Timeout duration

### 7. Diff Preparation

**What diff to send:**

**Include:**
- Staged file changes
- File additions/deletions
- Hunks with context lines

**Exclude:**
- Binary files
- Large files (>1MB per file)
- Sensitive files (.env, etc.)

**Optimize:**
- Limit context lines (3 lines before/after)
- Truncate very long files
- Remove whitespace-only changes

## Success Criteria

1. ✅ Provider architecture with base class
2. ✅ Copilot provider integration
3. ✅ Claude Code CLI provider
4. ✅ Ollama local provider
5. ✅ Provider availability detection
6. ✅ Generate button UI
7. ✅ Provider selection dropdown
8. ✅ Loading state during generation
9. ✅ Error handling for all providers
10. ✅ Override warning dialog
11. ✅ First-time disclaimer
12. ✅ Preference for default provider
13. ✅ Diff size validation
14. ✅ Timeout handling

## What This Phase Does NOT Include

- Custom AI model training
- Fine-tuning models
- Local model hosting (besides Ollama)
- Multiple message suggestions
- Interactive refinement

## Key Files

```
app/src/lib/alternative-commit-providers/
  ├── index.ts
  ├── provider-manager.ts
  ├── common/
  │   └── types.ts
  └── providers/
      ├── base-provider.ts
      ├── claude-provider.ts         (This fork)
      └── ollama-provider.ts         (This fork)

app/src/ui/generate-commit-message/
  ├── generate-commit-message.tsx
  ├── generate-commit-message-override-warning.tsx
  └── generate-commit-message-disclaimer.tsx

Documentation:
  ├── CLAUDE_CODE_COMMIT_MESSAGE_IMPLEMENTATION_PLAN.md
  ├── OLLAMA_COMMIT_MESSAGE_IMPLEMENTATION_PLAN.md
  └── COPILOT_COMMIT_MESSAGE_TECHNICAL_ANALYSIS.md
```

## Technology-Specific Notes

### Claude CLI Integration

**Installation:**
- macOS: `brew install anthropic-ai/claude/claude-cli`
- Linux: Download from Anthropic
- Windows: Install in WSL

**Configuration:**
- API key: `claude config set api_key`
- Stored in `~/.config/claude/config.json`

### Ollama Setup

**Installation:**
- macOS: `brew install ollama`
- Linux: `curl -fsSL https://ollama.ai/install.sh | sh`
- Windows: Download installer

**Model Setup:**
```bash
ollama pull tavernari/git-commit-message:latest
```

**Start Server:**
```bash
ollama serve
```

## Estimated Complexity

**Time:** 5-7 days
**Difficulty:** Medium

## Dependencies

- Phases 1-6
- Phase 4 for Copilot

## Next Phase

Phase 10: System Integration & Polish
