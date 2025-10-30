/**
 * Alternative commit message provider system.
 *
 * This module provides a unified interface for alternative commit message
 * generators (Claude, Ollama, and future additions).
 *
 * IMPORTANT: This does NOT include Copilot! Copilot is the official upstream
 * integration and remains completely separate to avoid merge conflicts.
 */

// Export types
export type {
  IAlternativeCommitMessageProvider,
  IProviderCommitMessage,
} from './common/types'
export { ProviderError } from './common/types'

// Export base class (for potential custom providers)
export { BaseAlternativeCommitMessageProvider } from './providers/base-provider'

// Export concrete providers
export { ClaudeProvider } from './providers/claude-provider'
export { OllamaProvider } from './providers/ollama-provider'

// Export provider manager
export {
  AlternativeProviderManager,
  getProviderManager,
} from './provider-manager'
