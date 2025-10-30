# Implementation Plan: Alternative Provider Architecture (Claude + Ollama)

## Implementation Status

### ✅ Completed Phases

- **Phase 1:** Documentation & Architecture Design ✅
- **Phase 2:** Provider Abstraction ✅
- **Phase 3:** App Store Refactoring ✅
- **Phase 4:** UI Refactoring ✅
- **Phase 5:** Add Ollama UI ✅

### 🚧 In Progress

**Current Phase:** Phase 6 - Testing & Documentation (Ready to begin)

---

## Executive Summary

This plan outlines adding **Ollama** as a second alternative commit message generation provider while refactoring the existing Claude Code implementation into a **unified provider architecture** for alternative providers.

**Important:** **Copilot code remains completely untouched!** Since this is a fork of GitHub Desktop, Copilot is the official upstream integration and should not be modified to avoid merge conflicts and maintenance issues.

### Key Benefits

- 🔒 **Privacy**: Ollama runs 100% locally - no data leaves your machine
- 💰 **Cost**: Free - no subscription required
- ⚡ **Performance**: Fast local execution with specialized model
- 🎯 **Quality**: Using `tavernari/git-commit-message:latest` - a model specifically trained for commit messages
- 🏗️ **Architecture**: Unified system for alternative providers (Claude + Ollama + future)
- 📈 **Scalability**: Adding future alternative providers becomes trivial
- 🔄 **Fork Maintenance**: No conflicts with upstream Copilot changes

---

## Problem Statement

### Current State

The codebase currently has **three commit message generation options**:

1. **Copilot** ✅ (Official/Upstream) - HTTP API integration (~400 lines)
2. **Claude Code** ⚠️ (Our Addition) - CLI subprocess integration (~600 lines)
3. **Ollama** 🆕 (To Be Added) - HTTP API integration (~120 lines estimated)

**Issues:**
- 📋 **Code Duplication**: Claude duplicates business logic from Copilot
- 🐛 **Maintenance Burden**: Adding Ollama would triple the duplication
- 🔧 **Fork Conflicts**: Modifying Copilot code creates upstream merge issues
- 🚀 **Scaling**: Can't touch Copilot, so need clean pattern for alternatives

### Proposed Solution

**Create a unified provider architecture for alternative providers only:**

1. **Leave Copilot completely alone** - It's upstream code, don't touch it!
2. **Create provider interface** for alternative providers (Claude, Ollama, future)
3. **Refactor Claude** to use the new architecture
4. **Add Ollama** using the same architecture
5. **Clear separation**: "Official" (Copilot) vs "Alternative" (Our providers)

---

## Architecture Overview

### Current Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      UI Layer                               │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │ Copilot Btn  │  │ Claude Btn   │                        │
│  │ (UPSTREAM)   │  │ (OUR CODE)   │                        │
│  └──────┬───────┘  └──────┬───────┘                        │
└─────────┼──────────────────┼──────────────────────────────┘
          │                  │
    ┌─────▼──────┐    ┌──────▼──────────┐
    │ Copilot    │    │ Claude          │
    │ Dispatcher │    │ Dispatcher      │
    │ (UPSTREAM) │    │ (OUR CODE)      │
    └─────┬──────┘    └──────┬──────────┘
          │                  │
    ┌─────▼──────┐    ┌──────▼──────────┐
    │ Copilot    │    │ Claude          │
    │ App Store  │    │ App Store       │
    │ (UPSTREAM) │    │ (OUR CODE)      │
    └─────┬──────┘    └──────┬──────────┘
          │                  │
    ┌─────▼──────┐    ┌──────▼──────────┐
    │ GitHub API │    │ Claude CLI      │
    └────────────┘    └─────────────────┘
