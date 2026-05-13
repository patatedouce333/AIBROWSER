// Content script entry point - JavaScript version
console.log('Cometeor content script loaded');

// Simple message handler
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ pong: true });
    } else if (message?.type === 'EXTRACT_DOM') {
      // Simple DOM extraction
      const snapshot = {
        url: window.location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollY: window.scrollY,
          totalHeight: document.body.scrollHeight,
        },
        content: {
          text: document.body.textContent?.slice(0, 1000) || '',
          title: document.title,
          url: window.location.href,
        },
        interactive: [],
      };
      sendResponse({ snapshot });
    } else {
      sendResponse({ error: 'Unknown message type' });
    }
    return true;
  });
}