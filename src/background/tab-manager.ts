// Tab management utilities for content script injection and navigation detection
import { getChrome } from '../shared/dependency-container';

export class TabManager {
  private static activeTabId: number | null = null;

  static setActiveTab(tabId: number) {
    this.activeTabId = tabId;
  }

  static handleTabUpdate(tabId: number, url: string) {
    // Handle tab URL changes for SPA detection
    console.log(`Tab ${tabId} updated to ${url}`);
  }

  static async ensureContentScript(tabId: number): Promise<void> {
    const MAX_WAIT = 10000;
    const POLL_INTERVAL = 200;
    const start = Date.now();
    const chrome = getChrome();

    console.log(`Ensuring content script ready in tab ${tabId}`);

    while (Date.now() - start < MAX_WAIT) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        if (response?.pong) {
          console.log(`Content script ready in tab ${tabId}`);
          return;
        }
      } catch {
        // Content script not ready, try to inject
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js'],
          });
          // Give it time to initialize
          await this.sleep(100);
          continue;
        } catch (injectError: any) {
          if (injectError.message?.includes('Cannot access')) {
            throw new Error(`Cannot inject into protected page in tab ${tabId}`);
          }
          // Page might not be ready yet, continue polling
        }
      }
      await this.sleep(POLL_INTERVAL);
    }

    throw new Error(`Content script not ready in tab ${tabId} after ${MAX_WAIT}ms`);
  }

  static async waitForNavigation(
    tabId: number,
    timeoutMs = 15000
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const chrome = getChrome();
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Navigation timeout'));
      }, timeoutMs);

      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          // Small delay for scripts to initialize
          setTimeout(resolve, 300);
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  static async detectNavigation(
    tabId: number,
    action: () => Promise<any>,
    timeoutMs = 3000
  ): Promise<{ navigated: boolean; newUrl?: string }> {
    const chrome = getChrome();
    const tabBefore = await chrome.tabs.get(tabId);
    const urlBefore = tabBefore.url;
    let navigated = false;
    let newUrl: string | undefined;

    const navigationPromise = new Promise<void>((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
        tab: chrome.tabs.Tab
      ) => {
        if (updatedTabId === tabId && changeInfo.url && changeInfo.url !== urlBefore) {
          navigated = true;
          newUrl = changeInfo.url;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // Timeout if no navigation
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeoutMs);
    });

    await action();
    await navigationPromise;

    return { navigated, newUrl };
  }

  static async getActiveTab(): Promise<chrome.tabs.Tab> {
    const chrome = getChrome();
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      throw new Error('No active tab found');
    }
    return tabs[0];
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}