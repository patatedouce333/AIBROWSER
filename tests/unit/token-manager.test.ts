/**
 * Unit tests for Token Manager Mutex Pattern
 * Tests concurrent refresh prevention and token synchronization
 */

import { TokenManager, OAuth2Client, OAuth2Config } from '../../src/background/token-store-refactored';

describe('TokenManager - Mutex Pattern', () => {
  let tokenManager: TokenManager;
  let mockOAuth2Client: jest.Mocked<OAuth2Client>;
  let config: OAuth2Config;

  beforeEach(() => {
    mockOAuth2Client = {
      exchange: jest.fn(),
    };

    config = {
      clientId: 'test-client-id',
      redirectUri: 'https://example.com/callback',
      scopes: ['scope1', 'scope2'],
    };

    tokenManager = new TokenManager(config, mockOAuth2Client);
  });

  describe('Basic token management', () => {
    test('stores and retrieves tokens', () => {
      const tokens = {
        accessToken: 'test-token-123',
        refreshToken: 'refresh-token-456',
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };

      tokenManager.setTokens(tokens);
      const retrieved = tokenManager.getTokens();

      expect(retrieved).toEqual(tokens);
    });

    test('considers token valid if expiry is beyond buffer', () => {
      const tokens = {
        accessToken: 'test-token',
        expiresAt: Date.now() + 20 * 60 * 1000, // 20 minutes from now
      };

      tokenManager.setTokens(tokens);
      const retrieved = tokenManager.getTokens();

      expect(retrieved.accessToken).toBe('test-token');
    });
  });

  describe('Token validation', () => {
    test('treats token as expired when expiry is past', async () => {
      const expiredTokens = {
        accessToken: 'expired-token',
        expiresAt: Date.now() - 1000, // 1 second ago
      };

      tokenManager.setTokens(expiredTokens);

      mockOAuth2Client.exchange.mockResolvedValue({
        accessToken: 'new-token',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });

      const token = await tokenManager.getAccessToken();
      expect(token).toBe('new-token');
      expect(mockOAuth2Client.exchange).toHaveBeenCalled();
    });

    test('returns cached token if still valid', async () => {
      const validTokens = {
        accessToken: 'valid-token',
        expiresAt: Date.now() + 20 * 60 * 1000, // 20 minutes away
      };

      tokenManager.setTokens(validTokens);

      const token = await tokenManager.getAccessToken();
      expect(token).toBe('valid-token');
      expect(mockOAuth2Client.exchange).not.toHaveBeenCalled();
    });

    test('respects 5-minute expiry buffer', async () => {
      // Token expires in 4 minutes (before the 5-minute buffer)
      const tokens = {
        accessToken: 'almost-expired-token',
        expiresAt: Date.now() + 4 * 60 * 1000,
      };

      tokenManager.setTokens(tokens);

      mockOAuth2Client.exchange.mockResolvedValue({
        accessToken: 'new-token',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });

      const token = await tokenManager.getAccessToken();
      expect(token).toBe('new-token'); // Should refresh despite token not technically expired
      expect(mockOAuth2Client.exchange).toHaveBeenCalled();
    });
  });

  describe('Mutex Pattern - Preventing Concurrent Refresh', () => {
    test('concurrent requests share the same refresh promise', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000, // Expired
      };

      tokenManager.setTokens(tokens);

      // Make the refresh slow to test concurrency
      mockOAuth2Client.exchange.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  accessToken: 'new-token-123',
                  expiresInSeconds: 3600,
                  tokenType: 'Bearer',
                }),
              100
            )
          )
      );

      // Start TWO concurrent requests
      const promise1 = tokenManager.getAccessToken();
      const promise2 = tokenManager.getAccessToken();

      // Both should resolve to the same token
      const [token1, token2] = await Promise.all([promise1, promise2]);

      expect(token1).toBe('new-token-123');
      expect(token2).toBe('new-token-123');
      expect(token1).toBe(token2); // Same reference/value
    });

    test('OAuth2 API called exactly ONCE for concurrent requests', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      mockOAuth2Client.exchange.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  accessToken: 'new-token',
                  expiresInSeconds: 3600,
                  tokenType: 'Bearer',
                }),
              50
            )
          )
      );

      // Five concurrent requests
      const promises = Array(5)
        .fill(null)
        .map(() => tokenManager.getAccessToken());

      await Promise.all(promises);

      // API should be called only ONCE
      expect(mockOAuth2Client.exchange).toHaveBeenCalledTimes(1);
      expect(mockOAuth2Client.exchange).toHaveBeenCalledWith(config);
    });

    test('three concurrent requests all receive same token', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      mockOAuth2Client.exchange.mockResolvedValue({
        accessToken: 'synchronized-token',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });

      const tokens1 = await tokenManager.getAccessToken();
      const tokens2 = await tokenManager.getAccessToken();
      const tokens3 = await tokenManager.getAccessToken();

      expect(tokens1).toBe('synchronized-token');
      expect(tokens2).toBe('synchronized-token');
      expect(tokens3).toBe('synchronized-token');
    });

    test('second request waits for first refresh to complete', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      const callOrder: string[] = [];

      mockOAuth2Client.exchange.mockImplementation(
        () =>
          new Promise((resolve) => {
            callOrder.push('api-call-start');
            setTimeout(() => {
              callOrder.push('api-call-end');
              resolve({
                accessToken: 'new-token',
                expiresInSeconds: 3600,
                tokenType: 'Bearer',
              });
            }, 50);
          })
      );

      // Start first request
      const promise1 = tokenManager.getAccessToken().then((token) => {
        callOrder.push('request-1-done');
        return token;
      });

      // Start second request (should wait for first)
      const promise2 = tokenManager.getAccessToken().then((token) => {
        callOrder.push('request-2-done');
        return token;
      });

      const [token1, token2] = await Promise.all([promise1, promise2]);

      expect(token1).toBe('new-token');
      expect(token2).toBe('new-token');

      // Verify API was called only once
      expect(mockOAuth2Client.exchange).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling with mutex', () => {
    test('refresh failure propagates to all concurrent requestors', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      const error = new Error('OAuth2 server error');
      mockOAuth2Client.exchange.mockRejectedValue(error);

      const promise1 = tokenManager.getAccessToken();
      const promise2 = tokenManager.getAccessToken();

      await expect(promise1).rejects.toThrow('Token refresh failed');
      await expect(promise2).rejects.toThrow('Token refresh failed');

      // Both should fail with the same error
      expect(mockOAuth2Client.exchange).toHaveBeenCalledTimes(1);
    });

    test('clears refresh promise on error', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      mockOAuth2Client.exchange.mockRejectedValueOnce(new Error('Network error'));

      try {
        await tokenManager.getAccessToken();
      } catch (e) {
        // Expected
      }

      // Refresh promise should be cleared
      expect(tokenManager.isRefreshing()).toBe(false);

      // Next refresh attempt should retry
      mockOAuth2Client.exchange.mockResolvedValueOnce({
        accessToken: 'recovered-token',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });

      const token = await tokenManager.getAccessToken();
      expect(token).toBe('recovered-token');
    });

    test('second refresh after first failure calls API again', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      // First attempt fails
      mockOAuth2Client.exchange.mockRejectedValueOnce(new Error('Network error'));

      try {
        await tokenManager.getAccessToken();
      } catch (e) {
        // Expected
      }

      // Reset token to expired
      tokenManager.setTokens({
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      });

      // Second attempt succeeds
      mockOAuth2Client.exchange.mockResolvedValueOnce({
        accessToken: 'recovery-token',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });

      const token = await tokenManager.getAccessToken();
      expect(token).toBe('recovery-token');

      // API should have been called twice (once failed, once succeeded)
      expect(mockOAuth2Client.exchange).toHaveBeenCalledTimes(2);
    });
  });

  describe('Token update during refresh', () => {
    test('stores new refresh token if provided', async () => {
      const tokens = {
        accessToken: 'old-token',
        refreshToken: 'old-refresh-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      mockOAuth2Client.exchange.mockResolvedValue({
        accessToken: 'new-token',
        refreshToken: 'new-refresh-token',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });

      await tokenManager.getAccessToken();

      const stored = tokenManager.getTokens();
      expect(stored.accessToken).toBe('new-token');
      expect(stored.refreshToken).toBe('new-refresh-token');
    });

    test('preserves refresh token if API does not return new one', async () => {
      const tokens = {
        accessToken: 'old-token',
        refreshToken: 'old-refresh-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      mockOAuth2Client.exchange.mockResolvedValue({
        accessToken: 'new-token',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });

      await tokenManager.getAccessToken();

      const stored = tokenManager.getTokens();
      expect(stored.refreshToken).toBe('old-refresh-token');
    });
  });

  describe('Refresh promise state', () => {
    test('isRefreshing returns true during refresh', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      let refreshing = false;

      mockOAuth2Client.exchange.mockImplementation(
        () =>
          new Promise((resolve) => {
            refreshing = tokenManager.isRefreshing();
            setTimeout(
              () =>
                resolve({
                  accessToken: 'new-token',
                  expiresInSeconds: 3600,
                  tokenType: 'Bearer',
                }),
              10
            );
          })
      );

      await tokenManager.getAccessToken();

      expect(refreshing).toBe(true);
    });

    test('isRefreshing returns false after refresh completes', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      mockOAuth2Client.exchange.mockResolvedValue({
        accessToken: 'new-token',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });

      await tokenManager.getAccessToken();

      expect(tokenManager.isRefreshing()).toBe(false);
    });
  });

  describe('Sequential vs concurrent pattern', () => {
    test('sequential requests after valid token do not trigger refresh', async () => {
      const tokens = {
        accessToken: 'valid-token',
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes away
      };

      tokenManager.setTokens(tokens);

      // Make 10 sequential requests
      for (let i = 0; i < 10; i++) {
        const token = await tokenManager.getAccessToken();
        expect(token).toBe('valid-token');
      }

      // No API calls should have been made
      expect(mockOAuth2Client.exchange).not.toHaveBeenCalled();
    });

    test('mixed concurrent and sequential requests work correctly', async () => {
      const tokens = {
        accessToken: 'old-token',
        expiresAt: Date.now() - 1000,
      };

      tokenManager.setTokens(tokens);

      mockOAuth2Client.exchange.mockResolvedValueOnce({
        accessToken: 'new-token-1',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });

      // First concurrent batch
      const [token1, token2, token3] = await Promise.all([
        tokenManager.getAccessToken(),
        tokenManager.getAccessToken(),
        tokenManager.getAccessToken(),
      ]);

      expect(token1).toBe('new-token-1');
      expect(token2).toBe('new-token-1');
      expect(token3).toBe('new-token-1');
      expect(mockOAuth2Client.exchange).toHaveBeenCalledTimes(1);

      // Second sequential batch (should use cached token)
      const token4 = await tokenManager.getAccessToken();
      expect(token4).toBe('new-token-1');
      expect(mockOAuth2Client.exchange).toHaveBeenCalledTimes(1); // Still 1
    });
  });
});
