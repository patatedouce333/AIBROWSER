/**
 * Content Script Health Monitor: Detects when content scripts crash/disconnect
 * Maintains heartbeat from each tab's content script
 * Triggers re-injection if content script becomes unresponsive
 *
 * CRITICAL: Content scripts can die due to:
 * - Tab navigation
 * - Extension reload
 * - Memory pressure
 * - Page crashes
 *
 * Without monitoring:
 * - Silent failures: actions don't execute
 * - User doesn't know content script is dead
 * - Requests hang indefinitely
 *
 * With monitoring:
 * - Detects dead content script within 30 seconds
 * - Triggers automatic re-injection
 * - Notifies caller of content script status
 */

import { getChrome } from '../shared/dependency-container';

export interface ContentScriptStatus {
  tabId: number;
  isAlive: boolean;
  lastHeartbeat: number; // Epoch milliseconds
  timeSinceLastHeartbeat: number; // Milliseconds
}

export interface HealthCheckResult {
  tabId: number;
  healthy: boolean;
  message: string;
}

/**
 * Monitors content script health via heartbeat messages
 */
export class ContentScriptHealthMonitor {
  private lastHeartbeat: Map<number, number> = new Map(); // tabId -> timestamp
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_TIMEOUT_MS = 30 * 1000; // 30 seconds = dead
  private readonly CHECK_INTERVAL_MS = 5 * 1000; // Check every 5 seconds
  private deadTabCallbacks: Set<(tabId: number) => void> = new Set();

  /**
   * Record a heartbeat from a content script
   */
  recordHeartbeat(tabId: number): void {
    const now = Date.now();
    this.lastHeartbeat.set(tabId, now);
    console.log(`ContentScriptHealthMonitor: Heartbeat from tab ${tabId}`);
  }

  /**
   * Ensure content script is alive on a specific tab
   * Throws if content script is dead
   */
  async ensureContentScriptAlive(tabId: number): Promise<void> {
    const isAlive = await this.checkContentScript(tabId);
    if (!isAlive) {
      throw new Error(`Content script is dead on tab ${tabId}`);
    }
  }

  /**
   * Check if a specific content script is alive
   * Sends a ping message and waits for response
   */
  private async checkContentScript(tabId: number): Promise<boolean> {
    return new Promise((resolve) => {
      const chrome = getChrome();
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        console.warn('Chrome tabs API not available');
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        console.warn(`ContentScriptHealthMonitor: Ping timeout on tab ${tabId}`);
        resolve(false);
      }, 2000); // 2 second timeout for ping response

      chrome.tabs.sendMessage(
        tabId,
        { type: 'HEALTH_CHECK', payload: {} },
        (response: any) => {
          clearTimeout(timeout);

          // Handle Chrome's error for disconnected content scripts
          if (chrome.runtime.lastError) {
            console.warn(
              `ContentScriptHealthMonitor: Chrome error on tab ${tabId}:`,
              chrome.runtime.lastError.message
            );
            resolve(false);
            return;
          }

          if (response && response.status === 'healthy') {
            this.recordHeartbeat(tabId);
            resolve(true);
          } else {
            resolve(false);
          }
        }
      );
    });
  }

  /**
   * Get status of all monitored content scripts
   */
  getStatus(tabId?: number): ContentScriptStatus | ContentScriptStatus[] {
    const now = Date.now();

    if (tabId !== undefined) {
      const lastHb = this.lastHeartbeat.get(tabId);
      const lastHeartbeatTime = lastHb ?? 0;
      const timeSinceHeartbeat = now - lastHeartbeatTime;
      const isAlive = timeSinceHeartbeat < this.HEARTBEAT_TIMEOUT_MS;

      return {
        tabId,
        isAlive,
        lastHeartbeat: lastHeartbeatTime,
        timeSinceLastHeartbeat: timeSinceHeartbeat,
      };
    }

    // Return status for all monitored tabs
    return Array.from(this.lastHeartbeat.entries()).map(([id, lastHb]) => {
      const timeSinceHeartbeat = now - lastHb;
      return {
        tabId: id,
        isAlive: timeSinceHeartbeat < this.HEARTBEAT_TIMEOUT_MS,
        lastHeartbeat: lastHb,
        timeSinceLastHeartbeat: timeSinceHeartbeat,
      };
    });
  }

  /**
   * Start periodic health checks
   * Should be called once during background initialization
   */
  startPeriodicCheck(intervalMs: number = this.CHECK_INTERVAL_MS): void {
    if (this.checkInterval) {
      console.warn('ContentScriptHealthMonitor: Periodic check already started');
      return;
    }

    console.log(
      `ContentScriptHealthMonitor: Starting periodic check every ${intervalMs}ms`
    );

    this.checkInterval = setInterval(() => {
      this.performPeriodicCheck();
    }, intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('ContentScriptHealthMonitor: Periodic check stopped');
    }
  }

  /**
   * Register callback for when a content script dies
   */
  onContentScriptDead(callback: (tabId: number) => void): void {
    this.deadTabCallbacks.add(callback);
  }

  /**
   * Unregister callback
   */
  offContentScriptDead(callback: (tabId: number) => void): void {
    this.deadTabCallbacks.delete(callback);
  }

  // ============ PRIVATE HELPERS ============

  /**
   * Perform periodic health check across all monitored tabs
   */
  private performPeriodicCheck(): void {
    const now = Date.now();
    const deadTabs: number[] = [];

    // Check each monitored tab
    for (const [tabId, lastHeartbeat] of this.lastHeartbeat.entries()) {
      const timeSinceHeartbeat = now - lastHeartbeat;

      if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT_MS) {
        console.warn(
          `ContentScriptHealthMonitor: Content script dead on tab ${tabId} (no heartbeat for ${timeSinceHeartbeat}ms)`
        );
        deadTabs.push(tabId);
      }
    }

    // Notify callbacks for dead tabs
    for (const tabId of deadTabs) {
      this.deadTabCallbacks.forEach((callback) => {
        try {
          callback(tabId);
        } catch (error) {
          console.error('ContentScriptHealthMonitor: Callback error:', error);
        }
      });

      // Remove dead tab from tracking
      this.lastHeartbeat.delete(tabId);
    }
  }
}

/**
 * Export singleton instance
 */
export const contentScriptMonitor = new ContentScriptHealthMonitor();
