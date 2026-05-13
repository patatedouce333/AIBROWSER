/**
 * Token Manager Refactored: Token Refresh Mutex
 * Prevents concurrent refresh calls by sharing a single in-flight promise
 *
 * CRITICAL: Without mutex pattern:
 * - Two requests both call API when token expires
 * - Second refresh gets different token than first
 * - Token inconsistency causes auth failures
 * - Race conditions in OAuth2 flow
 *
 * WITH mutex pattern:
 * - First request starts refresh, stores promise
 * - Second request checks for in-flight promise
 * - Second request waits for first promise instead of calling API again
 * - All waiters get the same token
 */

export interface OAuth2Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Epoch milliseconds
}

export interface OAuth2Config {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuth2ExchangeResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  tokenType: string;
}

/**
 * Manages OAuth2 token refresh with mutex pattern to prevent concurrent API calls
 */
export class TokenManager {
  private accessToken: string = '';
  private refreshToken: string = '';
  private expiresAt: number = 0;
  private tokenExpireBuffer: number = 5 * 60 * 1000; // 5 minutes buffer

  // CRITICAL: Mutex pattern - stores promise of in-flight refresh
  private refreshPromise: Promise<string> | null = null;

  private config: OAuth2Config;
  private oauth: OAuth2Client;

  constructor(config: OAuth2Config, oauth: OAuth2Client) {
    this.config = config;
    this.oauth = oauth;
  }

  /**
   * Get valid access token, refreshing if necessary
   * Uses mutex pattern to prevent concurrent refresh calls
   */
  async getAccessToken(): Promise<string> {
    // If token is valid, return immediately
    if (this.isTokenValid()) {
      return this.accessToken;
    }

    // CRITICAL MUTEX LOGIC:
    // If a refresh is already in-flight, return that promise instead of starting a new one
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start a new refresh and store the promise
    this.refreshPromise = this.performRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      // Always clear the refresh promise, even on error
      this.refreshPromise = null;
    }
  }

  /**
   * Check if the current token is still valid
   */
  private isTokenValid(): boolean {
    const now = Date.now();
    // Token is valid if expiry is more than buffer away
    return this.expiresAt > now + this.tokenExpireBuffer;
  }

  /**
   * Perform the actual token refresh API call
   * Should only be called once when refresh is needed
   */
  private async performRefresh(): Promise<string> {
    console.log('TokenManager: Starting token refresh...');

    try {
      // Make the OAuth2 token exchange API call
      const response = await this.oauth.exchange(this.config);

      // Update stored tokens
      this.accessToken = response.accessToken;
      this.refreshToken = response.refreshToken || this.refreshToken;
      this.expiresAt = Date.now() + response.expiresInSeconds * 1000;

      console.log('TokenManager: Token refreshed successfully');
      return this.accessToken;
    } catch (error: any) {
      console.error('TokenManager: Token refresh failed:', error);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Manually set tokens (for testing or initial auth)
   */
  setTokens(tokens: OAuth2Tokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken || '';
    this.expiresAt = tokens.expiresAt;
  }

  /**
   * Get stored tokens
   */
  getTokens(): OAuth2Tokens {
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: this.expiresAt,
    };
  }

  /**
   * Check if we have an in-flight refresh
   */
  isRefreshing(): boolean {
    return this.refreshPromise !== null;
  }
}

/**
 * OAuth2 client interface (implement in separate module)
 */
export interface OAuth2Client {
  exchange(config: OAuth2Config): Promise<OAuth2ExchangeResponse>;
}

/**
 * Example usage demonstrating the mutex pattern:
 *
 * const manager = new TokenManager(config, oauth2Client);
 *
 * // Concurrent requests - both share the same refresh promise
 * const [token1, token2] = await Promise.all([
 *   manager.getAccessToken(), // First: starts refresh, stores promise
 *   manager.getAccessToken()  // Second: waits for first promise (no new API call!)
 * ]);
 *
 * // Both tokens are identical
 * assert(token1 === token2);
 *
 * // OAuth2 API was called exactly ONCE (not twice)
 * assert(apiCallCount === 1);
 */