```

**Problems**:
- 📋 Claude duplicates Copilot's business logic
- 🔧 Can't refactor Copilot (upstream code, creates merge conflicts!)
- 🚀 Adding Ollama would duplicate everything AGAIN

### Proposed Architecture (Alternative Providers Only)

```
┌──────────────────────────────────────────────────────────────┐
│                      UI Layer                                 │
│                                                               │
│  ┌──────────────┐  ┌────────────────────────────────────┐   │
│  │ Copilot Btn  │  │  Alternative Provider Buttons      │   │
│  │ (UNTOUCHED)  │  │  (Claude, Ollama, Future...)       │   │
│  └──────┬───────┘  └──────────────┬─────────────────────┘   │
└─────────┼────────────────────────┼─────────────────────────┘
          │                        │
    ┌─────▼──────┐         ┌───────▼────────────────────────┐
    │ Copilot    │         │ Alternative Provider Dispatcher│
    │ Dispatcher │         │ generateAlternativeCommitMsg() │
    │ (UNTOUCHED)│         └───────┬────────────────────────┘
    └─────┬──────┘                 │
          │              ┌─────────▼────────────────────────┐
    ┌─────▼──────┐       │ Provider Manager (Registry)      │
    │ Copilot    │       │ • Get provider by ID             │
    │ App Store  │       │ • Check availability             │
    │ (UNTOUCHED)│       └─────────┬────────────────────────┘
    └─────┬──────┘                 │
          │              ┌─────────▼────────────────────────┐
    ┌─────▼──────┐       │ Alternative Provider Interface   │
    │ GitHub API │       │ (Shared logic for alternatives)  │
    └────────────┘       └─────────┬────────────────────────┘
                                   │
                         ┌─────────┴────────────┐
                         │                      │
                  ┌──────▼──────┐        ┌──────▼──────┐
                  │ Claude      │        │ Ollama      │
                  │ Provider    │        │ Provider    │
                  │ • CLI       │        │ • HTTP API  │
                  └─────────────┘        └─────────────┘
```

**Benefits**:
- ✅ **Copilot completely untouched** - No upstream conflicts!
- ✅ **Unified alternative providers** - Claude + Ollama share code
- ✅ **Easy fork maintenance** - GitHub's code stays separate
- ✅ **Future-proof** - Adding more alternatives is trivial

---

## Provider Interface Design

### Core Interface

```typescript
/**
 * Common interface for ALTERNATIVE commit message generation providers.
 *
 * NOTE: This is NOT used for Copilot! Copilot is the official upstream integration
 * and remains completely separate to avoid merge conflicts.
 *
 * This interface is for our fork's alternative providers: Claude, Ollama, and
 * any future alternatives we add.
 */
export interface IAlternativeCommitMessageProvider {
  /** Unique identifier for this provider */
  readonly id: 'claude' | 'ollama'  // NOT including 'copilot'!

  /** Display name shown to users */
  readonly displayName: string

  /** Icon to display in button */
  readonly icon: OcticonSymbolVariant

  /**
   * Check if this provider is available for the user.
   * Examples:
   * - Claude: CLI is installed and in PATH
   * - Ollama: Server is running at localhost:11434
   */
  isAvailable(): Promise<boolean>

  /**
   * Generate commit message from a git diff.
   * @throws {ProviderError} with user-friendly error message
   */
  generateCommitMessage(diff: string): Promise<IProviderCommitMessage>

  /**
   * Optional: Should we show a disclaimer before first use?
   * - Claude: Optional (one-time notice about CLI subscription)
   * - Ollama: No (local model, no data sent externally)
   */
  shouldShowDisclaimer?(): boolean

  /**
   * Optional: Custom disclaimer text for this provider.
   */
  getDisclaimerText?(): string
}

/**
 * Response format that all providers must return.
 */
export interface IProviderCommitMessage {
  title: string        // Summary line (max 50 chars recommended)
  description: string  // Detailed description
}

/**
 * Standardized error for all providers.
 */
