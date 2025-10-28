import { BaseAlternativeCommitMessageProvider } from './base-provider'
import { IProviderCommitMessage, ProviderError } from '../common/types'
import { ollama } from '../../../ui/octicons'

/**
 * Ollama provider for local commit message generation.
 * Uses specialized git-commit-message model running on localhost.
 */
export class OllamaProvider extends BaseAlternativeCommitMessageProvider {
  readonly id = 'ollama' as const
  readonly displayName = 'Ollama'
  readonly icon = ollama

  private readonly OLLAMA_URL = 'http://localhost:11434'
  private readonly MODEL_NAME = 'tavernari/git-commit-message:latest'
  private readonly MAX_DIFF_SIZE = 50 * 1024 * 1024 // 50MB (local = no limit!)
  private readonly TIMEOUT_MS = 120000 // 2 minutes

  /**
   * Check if Ollama is running and has the commit message model.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.OLLAMA_URL}/api/tags`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      return data.models.some((m: any) => m.name.includes('git-commit-message'))
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
        signal: AbortSignal.timeout(this.TIMEOUT_MS),
      })

      if (!response.ok) {
        // Try to extract error details from response body
        let errorMessage = `Ollama server returned error: ${response.status}`
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = `Ollama error: ${errorData.error}`
          }
        } catch {
          // If we can't parse the error body, use the status text
          if (response.statusText) {
            errorMessage = `Ollama error (${response.status}): ${response.statusText}`
          }
        }

        // Handle specific error cases
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
          response.status >= 500 // Retry on 5xx errors
        )
      }

      let data: any
      try {
        data = await response.json()
      } catch (jsonError) {
        throw new ProviderError(
          'Ollama returned an invalid JSON response. The server may be experiencing issues.',
          'INVALID_RESPONSE',
          true
        )
      }

      // Check if response field exists
      if (!data.response) {
        throw new ProviderError(
          `Ollama response missing 'response' field. Got: ${JSON.stringify(
            data
          ).substring(0, 200)}`,
          'INVALID_RESPONSE',
          true
        )
      }

      // Parse the response string as JSON
      let parsed: any
      try {
        parsed = JSON.parse(data.response)
      } catch (parseError) {
        throw new ProviderError(
          `Failed to parse Ollama response as JSON. Response was: ${data.response?.substring(
            0,
            200
          )}`,
          'INVALID_RESPONSE',
          true
        )
      }

      // The tavernari/git-commit-message model returns {message, body, trailers}
      // We need to map it to {title, description} for our interface
      const mapped: IProviderCommitMessage = {
        title: parsed.message || parsed.title,
        description: parsed.body || parsed.description || '',
      }

      return this.validateResponse(mapped)
    } catch (e) {
      if (e instanceof ProviderError) {
        throw e // Already handled
      }

      if (e instanceof TypeError && e.message.includes('fetch')) {
        throw new ProviderError(
          'Could not connect to Ollama. Make sure Ollama is running ' +
            'at http://localhost:11434',
          'CONNECTION_ERROR',
          true
        )
      }

      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        throw new ProviderError(
          'Ollama took too long to respond (>120s)',
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
}
