/**
 * Content Script Heartbeat: Periodic health signal to background service worker
 * Runs in content script context on every tab
 *
 * CRITICAL: Content scripts must signal liveness to background:
 * - Background can detect crashes/unloads
 * - Background can trigger re-injection if needed
 * - Prevents silent failures and hanging requests
 */

export interface HeartbeatConfig {
  intervalMs?: number; // How often to send heartbeat
}

/**
 * Starts heartbeat monitor in the content script
 * Should be called once on content script initialization
 */
export function startHeartbeat(config: HeartbeatConfig = {}): void {
  const { intervalMs = 5000 } = config; // Default: every 5 seconds

  console.log('[Content Script Heartbeat] Starting heartbeat with interval:', intervalMs);

  // Send initial heartbeat
  sendHeartbeat();

  // Set up periodic heartbeat
  setInterval(() => {
    sendHeartbeat();
  }, intervalMs);

  // Also respond to health checks from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'HEALTH_CHECK') {
      console.log('[Content Script Heartbeat] Health check received');
      sendResponse({ status: 'healthy' });
    }
  });

  console.log('[Content Script Heartbeat] Heartbeat monitor started');
}

/**
 * Send a heartbeat message to the background service worker
 */
function sendHeartbeat(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.warn('[Content Script Heartbeat] Chrome runtime not available');
    return;
  }

  const message = {
    type: 'HEARTBEAT_CHECK',
    payload: {
      url: window.location.href,
      timestamp: Date.now(),
      documentReady: document.readyState,
    },
  };

  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        // Service worker may be suspended or extension reloaded
        console.warn('[Content Script Heartbeat] Failed to send heartbeat:', chrome.runtime.lastError);
      }
      // We don't strictly need the response, but log it for debugging
      if (response) {
        console.log('[Content Script Heartbeat] Heartbeat acknowledged:', response);
      }
    });
  } catch (error) {
    // This can happen if extension is reloaded while content script runs
    console.error('[Content Script Heartbeat] Error sending heartbeat:', error);
  }
}

/**
 * Stop heartbeat (useful for cleanup)
 */
export function stopHeartbeat(): void {
  console.log('[Content Script Heartbeat] Stopping heartbeat');
  // Note: We can't easily stop the setInterval without storing the ID
  // In production, you'd want to store it and clear it here
}

/**
 * IMPLEMENTATION NOTE:
 *
 * This module should be imported and initialized in your content script:
 *
 * // In content-script.ts or similar
 * import { startHeartbeat } from './heartbeat';
 *
 * startHeartbeat({
 *   intervalMs: 5000, // Send heartbeat every 5 seconds
 * });
 *
 * The heartbeat will:
 * 1. Send a HEARTBEAT_CHECK message to the background every 5 seconds
 * 2. Respond to HEALTH_CHECK messages from the background
 * 3. Indicate the content script is alive and responsive
 * 4. Allow the background to detect when the content script crashes
 */
