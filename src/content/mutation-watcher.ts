// Mutation watcher for SPA navigation detection
export class MutationWatcher {
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUrl = window.location.href;
  private mutationCount = 0;
  private significantChangeCallback: (() => void) | null = null;

  start(onSignificantChange: () => void) {
    this.significantChangeCallback = onSignificantChange;
    this.lastUrl = window.location.href;

    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false,
    });

    this.patchHistoryAPI();
    console.log('Mutation watcher started');
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    console.log('Mutation watcher stopped');
  }

  private handleMutations(mutations: MutationRecord[]) {
    let significantAdded = 0;

    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          // Skip trivial elements
          if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
          if (el.tagName === 'SPAN' && !el.children.length && !el.textContent?.trim()) continue;
          significantAdded++;
        }
      }
    }

    this.mutationCount += significantAdded;

    // Debounce to detect when DOM stabilizes
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (this.mutationCount > 10) {
        console.log(`Significant mutation detected (${this.mutationCount} changes)`);
        this.significantChangeCallback?.();
      }
      this.mutationCount = 0;
    }, 500);
  }

  private patchHistoryAPI() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const self = this;

    history.pushState = function (data: any, unused: string, url?: string | URL | null) {
      originalPushState.call(this, data, unused, url);
      // Small delay to let DOM update
      setTimeout(() => self.checkUrlChange(), 100);
    };

    history.replaceState = function (data: any, unused: string, url?: string | URL | null) {
      originalReplaceState.call(this, data, unused, url);
      setTimeout(() => self.checkUrlChange(), 100);
    };

    // Listen for back/forward navigation
    window.addEventListener('popstate', () => this.checkUrlChange());
  }

  private checkUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== this.lastUrl) {
      console.log(`URL changed: ${this.lastUrl} → ${currentUrl}`);
      this.lastUrl = currentUrl;

      // Notify background of SPA navigation
      chrome.runtime.sendMessage({
        type: 'SPA_NAVIGATION',
        url: currentUrl,
      });

      // Also trigger significant change callback
      setTimeout(() => {
        this.significantChangeCallback?.();
      }, 800);
    }
  }
}