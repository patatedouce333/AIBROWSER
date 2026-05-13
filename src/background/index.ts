// Main service worker entry point
import { TaskManager } from './task-manager';
import { TabManager } from './tab-manager';
import { OffscreenManager } from './offscreen-manager';
import { startKeepAlive, stopKeepAlive } from './keep-alive';
import { AuthManagerPKCE } from './auth-manager-pkce';
import { VertexClient } from './vertex-client';
import { SidebarMessage, BackgroundMessage, BackgroundResponse, PageSnapshot, AuthTokens } from '../shared/messages';
console.log('Cometeor service worker loaded');

// Initialize managers
const taskManager = new TaskManager();
const tabManager = new TabManager();
const offscreenManager = new OffscreenManager();

// Service worker lifecycle management
startKeepAlive();

// Message handlers
if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Handle config updates from options page
  chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    if (message.type === 'CONFIG_UPDATED') {
      VertexClient.updateConfig(message.config);
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'TEST_CONNECTION') {
      VertexClient.testConnection().then(success => {
        sendResponse({ success });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
  });

  // Handle sidebar messages
  chrome.runtime.onMessage.addListener((message: SidebarMessage, sender, sendResponse) => {
    (async () => {
      try {
        let response: BackgroundResponse;

        switch (message.type) {
          case 'START_TASK':
            const task = await taskManager.createTask(message.description);
            response = { type: 'TASK_STARTED', task };
            break;

          case 'CANCEL_TASK':
            await taskManager.cancelTask(message.taskId);
            response = { type: 'TASK_CANCELLED', taskId: message.taskId };
            break;

          case 'GET_TASKS':
            const tasks = taskManager.getTasks();
            response = { type: 'TASKS_LIST', tasks };
            break;

          case 'GET_AUTH_STATUS':
            const tokenString = await AuthManagerPKCE.getValidToken();
            const tokensObj = tokenString ? await AuthManagerPKCE.getStoredTokens() : undefined;
            response = { type: 'AUTH_STATUS', authenticated: !!tokenString, tokens: tokensObj || undefined };
            break;

          default:
            response = { type: 'TASK_FAILED', task: null as any };
        }

        sendResponse(response);
      } catch (error: any) {
        console.error('Message handling error:', error);
        sendResponse({ type: 'TASK_FAILED', task: { error: error.message } });
      }
    })();
    return true; // Keep message channel open for async response
  });

  // Handle content script messages
  chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    if (!sender.tab?.id) return;

    (async () => {
      try {
        switch (message.type) {
          case 'DOM_SNAPSHOT':
            taskManager.handleDomSnapshot(message.snapshot, sender.tab!.id);
            sendResponse({ success: true });
            break;

          case 'MUTATION_DETECTED':
            taskManager.handleMutation(message.url, message.significant, sender.tab!.id);
            sendResponse({ success: true });
            break;

          case 'SPA_NAVIGATION':
            taskManager.handleSpaNavigation(message.url, sender.tab!.id);
            sendResponse({ success: true });
            break;

          case 'ACTION_RESULT':
            // Action result is handled by ActionExecutor via promises
            sendResponse({ success: true });
            break;

          default:
            sendResponse({ error: 'Unknown background message type' });
        }
      } catch (error: any) {
        console.error('Content message handling error:', error);
        sendResponse({ error: error.message });
      }
    })();
    return true;
  });

  // Tab management
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    TabManager.setActiveTab(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      TabManager.handleTabUpdate(tabId, tab.url);
    }
  });

  // Extension lifecycle
  chrome.runtime.onInstalled.addListener(async () => {
    console.log('Cometeor extension installed');

    // Test Vertex AI connection
    try {
      await VertexClient.testConnection();
      console.log('Vertex AI connection test successful');
    } catch (error) {
      console.warn('Vertex AI connection test failed:', error);
    }
  });

  chrome.runtime.onSuspend.addListener(() => {
    console.log('Cometeor service worker suspending');
    stopKeepAlive();
  });
}