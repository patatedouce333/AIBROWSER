import { TaskManager } from './task-manager';
import { TabManager } from './tab-manager';
import { OffscreenManager } from './offscreen-manager';
import { startKeepAlive, stopKeepAlive } from './keep-alive';
import { AiClient } from './ai-client';
import { getChrome } from '../shared/dependency-container';
import { BackgroundResponse } from '../shared/messages';
import { messageDispatcher } from './message-dispatcher';

console.log('Cometeor service worker loaded');

const taskManager = new TaskManager();
const tabManager = new TabManager();
const offscreenManager = new OffscreenManager();

startKeepAlive();

// ============ MESSAGE HANDLERS ============

async function handleConfigUpdate(message: any): Promise<any> {
  if (message.type === 'CONFIG_UPDATED') {
    AiClient.updateConfig(message.config);
    return { success: true };
  }
  throw new Error('Invalid config message');
}

async function handleTestConnection(): Promise<any> {
  const success = await AiClient.testConnection();
  return { success };
}

async function handleTaskMessage(message: any): Promise<BackgroundResponse> {
  switch (message.type) {
    case 'START_TASK': {
      const task = await taskManager.createTask(message.description);
      return { type: 'TASK_STARTED', task };
    }
    case 'CANCEL_TASK': {
      await taskManager.cancelTask(message.taskId);
      return { type: 'TASK_CANCELLED', taskId: message.taskId };
    }
    case 'GET_TASKS': {
      const tasks = taskManager.getTasks();
      return { type: 'TASKS_LIST', tasks };
    }
    case 'GET_AUTH_STATUS': {
      const config = AiClient.getConfig();
      return { type: 'AUTH_STATUS', authenticated: !!config.apiKey };
    }
    default:
      return { type: 'TASK_FAILED', task: null as any };
  }
}

async function handleContentScriptMessage(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  if (!sender.tab?.id) throw new Error('Message must come from a tab');
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
      return { success: true };
    default:
      throw new Error('Unknown content script message type');
  }
}

// ============ DISPATCHER SETUP ============

if (typeof chrome !== 'undefined' && chrome.runtime) {
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

  messageDispatcher.start();

  const chrome = getChrome();

  chrome.tabs.onActivated.addListener((activeInfo: chrome.tabs.TabActiveInfo) => {
    TabManager.setActiveTab(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      TabManager.handleTabUpdate(tabId, tab.url);
    }
  });

  chrome.runtime.onInstalled.addListener(async () => {
    console.log('Cometeor extension installed');
    await AiClient.loadConfig();
    const ok = await AiClient.testConnection();
    console.log('Inception API connection:', ok ? 'OK' : 'FAILED (check API key in options)');
  });

  chrome.runtime.onSuspend.addListener(() => {
    console.log('Cometeor service worker suspending');
    stopKeepAlive();
  });
}