export class ProviderError extends Error {
  constructor(
    message: string,                  // User-friendly error message
    public readonly code: string,     // Error code (TIMEOUT, AUTH_ERROR, etc.)
    public readonly retryable: boolean = false  // Can user retry?
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
```

### Base Provider Class

```typescript
/**
 * Abstract base class with common validation logic.
 * All providers should extend this class.
 */
export abstract class BaseCommitMessageProvider implements ICommitMessageProvider {
  abstract readonly id: 'copilot' | 'claude' | 'ollama'
  abstract readonly displayName: string
  abstract readonly icon: OcticonSymbolVariant

  abstract isAvailable(): Promise<boolean>
  abstract generateCommitMessage(diff: string): Promise<IProviderCommitMessage>

  /**
   * Validate diff before sending to provider.
   * Override to add custom validation (size limits, sanitization, etc.)
   */
  protected validateDiff(diff: string): void {
    if (!diff || diff.trim().length === 0) {
      throw new ProviderError(
        'No changes to generate commit message from',
        'EMPTY_DIFF',
        false
      )
    }
  }

  /**
   * Validate response has required fields.
   */
  protected validateResponse(response: any): IProviderCommitMessage {
    if (!response || !response.title || !response.description) {
      throw new ProviderError(
        'Invalid response format from provider',
        'INVALID_RESPONSE',
        true  // Can retry
      )
    }
    return response
  }
}
```

---

## Ollama Provider Implementation

### Why Ollama?

| Feature | Copilot | Claude Code | **Ollama** |
|---------|---------|-------------|------------|
| **Privacy** | ❌ Cloud | ❌ Cloud | **✅ 100% Local** |
| **Cost** | $10/mo | $20/mo | **✅ Free** |
| **Speed** | 2-5s | 2-10s | **✅ 1-5s** |
| **Integration** | HTTP API | CLI Subprocess | **✅ HTTP API** |
| **Complexity** | Medium | High | **✅ Low** |
| **Model** | GPT-4 | Claude 3.5 Haiku | **✅ Specialized (git-commit-message:latest)** |
| **Data Sharing** | Yes | Yes | **✅ Never** |

### Ollama API Basics

**Server**: `http://localhost:11434` (default)

**Key Endpoints**:
- `GET /api/tags` - List available models
- `POST /api/generate` - Generate completion (we'll use this)
- `POST /api/chat` - Chat completion (alternative)

### Specialized Model: `tavernari/git-commit-message:latest`

**Advantages**:
- ✅ **Purpose-built** for commit messages
- ✅ **No prompt engineering** needed - just send the diff
- ✅ **Better quality** than general-purpose models
- ✅ **Faster** - optimized for the specific task

**You already have this installed!**

### Request/Response Format

```typescript
// Request
POST http://localhost:11434/api/generate
{
  "model": "tavernari/git-commit-message:latest",
  "prompt": "git diff output here...",
  "stream": false,
  "format": "json"
}

// Response
{
  "model": "tavernari/git-commit-message:latest",
  "created_at": "2025-10-29T12:34:56Z",
  "response": "{\"title\": \"Add feature X\", \"description\": \"Detailed description...\"}",
  "done": true
}
```

**Note**: Response is clean JSON (unlike Claude CLI which wraps it in markdown!)

### Ollama Provider Implementation

```typescript
// File: app/src/lib/commit-message-generation/providers/ollama-provider.ts

export class OllamaProvider extends BaseCommitMessageProvider {
  readonly id = 'ollama' as const
  readonly displayName = 'Ollama'
  readonly icon = ollama  // Llama logo

  private readonly OLLAMA_URL = 'http://localhost:11434'
  private readonly MODEL_NAME = 'tavernari/git-commit-message:latest'
  private readonly MAX_DIFF_SIZE = 50 * 1024 * 1024  // 50MB (local = no limit!)
  private readonly TIMEOUT_MS = 60000  // 1 minute

  /**
   * Check if Ollama is running and has the commit message model.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.OLLAMA_URL}/api/tags`, {
        signal: AbortSignal.timeout(5000)  // 5 second timeout
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      return data.models.some((m: any) =>
        m.name.includes('git-commit-message')
      )
    } catch (e) {
      return false
    }
  }

  /**
   * Generate commit message using Ollama's specialized model.
   */
  async generateCommitMessage(diff: string): Promise<IProviderCommitMessage> {
    this.validateDiff(diff)

    // Check diff size
    if (diff.length > this.MAX_DIFF_SIZE) {
      throw new ProviderError(
        `Diff is too large (${(diff.length / 1024 / 1024).toFixed(1)}MB). ` +
        `Maximum size is 50MB.`,
        'DIFF_TOO_LARGE',
        false
      )
    }

    try {
      const response = await fetch(`${this.OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.MODEL_NAME,
          prompt: diff,
          stream: false,
          format: 'json',
        }),
        signal: AbortSignal.timeout(this.TIMEOUT_MS)
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new ProviderError(
            `Model "${this.MODEL_NAME}" not found. ` +
            `Install it with: ollama pull ${this.MODEL_NAME}`,
            'MODEL_NOT_FOUND',
            false
          )
        }
        throw new ProviderError(
          `Ollama server returned error: ${response.status}`,
          'API_ERROR',
          response.status >= 500  // Retry on 5xx errors
        )
      }

      const data = await response.json()
      const parsed = JSON.parse(data.response)

      return this.validateResponse(parsed)
    } catch (e) {
      if (e instanceof ProviderError) {
        throw e  // Already handled
      }

      if (e instanceof TypeError && e.message.includes('fetch')) {
        throw new ProviderError(
          'Could not connect to Ollama. Make sure Ollama is running ' +
          'at http://localhost:11434',
          'CONNECTION_ERROR',
          true
        )
      }

      if (e.name === 'TimeoutError') {
        throw new ProviderError(
          'Ollama took too long to respond (>60s)',
          'TIMEOUT',
          true
        )
      }

      throw new ProviderError(
        `Failed to generate commit message: ${e.message}`,
        'UNKNOWN',
        true
      )
    }
  }

  /**
   * Ollama is local, no disclaimer needed.
   */
  shouldShowDisclaimer(): boolean {
    return false
  }
}
```

---

## File Structure

### New Directory Structure

```
app/src/lib/
├── alternative-commit-providers/       # NEW: Alternative provider system (NOT Copilot!)
│   ├── index.ts                        # Public API exports
│   ├── common/
│   │   └── types.ts                    # Interfaces and types
│   ├── providers/
│   │   ├── base-provider.ts            # Abstract base class
│   │   ├── claude-provider.ts          # Claude implementation (CLI logic moved here)
│   │   └── ollama-provider.ts          # Ollama implementation
│   └── provider-manager.ts             # Provider registry
├── claude-cli.ts                       # TO BE DELETED (logic moved to claude-provider.ts)
└── api.ts                              # Existing (Copilot code - UNTOUCHED!)
```

### Key Files

**1. `common/types.ts`** (~80 lines)
- `IAlternativeCommitMessageProvider` interface
- `IProviderCommitMessage` interface
- `ProviderError` class

**2. `providers/base-provider.ts`** (~50 lines)
- `BaseAlternativeCommitMessageProvider` abstract class
- `validateDiff()` helper
- `validateResponse()` helper

**3. `providers/claude-provider.ts`** (~150 lines)
- **Moves** all CLI logic from `claude-cli.ts` into provider class
- CLI invocation: `wsl bash -i -c "claude --print --output-format json --model haiku"`
- Prompt building with diff
- JSON parsing (wrapper + markdown stripping)
- Translates CLI errors to ProviderError
- Handles CLI availability check

**4. `providers/ollama-provider.ts`** (~120 lines)
- NEW: HTTP API integration
- Simple fetch() calls to localhost:11434
- Local server check

**5. `provider-manager.ts`** (~60 lines)
- Provider registry for alternatives
- getProvider(id) lookup
- getAvailableProviders() for UI
- **Note**: Does NOT include Copilot!

### Why Delete `claude-cli.ts`?

**Decision**: Move all logic into `ClaudeProvider` class and delete the standalone file.

**Rationale**:
- ✅ **Cleaner architecture** - All Claude logic in one place
- ✅ **Consistency** - Same pattern as OllamaProvider (self-contained)
- ✅ **One less file** - Simpler project structure
- ✅ **No indirection** - Direct implementation instead of wrapper
- ✅ **Safe to delete** - Only used for commit messages, no other callers

**What we're moving**:
- `invokeClaude()` function → `ClaudeProvider.generateCommitMessage()`
- `buildCommitMessagePrompt()` → Private method in provider
- CLI spawn logic → Inside provider
- JSON parsing logic → Inside provider

---

## Implementation Steps (Revised)

### Phase 1: Documentation & Architecture (30 min) ✅

- [x] Create `OLLAMA_COMMIT_MESSAGE_IMPLEMENTATION_PLAN.md` (this document)
- [x] Document provider interface
- [x] Document migration strategy
- [x] Prioritize cleanup/refactoring as core work (not optional!)

### Phase 2: Provider Abstraction (1.5-2 hours) ✅

- [x] Create `app/src/lib/alternative-commit-providers/` directory
- [x] Create `common/types.ts` with `IAlternativeCommitMessageProvider` interface
- [x] Create `providers/base-provider.ts` abstract class
- [x] Create `providers/claude-provider.ts` (**move** all logic from `claude-cli.ts`)
  - [x] Copy CLI invocation logic
  - [x] Copy prompt building logic
  - [x] Copy JSON parsing logic (wrapper + markdown stripping)
  - [x] Adapt to use ProviderError instead of generic errors
- [x] Create `providers/ollama-provider.ts` (new HTTP API integration)
- [x] Create `provider-manager.ts` registry (for alternatives only)
- [x] Create `index.ts` for exports
- [x] **Delete** `app/src/lib/claude-cli.ts` (logic moved to provider)

### Phase 3: App Store Refactoring (1 hour) ✅

**Goal**: Create unified alternative provider system (Claude + Ollama)

- [x] Add `_generateCommitMessageWithAlternativeProvider(providerId)` method
  - [x] Get provider from registry
  - [x] Call `provider.generateCommitMessage(diff)`
  - [x] Handle ProviderError
- [x] Update `_generateCommitMessageWithClaude()` to use new method
  - [x] Replace `invokeClaude()` call with provider call
  - [x] Delete import from `claude-cli` (file no longer exists)
- [x] **Keep** `_generateCommitMessage()` (Copilot) - DO NOT TOUCH!
- [x] Register alternative providers on app startup
  - [x] `new ClaudeProvider()`
  - [x] `new OllamaProvider()`
- [x] Add `generatedByAlternativeProvider?: 'claude' | 'ollama'` field to `ICommitMessage`
- [x] **Keep** `generatedByCopilot` flag - DO NOT TOUCH!

### Phase 4: UI Refactoring (1-2 hours) ✅

**Goal**: Create unified renderer for alternative provider buttons only

- [x] Create `renderAlternativeProviderButton(provider)` in `commit-message.tsx`
- [x] **Keep** `renderCopilotButton()` - DO NOT TOUCH!
- [x] Update `renderClaudeButton()` to use new unified renderer
- [x] Add unified `onAlternativeProviderButtonClick(providerId)` handler
- [x] Update `changes-list.tsx` with alternative provider handler
- [x] **Keep** `onGenerateCommitMessage` (Copilot) - DO NOT TOUCH!
- [x] Update `filter-changes-list.tsx` with same handler
- [x] Add `generateCommitMessageWithAlternativeProvider(providerId)` to dispatcher
- [x] **Keep** `generateCommitMessage()` (Copilot) - DO NOT TOUCH!
- [x] Update props to include alternative providers array
- [x] Update `popup.ts` to add 'ollama' to provider union types

### Phase 5: Add Ollama (1 hour) ✅

- [x] Create Ollama icon (`app/src/ui/octicons/ollama.ts`)
- [x] Export icon from `app/src/ui/octicons/index.ts`
- [x] Update `popup.ts` to add 'ollama' to provider union (done in Phase 4)
- [x] Register `OllamaProvider` in app store initialization (done in Phase 3)
- [x] Add `.ollama-button` styles to `_commit-message.scss`
- [x] Ready for testing!

### Phase 6: Testing & Documentation (1 hour)

- [ ] Test all three providers work independently
- [ ] Test Ollama provider (server on/off)
- [ ] Test all three providers independently
- [ ] Test override warning with each provider
- [ ] Test error scenarios (model not found, timeout, etc.)
- [ ] Update this document with completion status

---

## Comparison: Ollama vs Others

### Implementation Complexity

| Aspect | Copilot | Claude Code | Ollama |
|--------|---------|-------------|--------|
| **Integration Type** | HTTP API | CLI Subprocess | **HTTP API** |
| **Lines of Code** | ~400 | ~600 | **~120** |
| **Process Management** | None | Complex (spawn, WSL) | **None** |
| **Authentication** | OAuth | CLI auth | **None (local)** |
| **Response Parsing** | JSON | JSON in markdown | **Clean JSON** |
| **Error Scenarios** | Many | Many | **Few** |
| **Availability Check** | Account flag | CLI version | **HTTP GET** |
| **Privacy Concerns** | Yes (cloud) | Yes (cloud) | **No (local)** |
| **Cost** | $10/mo | $20/mo | **Free** |

### Why Ollama is Easier

1. ✅ **HTTP API** - Just `fetch()`, no process spawning
2. ✅ **Local** - No authentication, no rate limiting
3. ✅ **Clean responses** - No markdown stripping needed
4. ✅ **Simple checks** - Just check if server is running
5. ✅ **Specialized model** - No complex prompt engineering
6. ✅ **Few error cases** - Server on/off, model exists/not exists

### Code Reuse

With the unified provider architecture:

| Component | Reused from Existing | New Code | % Reuse |
|-----------|---------------------|----------|---------|
| **UI Rendering** | Button pattern, tooltips | Ollama icon | 95% |
| **Event Handling** | Handler pattern | Call new provider | 95% |
| **Business Logic** | Diff generation, state management | None | 100% |
| **API Integration** | HTTP fetch pattern | Ollama-specific | 50% |
| **Error Handling** | ProviderError pattern | Ollama errors | 80% |
| **Overall** | | | **90%** |

---

## Benefits Summary

### For Users

- 🔒 **Privacy Option**: Choose local generation (Ollama) vs cloud (Copilot/Claude)
- 💰 **Cost Savings**: Free alternative to paid subscriptions
- ⚡ **Performance**: Fast local execution
- 🎯 **Quality**: Specialized model for commit messages
- 🔄 **Flexibility**: Switch between providers based on needs

### For Developers

- 🏗️ **Clean Architecture**: Single source of truth
- 🔧 **Maintainability**: Bug fixes apply to all providers
- 📦 **Modularity**: Provider-specific code is isolated
- 🚀 **Scalability**: Adding new providers is trivial
- 🧪 **Testability**: Each provider can be tested independently
- 📊 **Type Safety**: TypeScript interfaces ensure consistency

### For the Codebase

- ➖ **Less Code**: 95% reduction in duplication
- 📚 **Better Organization**: Clear separation of concerns
- 🐛 **Fewer Bugs**: One implementation instead of three
- 📈 **Future-Proof**: Easy to add more providers (OpenAI, Anthropic API, etc.)

---

## Estimated Effort (Alternative Providers Only)

| Phase | Time | Cumulative | Notes |
|-------|------|-----------|-------|
| Phase 1: Documentation | 0.5h | 0.5h | ✅ Complete |
| Phase 2: Provider Abstraction | 1.5-2h | 2-2.5h | Interface, base class, 2 providers (not 3!) |
| Phase 3: App Store Refactoring | 1h | 3-3.5h | Refactor Claude, keep Copilot untouched |
| Phase 4: UI Refactoring | 1-1.5h | 4-5h | Alternative provider renderer, keep Copilot button |
| Phase 5: Add Ollama | 0.5-1h | 4.5-6h | Trivial after refactoring! |
| Phase 6: Testing & Docs | 0.5-1h | 5-7h | Test Claude & Ollama |
| **Total** | **5-7h** | | **Much simpler!** |

**Comparison**:
- **Claude Code (from scratch)**: 5-6 hours
- **Ollama (without refactoring)**: 5-8 hours ⚠️ Creates duplication
- **Ollama + Alternative Provider Architecture**: 5-7 hours ✅ **Same time, way cleaner!**

**Why This Approach is Better**:
1. ✅ **No upstream conflicts** - Copilot code completely untouched
2. ✅ **Easier fork maintenance** - Clear separation of official vs alternative
3. ✅ **No duplicated code** - Claude + Ollama share logic
4. ✅ **Future-proof** - Adding more alternatives takes <1 hour each
5. ✅ **Simpler** - Only 2 providers in the architecture, not 3

**The time investment pays for itself immediately:**
- Avoid duplicating Claude's ~300 lines of business logic
- Future alternative providers: 1 hour instead of 5-8 hours
- No merge conflicts when syncing from upstream GitHub Desktop

---

## Success Criteria

### Functional Requirements

- ✅ Ollama button appears next to Copilot and Claude buttons
- ✅ Button is disabled when Ollama server is not running
- ✅ Tooltip shows helpful message ("Start Ollama to use this feature")
- ✅ Generates high-quality commit messages using specialized model
- ✅ Loading states work (button disabled, inputs read-only)
- ✅ Error messages are user-friendly and actionable
- ✅ Override warning calls correct provider
- ✅ All three providers work independently

### Technical Requirements

- ✅ Provider interface is implemented by all providers
- ✅ No code duplication in business logic
- ✅ Backward compatible (existing code still works)
- ✅ Type-safe with TypeScript
- ✅ Error handling is consistent across providers
- ✅ Tests pass for all providers

### Quality Requirements

- ✅ Code is well-documented
- ✅ Architecture is maintainable
- ✅ Adding new providers is straightforward
- ✅ Performance is acceptable (<5s for generation)
- ✅ UI is consistent with existing buttons

---

## Future Enhancements

### Phase 2 Enhancements (After MVP)

1. **Model Selection UI**
   - Dropdown to choose Ollama model
   - Show available models from Ollama server
   - Remember last used model

2. **Provider Preferences**
   - Default provider setting
   - Keyboard shortcuts (e.g., Cmd+1 for Copilot, Cmd+2 for Claude, Cmd+3 for Ollama)
   - Remember last used provider

3. **Advanced Error Handling**
   - Retry with exponential backoff
   - Fallback to another provider on failure
   - Better error messages with troubleshooting steps

4. **Analytics & Metrics**
   - Track which provider is most used
   - Track generation success rates
   - Track average generation time per provider

### Future Provider Ideas

Once the architecture is in place, adding these becomes trivial:

- **OpenAI API** (GPT-4 via direct API)
- **Anthropic API** (Claude via API instead of CLI)
- **Gemini** (Google's AI)
- **Local Models** (llama.cpp, llamafile, etc.)
- **Custom Models** (User-provided API endpoint)

---

## References

- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [tavernari/git-commit-message Model](https://ollama.com/tavernari/git-commit-message)
- [Claude Code Implementation Plan](./CLAUDE_CODE_COMMIT_MESSAGE_IMPLEMENTATION_PLAN.md)
- [GitHub Copilot Implementation](app/src/lib/api.ts)

---

## Questions & Decisions

### Resolved

- ✅ **Use specialized model?** Yes, `tavernari/git-commit-message:latest` is already installed
- ✅ **Refactor or duplicate?** Refactor into unified architecture
- ✅ **All providers at once?** Yes, migrate Copilot and Claude to use new architecture
- ✅ **Backward compatible?** Yes, keep old methods as wrappers during migration

### Open

- ⏳ **When to remove deprecated code?** After next major version
- ⏳ **Model selection UI?** Phase 2 enhancement
- ⏳ **Default provider?** User preference in Phase 2

---

## Changelog

### 2025-10-29
- Created initial implementation plan
- Defined provider architecture
- Outlined Ollama integration approach
- Documented migration strategy
