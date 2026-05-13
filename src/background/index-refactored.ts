/**
 * Main service worker entry point - REFACTORED for MessageDispatcher
 * Consolidates all message handling into a single dispatcher to prevent race conditions
 *
 * CHANGES FROM ORIGINAL:
 * - Replaced 3 separate chrome.runtime.onMessage.addListener calls
 * - Added MessageDispatcher for centralized routing
 * - Handlers registered with dispatcher instead of inline listeners
 * - Single listener ensures no message handler races
 */

import { TaskManager } from './task-manager';
import { TabManager } from './tab-manager';
import { OffscreenManager } from './offscreen-manager';
import { startKeepAlive, stopKeepAlive } from './keep-alive';
import { AuthManagerPKCE } from './auth-manager-pkce';
import { VertexClient } from './vertex-client';
import { getChrome } from '../shared/dependency-container';
import {
  SidebarMessage,
  BackgroundMessage,
  BackgroundResponse,
  PageSnapshot,
  AuthTokens,
} from '../shared/messages';
import { messageDispatcher } from './message-dispatcher';

console.log('Cometeor service worker loaded');

// Initialize managers
const taskManager = new TaskManager();
const tabManager = new TabManager();
const offscreenManager = new OffscreenManager();

// Service worker lifecycle management
startKeepAlive();

// ============ MESSAGE HANDLERS ============

/**
 * Config update handler
 */
async function handleConfigUpdate(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  if (message.type === 'CONFIG_UPDATED') {
    VertexClient.updateConfig(message.config);
    return { success: true };
  }
  throw new Error('Invalid config message');
}

/**
 * Connection test handler
 */
async function handleTestConnection(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  const success = await VertexClient.testConnection();
  return { success };
}

/**
 * Task management handler (sidebar messages)
 */
async function handleTaskMessage(message: any, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse> {
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

  return response;
}

/**
 * Content script message handler
 */
async function handleContentScriptMessage(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  if (!sender.tab?.id) {
    throw new Error('Message must come from a tab');
  }

  const tabId = sender.tab.id;

  switch (message.type) {
    case 'DOM_SNAPSHOT':
      taskManager.handleDomSnapshot(message.snapshot, tabId);
      return { success: true };

    case 'MUTATION_DETECTED':
      taskManager.handleMutation(message.url, message.significant, tabId);
      return { success: true };

    case 'SPA_NAVIGATION':
      taskManager.handleSpaNavigation(message.url, tabId);
      return { success: true };

    case 'ACTION_RESULT':
      // Action result is handled by ActionExecutor via promises
      return { success: true };

    default:
      throw new Error('Unknown content script message type');
  }
}

// ============ DISPATCHER SETUP ============

if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Register all message handlers with the dispatcher
  messageDispatcher.register('CONFIG_UPDATED', handleConfigUpdate);
  messageDispatcher.register('TEST_CONNECTION', handleTestConnection);
  messageDispatcher.register('START_TASK', handleTaskMessage);
  messageDispatcher.register('CANCEL_TASK', handleTaskMessage);
  messageDispatcher.register('GET_TASKS', handleTaskMessage);
  messageDispatcher.register('GET_AUTH_STATUS', handleTaskMessage);
  messageDispatcher.register('DOM_SNAPSHOT', handleContentScriptMessage);
  messageDispatcher.register('MUTATION_DETECTED', handleContentScriptMessage);
  messageDispatcher.register('SPA_NAVIGATION', handleContentScriptMessage);
  messageDispatcher.register('ACTION_RESULT', handleContentScriptMessage);

  // Start the dispatcher - registers single chrome.runtime.onMessage listener
  messageDispatcher.start();

  // ============ TAB MANAGEMENT ============

  const chrome = getChrome();

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    TabManager.setActiveTab(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      TabManager.handleTabUpdate(tabId, tab.url);
    }
  });

  // ============ EXTENSION LIFECYCLE ============

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
