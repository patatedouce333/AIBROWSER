/**
 * MessageDispatcher: Consolidated message routing for Chrome runtime
 * Prevents race conditions by using a SINGLE chrome.runtime.onMessage listener
 * instead of multiple competing handlers
 *
 * CRITICAL: Multiple listeners can cause race conditions where:
 * - Same message type handled by multiple handlers
 * - Response sent before all handlers complete
 * - Message context lost between listeners
 * - Service worker suspends mid-operation
 */

export type MessageType =
  | 'CONFIG_UPDATED'
  | 'TEST_CONNECTION'
  | 'START_TASK'
  | 'CANCEL_TASK'
  | 'GET_TASKS'
  | 'GET_AUTH_STATUS'
  | 'DOM_SNAPSHOT'
  | 'MUTATION_DETECTED'
  | 'SPA_NAVIGATION'
  | 'ACTION_RESULT'
  | 'HEARTBEAT_CHECK';

export interface Message {
  type: MessageType;
  [key: string]: any;
}

export type MessageHandler = (
  msg: Message,
  sender: chrome.runtime.MessageSender
) => Promise<any>;

export interface DispatcherOptions {
  logErrors?: boolean;
  timeoutMs?: number;
}

/**
 * Centralized message dispatcher - ensures only ONE chrome.runtime.onMessage listener
 */
export class MessageDispatcher {
  private handlers: Map<MessageType, MessageHandler> = new Map();
  private isStarted: boolean = false;
  private options: DispatcherOptions;

  constructor(options: DispatcherOptions = {}) {
    this.options = {
      logErrors: true,
      timeoutMs: 30000, // 30 second timeout for handlers
      ...options,
    };
  }

  /**
   * Register a handler for a specific message type
   */
  register(type: MessageType, handler: MessageHandler): void {
    if (this.isStarted) {
      console.warn(`MessageDispatcher: Registering handler after dispatcher started. Type: ${type}`);
    }

    if (this.handlers.has(type)) {
      console.warn(`MessageDispatcher: Overwriting existing handler for type: ${type}`);
    }

    this.handlers.set(type, handler);
  }

  /**
   * Dispatch a message to its registered handler
   * Returns a promise that resolves with the handler response
   */
  async dispatch(msg: Message, sender: chrome.runtime.MessageSender): Promise<any> {
    const { type } = msg;

    console.log(`MessageDispatcher: Dispatching message type: ${type}`);
    console.log(`MessageDispatcher: Registered handlers:`, Array.from(this.handlers.keys()));

    // Validate message structure
    if (!type || typeof type !== 'string') {
      throw new Error('Message must have a type property');
    }

    // Check if handler exists
    const handler = this.handlers.get(type as MessageType);
    if (!handler) {
      console.error(`MessageDispatcher: No handler found for type: ${type}`);
      throw new Error(`No handler registered for message type: ${type}`);
    }

    // Execute handler with timeout protection
    try {
      console.log(`MessageDispatcher: Executing handler for ${type}`);
      const response = await this.executeWithTimeout(handler, msg, sender);
      console.log(`MessageDispatcher: Handler for ${type} returned:`, response);
      return response;
    } catch (error: any) {
      console.error(`MessageDispatcher: Error handling ${type}:`, error);
      if (this.options.logErrors) {
        console.error(`MessageDispatcher: Error handling ${type}:`, error);
      }
      throw error;
    }
  }

  /**
   * Start listening to messages - registers SINGLE chrome.runtime.onMessage listener
   */
  start(): void {
    if (this.isStarted) {
      console.warn('MessageDispatcher: Already started');
      return;
    }

    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.error('MessageDispatcher: Chrome runtime not available');
      return;
    }

    // CRITICAL: Only ONE listener is registered
    chrome.runtime.onMessage.addListener(
      (message: Message, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        // Dispatch message asynchronously
        this.dispatch(message, sender)
          .then((response) => {
            sendResponse({ success: true, data: response });
          })
          .catch((error: any) => {
            sendResponse({
              success: false,
              error: error.message || 'Unknown error',
              type: error.constructor?.name,
            });
          });

        // Return true to indicate we'll send response asynchronously
        return true;
      }
    );

    this.isStarted = true;
    console.log('MessageDispatcher: Started (single listener registered)');
  }

  /**
   * Get list of registered message types
   */
  getRegisteredTypes(): MessageType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a message type has a registered handler
   */
  hasHandler(type: MessageType): boolean {
    return this.handlers.has(type);
  }

  // ============ PRIVATE HELPERS ============

  /**
   * Execute handler with timeout protection
   */
  private async executeWithTimeout(
    handler: MessageHandler,
    msg: Message,
    sender: chrome.runtime.MessageSender
  ): Promise<any> {
    return Promise.race([
      handler(msg, sender),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Handler timeout after ${this.options.timeoutMs}ms`)),
          this.options.timeoutMs
        )
      ),
    ]);
  }
}

/**
 * Export singleton instance for convenience
 */
export const messageDispatcher = new MessageDispatcher({
  logErrors: true,
  timeoutMs: 30000,
});
