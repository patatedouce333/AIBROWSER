/**
 * Unit tests for MessageDispatcher
 * Tests consolidated message routing and single listener pattern
 */

import { MessageDispatcher, Message, messageDispatcher } from '../../src/background/message-dispatcher';

describe('MessageDispatcher', () => {
  let dispatcher: MessageDispatcher;
  let mockSender: chrome.runtime.MessageSender;

  beforeEach(() => {
    dispatcher = new MessageDispatcher();
    mockSender = {
      id: 'test-extension',
      url: 'chrome-extension://test',
      tab: {
        id: 1,
        windowId: 1,
        active: true,
        highlighted: true,
        status: 'complete',
        incognito: false,
        title: 'Test Page',
        url: 'https://example.com',
        pinned: false,
        audible: false,
        discarded: false,
        autoDiscardable: true,
      },
    };
  });

  describe('register', () => {
    test('registers a handler for a message type', () => {
      const handler = jest.fn().mockResolvedValue({ success: true });
      dispatcher.register('START_TASK', handler);

      expect(dispatcher.hasHandler('START_TASK')).toBe(true);
    });

    test('allows registering multiple handlers', () => {
      const handler1 = jest.fn().mockResolvedValue({ success: true });
      const handler2 = jest.fn().mockResolvedValue({ success: true });

      dispatcher.register('START_TASK', handler1);
      dispatcher.register('CANCEL_TASK', handler2);

      expect(dispatcher.hasHandler('START_TASK')).toBe(true);
      expect(dispatcher.hasHandler('CANCEL_TASK')).toBe(true);
    });

    test('logs warning when overwriting existing handler', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      dispatcher.register('START_TASK', handler1);
      dispatcher.register('START_TASK', handler2);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Overwriting existing handler')
      );

      consoleSpy.mockRestore();
    });

    test('logs warning when registering after dispatcher started', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      dispatcher.start();

      const handler = jest.fn();
      dispatcher.register('START_TASK', handler);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('after dispatcher started')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('dispatch', () => {
    test('dispatches message to correct handler', async () => {
      const handler = jest.fn().mockResolvedValue({ taskId: '123' });
      dispatcher.register('START_TASK', handler);

      const message: Message = { type: 'START_TASK', description: 'Test task' };
      const response = await dispatcher.dispatch(message, mockSender);

      expect(handler).toHaveBeenCalledWith(message, mockSender);
      expect(response).toEqual({ taskId: '123' });
    });

    test('passes sender context to handler', async () => {
      const handler = jest.fn().mockResolvedValue({});
      dispatcher.register('DOM_SNAPSHOT', handler);

      const message: Message = { type: 'DOM_SNAPSHOT', data: 'snapshot' };
      await dispatcher.dispatch(message, mockSender);

      expect(handler).toHaveBeenCalledWith(message, mockSender);
      expect(handler.mock.calls[0][1]).toBe(mockSender);
    });

    test('throws error if no handler registered for message type', async () => {
      const message: Message = { type: 'UNKNOWN' as any };

      await expect(dispatcher.dispatch(message, mockSender)).rejects.toThrow(
        'No handler registered for message type: UNKNOWN'
      );
    });

    test('throws error if message has no type', async () => {
      const message: any = { data: 'test' };

      await expect(dispatcher.dispatch(message, mockSender)).rejects.toThrow(
        'Message must have a type property'
      );
    });

    test('catches handler exceptions and rethrows', async () => {
      const error = new Error('Handler failed');
      const handler = jest.fn().mockRejectedValue(error);
      dispatcher.register('START_TASK', handler);

      const message: Message = { type: 'START_TASK' };

      await expect(dispatcher.dispatch(message, mockSender)).rejects.toThrow('Handler failed');
    });

    test('applies timeout protection to handlers', async () => {
      const slowHandler = jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 5000))
      );
      dispatcher = new MessageDispatcher({ timeoutMs: 100 });
      dispatcher.register('SLOW_OPERATION', slowHandler);

      const message: Message = { type: 'SLOW_OPERATION' as any };

      await expect(dispatcher.dispatch(message, mockSender)).rejects.toThrow(
        'Handler timeout after 100ms'
      );
    });

    test('logs errors if logErrors option enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      dispatcher = new MessageDispatcher({ logErrors: true });

      const error = new Error('Handler error');
      const handler = jest.fn().mockRejectedValue(error);
      dispatcher.register('START_TASK', handler);

      const message: Message = { type: 'START_TASK' };
      try {
        await dispatcher.dispatch(message, mockSender);
      } catch (e) {
        // Ignore
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('START_TASK'),
        error
      );

      consoleSpy.mockRestore();
    });

    test('does not log errors if logErrors option disabled', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      dispatcher = new MessageDispatcher({ logErrors: false });

      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      dispatcher.register('START_TASK', handler);

      const message: Message = { type: 'START_TASK' };
      try {
        await dispatcher.dispatch(message, mockSender);
      } catch (e) {
        // Ignore
      }

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('start', () => {
    test('registers chrome.runtime.onMessage listener once', () => {
      // Mock chrome API if not available in test environment
      if (typeof chrome === 'undefined') {
        (global as any).chrome = {
          runtime: {
            onMessage: { addListener: jest.fn() },
          },
        };
      }

      const addListenerSpy = jest.spyOn(chrome.runtime.onMessage, 'addListener');
      const handler = jest.fn();

      dispatcher.register('START_TASK', handler);
      dispatcher.start();

      expect(addListenerSpy).toHaveBeenCalledTimes(1);
      expect(addListenerSpy).toHaveBeenCalledWith(expect.any(Function));

      addListenerSpy.mockRestore();
    });

    test('logs message when started', () => {
      if (typeof chrome === 'undefined') {
        (global as any).chrome = {
          runtime: {
            onMessage: { addListener: jest.fn() },
          },
        };
      }

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      dispatcher.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Started')
      );

      consoleSpy.mockRestore();
    });

    test('prevents multiple starts', () => {
      if (typeof chrome === 'undefined') {
        (global as any).chrome = {
          runtime: {
            onMessage: { addListener: jest.fn() },
          },
        };
      }

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      dispatcher.start();
      dispatcher.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Already started')
      );

      consoleSpy.mockRestore();
    });

    test('handles chrome runtime not available gracefully', () => {
      const originalChrome = (global as any).chrome;
      (global as any).chrome = undefined;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      dispatcher.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Chrome runtime not available')
      );

      (global as any).chrome = originalChrome;
      consoleSpy.mockRestore();
    });
  });

  describe('getRegisteredTypes', () => {
    test('returns array of registered message types', () => {
      dispatcher.register('START_TASK', jest.fn());
      dispatcher.register('CANCEL_TASK', jest.fn());
      dispatcher.register('GET_TASKS', jest.fn());

      const types = dispatcher.getRegisteredTypes();

      expect(types).toContain('START_TASK');
      expect(types).toContain('CANCEL_TASK');
      expect(types).toContain('GET_TASKS');
      expect(types.length).toBe(3);
    });

    test('returns empty array if no handlers registered', () => {
      const types = dispatcher.getRegisteredTypes();
      expect(types).toEqual([]);
    });
  });

  describe('hasHandler', () => {
    test('returns true if handler registered', () => {
      dispatcher.register('START_TASK', jest.fn());
      expect(dispatcher.hasHandler('START_TASK')).toBe(true);
    });

    test('returns false if handler not registered', () => {
      expect(dispatcher.hasHandler('UNKNOWN' as any)).toBe(false);
    });
  });

  describe('Integration: Message Routing', () => {
    test('routes CONFIG_UPDATED to correct handler', async () => {
      const configHandler = jest.fn().mockResolvedValue({ success: true });
      dispatcher.register('CONFIG_UPDATED', configHandler);

      const message: Message = { type: 'CONFIG_UPDATED', config: { key: 'value' } };
      await dispatcher.dispatch(message, mockSender);

      expect(configHandler).toHaveBeenCalledWith(message, mockSender);
    });

    test('routes START_TASK to correct handler', async () => {
      const taskHandler = jest.fn().mockResolvedValue({ taskId: '123' });
      dispatcher.register('START_TASK', taskHandler);

      const message: Message = { type: 'START_TASK', description: 'Test' };
      await dispatcher.dispatch(message, mockSender);

      expect(taskHandler).toHaveBeenCalledWith(message, mockSender);
    });

    test('routes DOM_SNAPSHOT to correct handler', async () => {
      const snapshotHandler = jest.fn().mockResolvedValue({ processed: true });
      dispatcher.register('DOM_SNAPSHOT', snapshotHandler);

      const message: Message = { type: 'DOM_SNAPSHOT', snapshot: { /* data */ } };
      await dispatcher.dispatch(message, mockSender);

      expect(snapshotHandler).toHaveBeenCalledWith(message, mockSender);
    });

    test('multiple handlers do not interfere with each other', async () => {
      const handler1 = jest.fn().mockResolvedValue({ type: 'config' });
      const handler2 = jest.fn().mockResolvedValue({ type: 'task' });
      const handler3 = jest.fn().mockResolvedValue({ type: 'snapshot' });

      dispatcher.register('CONFIG_UPDATED', handler1);
      dispatcher.register('START_TASK', handler2);
      dispatcher.register('DOM_SNAPSHOT', handler3);

      const msg1: Message = { type: 'CONFIG_UPDATED' };
      const msg2: Message = { type: 'START_TASK' };
      const msg3: Message = { type: 'DOM_SNAPSHOT' };

      await dispatcher.dispatch(msg1, mockSender);
      await dispatcher.dispatch(msg2, mockSender);
      await dispatcher.dispatch(msg3, mockSender);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();

      // Each handler called exactly once
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    test('handler failures do not affect other handlers', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('Failed'));
      const successHandler = jest.fn().mockResolvedValue({ ok: true });

      dispatcher.register('START_TASK', failingHandler);
      dispatcher.register('CANCEL_TASK', successHandler);

      const msg1: Message = { type: 'START_TASK' };
      const msg2: Message = { type: 'CANCEL_TASK' };

      // First dispatch should fail
      await expect(dispatcher.dispatch(msg1, mockSender)).rejects.toThrow('Failed');

      // Second dispatch should succeed
      const response = await dispatcher.dispatch(msg2, mockSender);
      expect(response).toEqual({ ok: true });
      expect(successHandler).toHaveBeenCalled();
    });
  });
});
