// Action executor for web automation plans
import { Plan, Action } from '../shared/messages';
import { TabManager } from './tab-manager';
import { getChrome } from '../shared/dependency-container';

export class ActionExecutor {
  static async executePlan(plan: Plan, tabId: number): Promise<any> {
    console.log(`Executing plan with ${plan.actions.length} actions`);

    const results = [];

    for (const action of plan.actions) {
      try {
        console.log(`Executing action: ${action.type} - ${action.description}`);
        const result = await this.executeAction(action, tabId);
        results.push({ action, success: true, result });

        // Small delay between actions for stability
        await this.sleep(500);
      } catch (error: any) {
        console.error(`Action failed: ${action.type}`, error);
        results.push({ action, success: false, error: error.message });

        // Continue with next action unless it's critical
        if (action.type === 'click' && action.description?.includes('submit')) {
          // For critical actions, might want to stop
          throw error;
        }
      }
    }

    return { results, completed: true };
  }

  private static async executeAction(action: Action, tabId: number): Promise<any> {
    switch (action.type) {
      case 'click':
        return this.executeClick(action, tabId);

      case 'type':
        return this.executeType(action, tabId);

      case 'select':
        return this.executeSelect(action, tabId);

      case 'scroll':
        return this.executeScroll(action, tabId);

      case 'wait':
        return this.executeWait(action);

      case 'press_key':
        return this.executePressKey(action, tabId);

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private static async executeClick(action: Action, tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const chrome = getChrome();
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_ACTION',
        action: {
          type: 'click',
          selector: action.selector,
          x: action.x,
          y: action.y,
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Click failed'));
        }
      });
    });
  }

  private static async executeType(action: Action, tabId: number): Promise<void> {
    if (!action.value) {
      throw new Error('Type action requires value');
    }

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_ACTION',
        action: {
          type: 'type',
          selector: action.selector,
          value: action.value,
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Type failed'));
        }
      });
    });
  }

  private static async executeSelect(action: Action, tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_ACTION',
        action: {
          type: 'select',
          selector: action.selector,
          value: action.value,
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Select failed'));
        }
      });
    });
  }

  private static async executeScroll(action: Action, tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_ACTION',
        action: {
          type: 'scroll',
          selector: action.selector,
          x: action.x,
          y: action.y,
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Scroll failed'));
        }
      });
    });
  }

  private static async executeWait(action: Action): Promise<void> {
    const duration = action.duration || 1000;
    await this.sleep(duration);
  }

  private static async executePressKey(action: Action, tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_ACTION',
        action: {
          type: 'press_key',
          key: action.key,
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Press key failed'));
        }
      });
    });
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}