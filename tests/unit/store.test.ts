/**
 * Unit tests for Centralized State Store
 * Tests subscriptions, state updates, and undo/redo functionality
 */

import { Store } from '../../src/shared/store';

describe('Store', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store({
      user: { name: 'John', email: 'john@example.com' },
      tasks: { task1: { id: 'task1', title: 'Task 1' } },
      counter: 0,
    });
  });

  describe('Basic State Management', () => {
    test('initializes with state', () => {
      const name = store.getState('user.name');
      expect(name).toBe('John');
    });

    test('gets nested state', () => {
      const user = store.getState('user');
      expect(user.name).toBe('John');
      expect(user.email).toBe('john@example.com');
    });

    test('gets entire state', () => {
      const full = store.getFullState();
      expect(full.user.name).toBe('John');
      expect(full.counter).toBe(0);
    });

    test('sets state value', () => {
      store.setState('user.name', 'Jane');
      expect(store.getState('user.name')).toBe('Jane');
    });

    test('creates new paths on set', () => {
      store.setState('settings.theme', 'dark');
      expect(store.getState('settings.theme')).toBe('dark');
    });

    test('deep copies state (no mutations)', () => {
      const user = store.getState('user');
      user.name = 'Hacker';

      expect(store.getState('user.name')).toBe('John');
    });
  });

  describe('Atomic Updates', () => {
    test('updates multiple values atomically', () => {
      store.updateState({
        'user.name': 'Jane',
        'user.email': 'jane@example.com',
        counter: 5,
      });

      expect(store.getState('user.name')).toBe('Jane');
      expect(store.getState('user.email')).toBe('jane@example.com');
      expect(store.getState('counter')).toBe(5);
    });

    test('partial updates preserve other state', () => {
      store.updateState({ 'user.name': 'Jane' });

      expect(store.getState('user.name')).toBe('Jane');
      expect(store.getState('user.email')).toBe('john@example.com');
    });
  });

  describe('Subscriptions', () => {
    test('notifies subscriber on state change', () => {
      const callback = jest.fn();
      store.subscribe('user.name', callback);

      store.setState('user.name', 'Jane');

      expect(callback).toHaveBeenCalledWith('Jane', 'John');
    });

    test('unsubscribes', () => {
      const callback = jest.fn();
      const unsubscribe = store.subscribe('user.name', callback);

      unsubscribe();

      store.setState('user.name', 'Jane');

      expect(callback).not.toHaveBeenCalled();
    });

    test('multiple subscribers notified', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      store.subscribe('user.name', callback1);
      store.subscribe('user.name', callback2);

      store.setState('user.name', 'Jane');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    test('subscribeToAll notifies on any change', () => {
      const callback = jest.fn();
      store.subscribeToAll(callback);

      store.setState('user.name', 'Jane');
      store.setState('counter', 10);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith('user.name', 'Jane', 'John');
      expect(callback).toHaveBeenCalledWith('counter', 10, 0);
    });

    test('does not notify if value unchanged', () => {
      const callback = jest.fn();
      store.subscribe('user.name', callback);

      store.setState('user.name', 'John'); // Same value

      expect(callback).not.toHaveBeenCalled();
    });

    test('error in subscriber does not break others', () => {
      const badCallback = jest.fn(() => {
        throw new Error('Subscriber error');
      });
      const goodCallback = jest.fn();

      store.subscribe('user.name', badCallback);
      store.subscribe('user.name', goodCallback);

      store.setState('user.name', 'Jane');

      expect(badCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('History & Undo/Redo', () => {
    test('tracks state history', () => {
      store.setState('user.name', 'Jane');
      store.setState('counter', 5);

      const history = store.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(3); // Initial + 2 changes
    });

    test('can undo', () => {
      store.setState('user.name', 'Jane');
      const result = store.undo();

      expect(result).toBe(true);
      expect(store.getState('user.name')).toBe('John');
    });

    test('can redo', () => {
      store.setState('user.name', 'Jane');
      store.undo();
      const result = store.redo();

      expect(result).toBe(true);
      expect(store.getState('user.name')).toBe('Jane');
    });

    test('cannot undo from initial state', () => {
      const result = store.undo();
      expect(result).toBe(false);
    });

    test('cannot redo from latest state', () => {
      store.setState('user.name', 'Jane');
      const result = store.redo();
      expect(result).toBe(false);
    });

    test('discards redo history on new change after undo', () => {
      store.setState('user.name', 'Jane');
      store.setState('counter', 5);

      store.undo(); // Back to Jane
      store.undo(); // Back to initial

      store.setState('user.email', 'new@example.com'); // New change

      const result = store.redo(); // Should fail (redo history discarded)
      expect(result).toBe(false);
    });

    test('canUndo returns correct value', () => {
      expect(store.canUndo()).toBe(false);

      store.setState('user.name', 'Jane');
      expect(store.canUndo()).toBe(true);

      store.undo();
      expect(store.canUndo()).toBe(false);
    });

    test('canRedo returns correct value', () => {
      store.setState('user.name', 'Jane');
      expect(store.canRedo()).toBe(false);

      store.undo();
      expect(store.canRedo()).toBe(true);

      store.redo();
      expect(store.canRedo()).toBe(false);
    });

    test('history has size limit', () => {
      // Create a new store with small limit for testing
      const smallStore = new Store({ count: 0 });

      // Make many changes
      for (let i = 0; i < 100; i++) {
        smallStore.setState('count', i);
      }

      const history = smallStore.getHistory();
      expect(history.length).toBeLessThanOrEqual(50); // Default max
    });
  });

  describe('State Replacement', () => {
    test('replaces entire state', () => {
      store.replaceState({
        user: { name: 'Bob', email: 'bob@example.com' },
        newField: 'value',
      });

      expect(store.getState('user.name')).toBe('Bob');
      expect(store.getState('newField')).toBe('value');
      expect(store.getState('counter')).toBeUndefined();
    });

    test('pushed to history on replace', () => {
      const historyBefore = store.getHistorySize();

      store.replaceState({ simple: 'state' });

      const historyAfter = store.getHistorySize();
      expect(historyAfter).toBeGreaterThan(historyBefore);
    });
  });

  describe('Edge Cases', () => {
    test('handles null values', () => {
      store.setState('user', null);
      expect(store.getState('user')).toBeNull();
    });

    test('handles undefined paths', () => {
      const value = store.getState('nonexistent.path');
      expect(value).toBeUndefined();
    });

    test('handles empty path', () => {
      const state = store.getState('');
      // Empty path should not throw
      expect(state).toBeDefined();
    });

    test('handles array values', () => {
      store.setState('items', [1, 2, 3]);
      const items = store.getState('items');
      expect(items).toEqual([1, 2, 3]);
    });

    test('handles complex nested structures', () => {
      store.setState('complex', {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      });

      expect(store.getState('complex.level1.level2.level3.value')).toBe('deep');
    });
  });

  describe('Memory Management', () => {
    test('getSize estimates state size', () => {
      const size1 = store.getSize();

      store.setState('largeData', 'x'.repeat(1000));

      const size2 = store.getSize();
      expect(size2).toBeGreaterThan(size1);
    });

    test('clearHistory removes old snapshots', () => {
      store.setState('user.name', 'Jane');
      store.setState('counter', 5);

      const historySizeBefore = store.getHistorySize();

      store.clearHistory();

      const historySizeAfter = store.getHistorySize();
      expect(historySizeAfter).toBeLessThan(historySizeBefore);
    });

    test('after clearHistory, undo fails', () => {
      store.setState('user.name', 'Jane');
      store.clearHistory();

      const result = store.undo();
      expect(result).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    test('complex workflow with subs and history', () => {
      const callback = jest.fn();
      store.subscribe('user', callback);

      store.setState('user.name', 'Jane');
      store.setState('user.email', 'jane@example.com');

      expect(callback).toHaveBeenCalledTimes(2);

      store.undo();
      expect(callback).toHaveBeenCalledTimes(3);

      expect(store.getState('user.name')).toBe('Jane'); // Still updated from first change
    });

    test('subscription called during undo/redo', () => {
      const callback = jest.fn();
      store.subscribe('counter', callback);

      store.setState('counter', 10);
      expect(callback).toHaveBeenCalledWith(10, 0);

      callback.mockClear();
      store.undo();
      expect(callback).toHaveBeenCalledWith(0, 10);

      callback.mockClear();
      store.redo();
      expect(callback).toHaveBeenCalledWith(10, 0);
    });

    test('atomic update triggers subscriptions for each path', () => {
      const nameCallback = jest.fn();
      const counterCallback = jest.fn();

      store.subscribe('user.name', nameCallback);
      store.subscribe('counter', counterCallback);

      store.updateState({
        'user.name': 'Jane',
        counter: 42,
      });

      expect(nameCallback).toHaveBeenCalledTimes(1);
      expect(counterCallback).toHaveBeenCalledTimes(1);
    });
  });
});
