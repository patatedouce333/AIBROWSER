// Token storage using chrome.storage.session for security
import { AuthTokens } from '../shared/messages';
import { getChrome } from '../shared/dependency-container';

const TOKEN_KEY = 'cometeor_auth_tokens';

export class TokenStore {
  static async save(tokens: AuthTokens): Promise<void> {
    const chrome = getChrome();
    await chrome.storage.session.set({ [TOKEN_KEY]: tokens });
  }

  static async get(): Promise<AuthTokens | null> {
    const chrome = getChrome();
    const result = await chrome.storage.session.get([TOKEN_KEY]);
    return result[TOKEN_KEY] || null;
  }

  static async clear(): Promise<void> {
    const chrome = getChrome();
    await chrome.storage.session.remove([TOKEN_KEY]);
  }

  static async isValid(): Promise<boolean> {
    const tokens = await this.get();
    if (!tokens) return false;

    // Check if token is expired with 5-minute buffer
    const now = Date.now();
    const buffer = 5 * 60 * 1000; // 5 minutes
    return tokens.expiresAt > (now + buffer);
  }

  static async getValidToken(): Promise<string | null> {
    if (await this.isValid()) {
      const tokens = await this.get();
      return tokens?.accessToken || null;
    }
    return null;
  }
}