// Content script entry point
import { DomExtractor } from './dom-extractor';
import { MutationWatcher } from './mutation-watcher';
import { HumanizedInput } from './humanized-input';
import { BackgroundMessage, ContentMessage } from '../shared/messages';

console.log('Cometeor content script loaded');

// Initialize components
let mutationWatcher: MutationWatcher | null = null;

// Message handler
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
    (async () => {
      try {
        let response: ContentMessage;

        switch (message.type) {
          case 'PING':
            response = { type: 'PONG' };
            break;

          case 'EXTRACT_DOM':
            const snapshot = await DomExtractor.extractSnapshot();
            response = { type: 'DOM_SNAPSHOT', snapshot };
            break;

          case 'START_MUTATION_WATCHING':
            if (!mutationWatcher) {
              mutationWatcher = new MutationWatcher();
              mutationWatcher.start(() => {
                chrome.runtime.sendMessage({
                  type: 'MUTATION_DETECTED',
                  url: window.location.href,
                  significant: true,
                });
              });
            }
            response = { type: 'PONG' };
            break;

          case 'STOP_MUTATION_WATCHING':
            if (mutationWatcher) {
              mutationWatcher.stop();
              mutationWatcher = null;
            }
            response = { type: 'PONG' };
            break;

          case 'EXECUTE_ACTION':
            const actionResult = await executeAction(message.action);
            response = actionResult;
            break;

          default:
            response = { type: 'PONG' };
        }

        sendResponse(response);
      } catch (error: any) {
        console.error('Content script error:', error);
        sendResponse({
          type: 'ACTION_RESULT',
          success: false,
          error: error.message,
        });
      }
    })();
    return true; // Keep message channel open for async response
  });
}

// Action execution helper
async function executeAction(action: any): Promise<ContentMessage> {
  try {
    switch (action.type) {
      case 'click':
        if (action.selector) {
          await HumanizedInput.humanClick(action.selector);
        } else if (action.x !== undefined && action.y !== undefined) {
          // Click at coordinates (not implemented yet)
          throw new Error('Coordinate clicking not implemented');
        } else {
          throw new Error('Click action requires selector or coordinates');
        }
        break;

      case 'type':
        if (!action.selector || !action.value) {
          throw new Error('Type action requires selector and value');
        }
        await HumanizedInput.humanType(action.selector, action.value);
        break;

      case 'select':
        if (!action.selector || !action.value) {
          throw new Error('Select action requires selector and value');
        }
        const selectElement = document.querySelector(action.selector) as HTMLSelectElement;
        if (!selectElement) {
          throw new Error(`Select element not found: ${action.selector}`);
        }
        selectElement.value = action.value;
        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        break;

      case 'scroll':
        if (action.selector) {
          const element = document.querySelector(action.selector);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            throw new Error(`Scroll element not found: ${action.selector}`);
          }
        } else if (action.x !== undefined || action.y !== undefined) {
          window.scrollTo({
            left: action.x || window.scrollX,
            top: action.y || window.scrollY,
            behavior: 'smooth',
          });
        } else {
          throw new Error('Scroll action requires selector or coordinates');
        }
        // Wait for scroll to complete
        await new Promise(r => setTimeout(r, 500));
        break;

      case 'wait':
        await new Promise(r => setTimeout(r, action.duration || 1000));
        break;

      case 'press_key':
        const keyEvent = new KeyboardEvent('keydown', {
          key: action.key,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(keyEvent);
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    return { type: 'ACTION_RESULT', success: true };
  } catch (error: any) {
    return { type: 'ACTION_RESULT', success: false, error: error.message };
  }
}

// Initialize mutation watching when content script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMutationWatching);
} else {
  initializeMutationWatching();
}

function initializeMutationWatching() {
  // Start mutation watching after a short delay to let page stabilize
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'START_MUTATION_WATCHING' });
  }, 1000);
}