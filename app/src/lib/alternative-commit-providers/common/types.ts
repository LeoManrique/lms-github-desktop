import { OcticonSymbolVariant } from '../../../ui/octicons'

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
  readonly id: 'claude' | 'ollama' // NOT including 'copilot'!

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
  title: string // Summary line (max 50 chars recommended)
  description: string // Detailed description
}

/**
 * Standardized error for all providers.
 */
export class ProviderError extends Error {
  constructor(
    message: string, // User-friendly error message
    public readonly code: string, // Error code (TIMEOUT, AUTH_ERROR, etc.)
    public readonly retryable: boolean = false // Can user retry?
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
