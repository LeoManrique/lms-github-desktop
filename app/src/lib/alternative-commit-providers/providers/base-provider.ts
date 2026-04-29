import {
  IAlternativeCommitMessageProvider,
  IProviderCommitMessage,
  ProviderError,
} from '../common/types'
import { OcticonSymbolVariant } from '../../../ui/octicons'

/** Default timeout for all providers (2 minutes). */
export const DEFAULT_TIMEOUT_MS = 120_000

/**
 * Abstract base class with shared prompt, validation, and parsing logic.
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
    if (!response || !response.title) {
      throw new ProviderError(
        `Invalid response format from provider. Parsed: ${JSON.stringify(response).substring(0, 200)}`,
        'INVALID_RESPONSE',
        true // Can retry
      )
    }
    return { title: response.title, description: response.description || '' }
  }

  /**
   * Shared system prompt that tells any model how to generate a commit message.
   * Kept separate from the diff so providers can pass it as a system message
   * when their API supports it.
   */
  protected get systemPrompt(): string {
    return `You are a Git commit message generator. Analyze the provided git diff and generate a commit message.

Return ONLY valid JSON in this exact format:
{
  "title": "A 50 character or less summary in imperative mood",
  "description": "A detailed description of what changed and why"
}

Rules:
- The title MUST be 50 characters or less and use the imperative mood (e.g. "Add", "Fix", "Update")
- The description should explain what changed and why, not how
- Write the description in third person and omit articles ("a", "an", "the")
- Return ONLY the JSON object, no markdown fences, no extra text`
  }

  /**
   * Build the full prompt that includes the system instructions and the diff.
   * Use this when the provider API does not support a separate system message.
   */
  protected buildPrompt(diff: string): string {
    return `${this.systemPrompt}

Git diff:
\`\`\`diff
${diff}
\`\`\`

Generate the commit message as JSON:`
  }

  /**
   * Parse a JSON string that may or may not be wrapped in markdown code fences
   * into the standard {title, description} shape.
   */
  protected parseCommitMessageJSON(raw: string): IProviderCommitMessage {
    // Strip markdown code fences if present (```json ... ```)
    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()

    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new ProviderError(
        `Failed to parse response as JSON. Response was: ${cleaned.substring(0, 200)}`,
        'INVALID_RESPONSE',
        true
      )
    }

    console.log(
      '[CommitProvider] Raw parsed JSON:',
      JSON.stringify(parsed).substring(0, 500)
    )

    // If the model returned a string value, it may be double-encoded JSON
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        // Not double-encoded, will fail at validation below
      }
    }

    // Normalise: accept common field names that models may use
    const title =
      parsed.title ||
      parsed.summary ||
      parsed.subject ||
      parsed.message ||
      parsed.commit_message ||
      parsed.heading
    const description =
      parsed.description ||
      parsed.body ||
      parsed.details ||
      parsed.explanation ||
      ''

    if (!title) {
      throw new ProviderError(
        `Could not extract commit title from model response. ` +
          `Keys returned: [${Object.keys(parsed).join(', ')}]. ` +
          `Raw: ${JSON.stringify(parsed).substring(0, 300)}`,
        'INVALID_RESPONSE',
        true
      )
    }

    return { title, description }
  }
}
