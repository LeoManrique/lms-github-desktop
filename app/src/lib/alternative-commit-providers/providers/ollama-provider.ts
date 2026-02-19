import {
  BaseAlternativeCommitMessageProvider,
  DEFAULT_TIMEOUT_MS,
} from './base-provider'
import { IProviderCommitMessage, ProviderError } from '../common/types'
import { ollama } from '../../../ui/octicons'

/**
 * Ollama provider for local commit message generation.
 * Works with any instruction-following model available in Ollama.
 */
export class OllamaProvider extends BaseAlternativeCommitMessageProvider {
  readonly id = 'ollama' as const
  readonly displayName = 'Ollama'
  readonly icon = ollama

  private readonly OLLAMA_URL: string
  private readonly MODEL_NAME: string
  private readonly MAX_DIFF_SIZE = 50 * 1024 * 1024 // 50MB (local = no strict limit)
  private readonly TIMEOUT_MS = DEFAULT_TIMEOUT_MS

  public constructor(config?: { model?: string; serverUrl?: string }) {
    super()
    this.MODEL_NAME = config?.model ?? 'tavernari/git-commit-message:latest'
    this.OLLAMA_URL = config?.serverUrl ?? 'http://localhost:11434'
  }

  /**
   * Check if Ollama is running.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.OLLAMA_URL}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })

      return response.ok
    } catch (e) {
      return false
    }
  }

  /**
   * Generate commit message using any Ollama model.
   */
  async generateCommitMessage(diff: string): Promise<IProviderCommitMessage> {
    this.validateDiff(diff)

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
          prompt: this.buildPrompt(diff),
          stream: false,
          format: 'json',
        }),
        signal: AbortSignal.timeout(this.TIMEOUT_MS),
      })

      if (!response.ok) {
        await this.handleHttpError(response)
      }

      let data: any
      try {
        data = await response.json()
      } catch {
        throw new ProviderError(
          'Ollama returned an invalid JSON response. The server may be experiencing issues.',
          'INVALID_RESPONSE',
          true
        )
      }

      if (!data.response) {
        throw new ProviderError(
          `Ollama response missing 'response' field. Got: ${JSON.stringify(
            data
          ).substring(0, 200)}`,
          'INVALID_RESPONSE',
          true
        )
      }

      return this.parseCommitMessageJSON(data.response)
    } catch (e) {
      if (e instanceof ProviderError) {
        throw e
      }

      if (e instanceof TypeError && e.message.includes('fetch')) {
        throw new ProviderError(
          `Could not connect to Ollama. Make sure Ollama is running at ${this.OLLAMA_URL}`,
          'CONNECTION_ERROR',
          true
        )
      }

      if (
        (e as any).name === 'AbortError' ||
        (e as any).name === 'TimeoutError'
      ) {
        throw new ProviderError(
          `Ollama took too long to respond (>${this.TIMEOUT_MS / 1000}s)`,
          'TIMEOUT',
          true
        )
      }

      throw new ProviderError(
        `Failed to generate commit message: ${
          e instanceof Error ? e.message : String(e)
        }`,
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

  private async handleHttpError(response: Response): Promise<never> {
    let errorMessage = `Ollama server returned error: ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData.error) {
        errorMessage = `Ollama error: ${errorData.error}`
      }
    } catch {
      if (response.statusText) {
        errorMessage = `Ollama error (${response.status}): ${response.statusText}`
      }
    }

    if (response.status === 404) {
      throw new ProviderError(
        `Model "${this.MODEL_NAME}" not found. ` +
          `Install it with: ollama pull ${this.MODEL_NAME}`,
        'MODEL_NOT_FOUND',
        false
      )
    }

    throw new ProviderError(
      errorMessage,
      'API_ERROR',
      response.status >= 500
    )
  }
}
