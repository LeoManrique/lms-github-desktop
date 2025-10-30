import { IAlternativeCommitMessageProvider } from './common/types'

/**
 * Provider registry for alternative commit message generators.
 *
 * NOTE: This does NOT include Copilot! Copilot is the official upstream
 * integration and remains completely separate.
 *
 * This manager is only for our fork's alternative providers: Claude, Ollama,
 * and any future alternatives we add.
 */
export class AlternativeProviderManager {
  private providers: Map<string, IAlternativeCommitMessageProvider> = new Map()

  /**
   * Register a provider.
   */
  register(provider: IAlternativeCommitMessageProvider): void {
    this.providers.set(provider.id, provider)
  }

  /**
   * Get a provider by ID.
   * @throws {Error} if provider is not found
   */
  getProvider(
    id: 'claude' | 'ollama'
  ): IAlternativeCommitMessageProvider | undefined {
    return this.providers.get(id)
  }

  /**
   * Get all registered providers.
   */
  getAllProviders(): IAlternativeCommitMessageProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Get all available providers (those that pass isAvailable() check).
   */
  async getAvailableProviders(): Promise<IAlternativeCommitMessageProvider[]> {
    const providers = this.getAllProviders()
    const results = await Promise.all(
      providers.map(async provider => ({
        provider,
        available: await provider.isAvailable(),
      }))
    )
    return results
      .filter(result => result.available)
      .map(result => result.provider)
  }

  /**
   * Check if a specific provider is available.
   */
  async isProviderAvailable(id: 'claude' | 'ollama'): Promise<boolean> {
    const provider = this.getProvider(id)
    if (!provider) {
      return false
    }
    return provider.isAvailable()
  }
}

// Singleton instance
let managerInstance: AlternativeProviderManager | null = null

/**
 * Get the singleton provider manager instance.
 */
export function getProviderManager(): AlternativeProviderManager {
  if (!managerInstance) {
    managerInstance = new AlternativeProviderManager()
  }
  return managerInstance
}
