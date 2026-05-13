/**
 * Centralized State Store: Single source of truth for application state
 * Prevents data inconsistencies and enables undo/redo functionality
 *
 * CRITICAL: Without centralized state:
 * - Token stored in multiple places
 * - Task state scattered across services
 * - Race conditions on state updates
 * - Difficult to implement undo/redo
 *
 * With centralized store:
 * - Single source of truth
 * - Atomic updates
 * - Subscription-based updates
 * - Full history tracking
 */

export interface StateSnapshot {
  state: Record<string, any>;
  timestamp: number;
  description?: string;
}

export type UnsubscribeFn = () => void;

type SubscriberCallback = (newValue: any, oldValue?: any) => void;
type WildcardCallback = (path: string, newValue: any, oldValue?: any) => void;

/**
 * Centralized state management with subscriptions and history
 */
export class Store {
  private state: Record<string, any> = {};
  private subscribers: Map<string, Set<SubscriberCallback | WildcardCallback>> = new Map();
  private history: StateSnapshot[] = [];
  private historyIndex: number = -1;
  private readonly maxHistory: number = 50;

  constructor(initialState: Record<string, any> = {}) {
    this.state = JSON.parse(JSON.stringify(initialState));
    this.pushSnapshot('Initial state');
  }

  /**
   * Get a value from state by path (supports dot notation)
   */
  getState<T = any>(path: string): T {
    const parts = path.split('.');
    let current: any = this.state;

    for (const part of parts) {
      if (current == null) {
        return undefined as any;
      }
      current = current[part];
    }

    return JSON.parse(JSON.stringify(current)) as T;
  }

  /**
   * Set a value in state by path
   */
  setState<T>(path: string, value: T): void {
    const oldValue = this.getState(path);

    if (JSON.stringify(oldValue) === JSON.stringify(value)) {
      return; // No change
    }

    const parts = path.split('.');
    let current: any = this.state;

    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] == null) {
        current[part] = {};
      }
      current = current[part];
    }

    // Set the value
    const lastPart = parts[parts.length - 1];
    current[lastPart] = JSON.parse(JSON.stringify(value));

    // Push snapshot and notify
    this.pushSnapshot(`Updated ${path}`);
    this.notifySubscribers(path, current[lastPart], oldValue);
  }

  /**
   * Update multiple state values atomically
   */
  updateState(updates: Record<string, any>): void {
    const oldValues: Record<string, any> = {};

    // Store old values
    for (const key of Object.keys(updates)) {
      oldValues[key] = this.getState(key);
    }

    // Apply updates
    for (const [path, value] of Object.entries(updates)) {
      const parts = path.split('.');
      let current: any = this.state;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] == null) {
          current[part] = {};
        }
        current = current[part];
      }

      const lastPart = parts[parts.length - 1];
      current[lastPart] = JSON.parse(JSON.stringify(value));
    }

    // Push single snapshot for atomic update
    this.pushSnapshot('Batch update');

    // Notify all affected paths
    for (const [path, value] of Object.entries(updates)) {
      this.notifySubscribers(path, value, oldValues[path]);
    }
  }

  /**
   * Subscribe to state changes at a specific path
   */
  subscribe(path: string, callback: SubscriberCallback): UnsubscribeFn {
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set());
    }

    const callbacks = this.subscribers.get(path)!;
    callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscribers.delete(path);
      }
    };
  }

  /**
   * Subscribe to any state change
   */
  subscribeToAll(callback: (path: string, newValue: any, oldValue?: any) => void): UnsubscribeFn {
    return this.subscribe('*', callback);
  }

  /**
   * Get entire state (deep copy)
   */
  getFullState(): Record<string, any> {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Replace entire state
   */
  replaceState(newState: Record<string, any>): void {
    this.state = JSON.parse(JSON.stringify(newState));
    this.pushSnapshot('State replaced');
    this.notifySubscribers('', newState);
  }

  /**
   * Get state history
   */
  getHistory(): StateSnapshot[] {
    return this.history.slice(0, this.historyIndex + 1).map((s) =>
      JSON.parse(JSON.stringify(s))
    );
  }

  /**
   * Get history size
   */
  getHistorySize(): number {
    return this.historyIndex + 1;
  }

  /**
   * Can undo?
   */
  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  /**
   * Can redo?
   */
  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  /**
   * Undo to previous state
   */
  undo(): boolean {
    if (!this.canUndo()) {
      return false;
    }

    this.historyIndex--;
    const snapshot = this.history[this.historyIndex];
    this.state = JSON.parse(JSON.stringify(snapshot.state));

    this.notifySubscribers('', this.state);
    console.log(`Store: Undo to "${snapshot.description}"`);

    return true;
  }

  /**
   * Redo to next state
   */
  redo(): boolean {
    if (!this.canRedo()) {
      return false;
    }

    this.historyIndex++;
    const snapshot = this.history[this.historyIndex];
    this.state = JSON.parse(JSON.stringify(snapshot.state));

    this.notifySubscribers('', this.state);
    console.log(`Store: Redo to "${snapshot.description}"`);

    return true;
  }

  /**
   * Clear history (useful for preventing memory bloat)
   */
  clearHistory(): void {
    this.history = [this.history[this.historyIndex]];
    this.historyIndex = 0;
  }

  /**
   * Get current state size (for debugging)
   */
  getSize(): number {
    return JSON.stringify(this.state).length;
  }

  // ============ PRIVATE HELPERS ============

  /**
   * Push a snapshot to history
   */
  private pushSnapshot(description: string): void {
    // Trim any redo states
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Add new snapshot
    this.history.push({
      state: JSON.parse(JSON.stringify(this.state)),
      timestamp: Date.now(),
      description,
    });

    this.historyIndex++;

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.historyIndex--;
    }
  }

  /**
   * Notify subscribers of state changes
   */
  private notifySubscribers(path: string, newValue: any, oldValue?: any): void {
    // Notify specific path subscribers
    const callbacks = this.subscribers.get(path);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(newValue, oldValue);
        } catch (error) {
          console.error('Store: Subscriber error:', error);
        }
      }
    }

    // Notify wildcard subscribers
    const wildcardCallbacks = this.subscribers.get('*');
    if (wildcardCallbacks) {
      for (const callback of wildcardCallbacks) {
        try {
          callback(path, newValue, oldValue);
        } catch (error) {
          console.error('Store: Subscriber error:', error);
        }
      }
    }
  }
}

/**
 * Export singleton store instance
 */
export const store = new Store({
  auth: {
    authenticated: false,
    token: null,
    expiresAt: 0,
    refreshToken: null,
  },
  tasks: {},
  activeTaskId: null,
  tabs: {},
  activeTabId: null,
  actions: {
    queue: [],
    executing: null,
    completed: [],
  },
  cache: {
    snapshots: {},
    mutations: {},
  },
  errors: {
    lastError: null,
    errorHistory: [],
  },
});
