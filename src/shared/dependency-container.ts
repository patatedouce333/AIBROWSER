/**
 * Dependency Injection Container
 * Centralizes all dependencies and abstracts chrome API
 */

// Mock interface for chrome API
export interface ChromeAPI {
  alarms: any;
  runtime: any;
  storage: any;
  tabs: any;
  scripting: any;
  offscreen: any;
  identity: any;
}

/**
 * Global dependency container
 * Allows tests to inject mocks without modifying source code
 */
export class DependencyContainer {
  private static instance: DependencyContainer;
  private chromeAPI: ChromeAPI;

  private constructor() {
    // Initialize with real chrome API if available
    if (typeof (globalThis as any).chrome !== 'undefined') {
      this.chromeAPI = (globalThis as any).chrome;
    } else {
      // Fallback to mock for tests
      this.chromeAPI = this.createMockChrome();
    }
  }

  static getInstance(): DependencyContainer {
    if (!DependencyContainer.instance) {
      DependencyContainer.instance = new DependencyContainer();
    }
    return DependencyContainer.instance;
  }

  getChrome(): ChromeAPI {
    return this.chromeAPI;
  }

  setChrome(chrome: ChromeAPI): void {
    this.chromeAPI = chrome;
  }

  private createMockChrome(): ChromeAPI {
    return {
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: { addListener: () => {} }
      },
      runtime: {
        getURL: (path: string) => `chrome-extension://mock/${path}`,
        getPlatformInfo: (callback: any) => callback({ os: 'linux' }),
        onMessage: { addListener: () => {} }
      },
      storage: {
        session: {
          set: async (obj: any) => {},
          get: async (keys: any) => ({}),
          remove: async (keys: any) => {}
        },
        local: {
          set: async (obj: any) => {},
          get: async (keys: any) => ({}),
          remove: async (keys: any) => {}
        }
      },
      tabs: {
        sendMessage: async (tabId: number, message: any) => ({ success: true }),
        onActivated: { addListener: () => {} },
        onUpdated: { addListener: () => {} }
      },
      scripting: {
        executeScript: async (options: any) => {}
      },
      offscreen: {
        createDocument: async (options: any) => {},
        closeDocument: async () => {}
      },
      identity: {
        launchWebAuthFlow: async (options: any) => null
      }
    };
  }
}

// Export singleton
export const getChrome = () => DependencyContainer.getInstance().getChrome();
