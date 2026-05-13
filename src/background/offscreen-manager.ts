// Offscreen document manager for very long-running tasks (>5 minutes)
import { getChrome } from '../shared/dependency-container';

export class OffscreenManager {
  private static offscreenUrl = 'offscreen.html';

  static async ensureOffscreenDocument(): Promise<void> {
    try {
      const chrome = getChrome();
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT as any],
      });

      if (existingContexts.length > 0) {
        console.log('Offscreen document already exists');
        return;
      }

      console.log('Creating offscreen document');
      await chrome.offscreen.createDocument({
        url: this.offscreenUrl,
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: 'Keep service worker alive during long-running AI tasks',
      });
    } catch (error) {
      console.error('Failed to create offscreen document:', error);
      throw error;
    }
  }

  static async closeOffscreenDocument(): Promise<void> {
    try {
      const chrome = getChrome();
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT as any],
      });

      if (existingContexts.length === 0) {
        return;
      }

      console.log('Closing offscreen document');
      await chrome.offscreen.closeDocument();
    } catch (error) {
      console.error('Failed to close offscreen document:', error);
    }
  }

  static async sendToOffscreen(message: any): Promise<any> {
    try {
      await this.ensureOffscreenDocument();

      return new Promise((resolve, reject) => {
        const chrome = getChrome();
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.error('Failed to send message to offscreen:', error);
      throw error;
    }
  }
}