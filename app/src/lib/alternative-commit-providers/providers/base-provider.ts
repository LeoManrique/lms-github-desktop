import {
  IAlternativeCommitMessageProvider,
  IProviderCommitMessage,
  ProviderError,
} from '../common/types'
import { OcticonSymbolVariant } from '../../../ui/octicons'

/**
 * Abstract base class with common validation logic.
 * All alternative providers should extend this class.
 */
export abstract class BaseAlternativeCommitMessageProvider
  implements IAlternativeCommitMessageProvider
{
  abstract readonly id: 'claude' | 'ollama'
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
        true // Can retry
      )
    }
    return response
  }
}
