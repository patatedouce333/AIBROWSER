// OAuth2 PKCE authentication manager for Vertex AI
import { AuthTokens } from '../shared/messages';
import { TokenStore } from './token-store';
import { getChrome } from '../shared/dependency-container';

let OAUTH_CONFIG: any = null;

function getOAuthConfig() {
  if (!OAUTH_CONFIG) {
    const chrome = getChrome();
    OAUTH_CONFIG = {
      clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // TODO: Replace with actual client ID from GCP Console
      redirectUri: chrome.runtime.getURL(''), // Extension URL as redirect
      authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    };
  }
  return OAUTH_CONFIG;
}

export class AuthManagerPKCE {
  private static codeVerifier: string | null = null;

  static async login(): Promise<string> {
    try {
      // Generate PKCE code verifier and challenge
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.generateCodeChallenge(codeVerifier);

      // Store verifier for token exchange
      this.codeVerifier = codeVerifier;

      // State for CSRF protection
      const state = crypto.randomUUID();

      // Build auth URL with PKCE
      const config = getOAuthConfig();
      const authUrl = new URL(config.authEndpoint);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', config.scope);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      // Launch OAuth flow
      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      });

      if (!responseUrl) {
        throw new Error('OAuth flow cancelled');
      }

      // Extract authorization code
      const url = new URL(responseUrl);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      if (returnedState !== state) {
        throw new Error('State mismatch - possible CSRF attack');
      }

      if (!code) {
        const error = url.searchParams.get('error');
        throw new Error(`OAuth error: ${error}`);
      }

      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(code);

      // Store tokens securely
      await TokenStore.save(tokens);

      return tokens.accessToken;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  static async refreshToken(): Promise<string | null> {
    try {
      const tokens = await TokenStore.get();
      if (!tokens?.refreshToken) {
        return null;
      }

      const config = getOAuthConfig();
      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: tokens.refreshToken,
          client_id: config.clientId,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const newTokens = await response.json();

      const updatedTokens: AuthTokens = {
        accessToken: newTokens.access_token,
        refreshToken: tokens.refreshToken, // Keep the same refresh token
        expiresAt: Date.now() + (newTokens.expires_in * 1000),
        scope: newTokens.scope,
      };

      await TokenStore.save(updatedTokens);
      return updatedTokens.accessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Clear invalid tokens
      await TokenStore.clear();
      return null;
    }
  }

  static async getValidToken(): Promise<string | null> {
    // Try to get existing valid token
    let token = await TokenStore.getValidToken();

    if (!token) {
      // Try to refresh token
      token = await this.refreshToken();

      if (!token) {
        // Need full authentication
        token = await this.login();
      }
    }

    return token;
  }

  static async getStoredTokens(): Promise<AuthTokens | null> {
    return await TokenStore.get();
  }

  static async logout(): Promise<void> {
    await TokenStore.clear();
    this.codeVerifier = null;
  }

  private static async exchangeCodeForTokens(code: string): Promise<AuthTokens> {
    if (!this.codeVerifier) {
      throw new Error('Code verifier not found');
    }

    const config = getOAuthConfig();
    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: this.codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const tokens = await response.json();

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      scope: tokens.scope,
    };
  }

  // Generate cryptographically secure random string
  private static generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64urlEncode(array);
  }

  // Generate SHA256 code challenge
  private static async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64urlEncode(new Uint8Array(digest));
  }

  // Base64URL encoding
  private static base64urlEncode(buffer: Uint8Array): string {
    let str = '';
    for (let i = 0; i < buffer.length; i++) {
      str += String.fromCharCode(buffer[i]);
    }
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}