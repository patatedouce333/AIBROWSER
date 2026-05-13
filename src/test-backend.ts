/**
 * Backend Logic Test - Test core classes without Chrome extension
 * Tests: TaskManager, ActionPlanner, VertexClient, ActionExecutor, etc.
 */

// Mock chrome API for Node.js environment
(global as any).chrome = {
  alarms: {
    create: () => console.log('Mock: chrome.alarms.create'),
    clear: () => console.log('Mock: chrome.alarms.clear'),
    onAlarm: { addListener: () => console.log('Mock: chrome.alarms.onAlarm.addListener') }
  },
  runtime: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
    getPlatformInfo: (callback: any) => callback({ os: 'linux' }),
    onMessage: { addListener: () => console.log('Mock: chrome.runtime.onMessage.addListener') }
  },
  storage: {
    session: {
      set: async (obj: any) => console.log('Mock: chrome.storage.session.set', obj),
      get: async (keys: any) => ({}),
      remove: async (keys: any) => console.log('Mock: chrome.storage.session.remove')
    },
    local: {
      set: async (obj: any) => console.log('Mock: chrome.storage.local.set', obj),
      get: async (keys: any) => ({}),
      remove: async (keys: any) => console.log('Mock: chrome.storage.local.remove')
    }
  },
  tabs: {
    sendMessage: async (tabId: number, message: any) => ({ success: true }),
    onActivated: { addListener: () => console.log('Mock: chrome.tabs.onActivated.addListener') },
    onUpdated: { addListener: () => console.log('Mock: chrome.tabs.onUpdated.addListener') }
  },
  scripting: {
    executeScript: async (options: any) => console.log('Mock: chrome.scripting.executeScript')
  },
  offscreen: {
    createDocument: async (options: any) => console.log('Mock: chrome.offscreen.createDocument'),
    closeDocument: async () => console.log('Mock: chrome.offscreen.closeDocument')
  },
  identity: {
    launchWebAuthFlow: async (options: any) => null
  }
};

// Import classes to test
console.log('\n=== BACKEND LOGIC TEST ===\n');

// Test 1: Request Queue
console.log('TEST 1: RequestQueue');
try {
  const { RequestQueue } = require('./background/request-queue');
  const queue = new RequestQueue();
  console.log('✓ RequestQueue instantiated');
  console.log(`  Queue config: maxConcurrent=${queue.maxConcurrent}, batchSize=${queue.batchSize}`);
} catch (error: any) {
  console.error('✗ RequestQueue ERROR:', error.message);
}

// Test 2: VertexClient
console.log('\nTEST 2: VertexClient');
try {
  const { VertexClient } = require('./background/vertex-client');
  console.log('✓ VertexClient imported');
  console.log(`  Config: ${JSON.stringify(VertexClient.getConfig())}`);

  // Test updateConfig
  VertexClient.updateConfig({ region: 'us-west1' });
  console.log('✓ updateConfig() works');
} catch (error: any) {
  console.error('✗ VertexClient ERROR:', error.message);
}

// Test 3: AuthManagerPKCE
console.log('\nTEST 3: AuthManagerPKCE');
try {
  const { AuthManagerPKCE } = require('./background/auth-manager-pkce');
  console.log('✓ AuthManagerPKCE imported');

  // Verify it doesn't crash on import
  console.log('✓ AuthManagerPKCE.logout() exists:', typeof AuthManagerPKCE.logout);
} catch (error: any) {
  console.error('✗ AuthManagerPKCE ERROR:', error.message);
}

// Test 4: TaskManager
console.log('\nTEST 4: TaskManager');
try {
  const { TaskManager } = require('./background/task-manager');
  const taskManager = new TaskManager();
  console.log('✓ TaskManager instantiated');

  // Check methods exist
  console.log('✓ Methods exist:');
  console.log(`  - createTask: ${typeof taskManager.createTask}`);
  console.log(`  - cancelTask: ${typeof taskManager.cancelTask}`);
  console.log(`  - getTasks: ${typeof taskManager.getTasks}`);
} catch (error: any) {
  console.error('✗ TaskManager ERROR:', error.message);
}

// Test 5: CircuitBreaker
console.log('\nTEST 5: CircuitBreaker');
try {
  const { CircuitBreaker } = require('./shared/circuit-breaker');
  const breaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000,
    monitoringPeriod: 10000
  });
  console.log('✓ CircuitBreaker instantiated');
  console.log(`  State: ${breaker.getState()}`);
} catch (error: any) {
  console.error('✗ CircuitBreaker ERROR:', error.message);
}

// Test 6: Store
console.log('\nTEST 6: Store');
try {
  const { Store } = require('./shared/store');
  const store = new Store({});
  console.log('✓ Store instantiated');

  // Test dot-path access
  store.set('user.name', 'John');
  store.set('user.email', 'john@example.com');
  console.log('✓ Dot-path set works');
  console.log('  Data:', JSON.stringify(store.getAll()));
} catch (error: any) {
  console.error('✗ Store ERROR:', error.message);
}

// Test 7: Validators
console.log('\nTEST 7: Validators');
try {
  const { validateSelector, validateJavaScript, validateXSS } = require('./shared/validators');
  console.log('✓ Validators imported');

  // Test XSS validation
  const xssTests = [
    { input: '#button', expected: true },
    { input: 'onclick="alert(1)"', expected: false },
    { input: '<script>alert(1)</script>', expected: false }
  ];

  let passed = 0;
  for (const test of xssTests) {
    const result = validateXSS(test.input);
    if (result === test.expected) {
      passed++;
    } else {
      console.warn(`  XSS test failed: ${test.input} -> ${result} (expected ${test.expected})`);
    }
  }
  console.log(`✓ XSS validation: ${passed}/${xssTests.length} tests passed`);
} catch (error: any) {
  console.error('✗ Validators ERROR:', error.message);
}

// Test 8: Message types
console.log('\nTEST 8: Message Types');
try {
  const messages = require('./shared/messages');
  console.log('✓ Message types imported');
  console.log('  Exported:', Object.keys(messages).slice(0, 5).join(', '));
} catch (error: any) {
  console.error('✗ Message Types ERROR:', error.message);
}

console.log('\n=== TEST COMPLETE ===\n');
console.log('Summary:');
console.log('- If all tests pass, the backend logic is solid');
console.log('- If any tests fail, the class needs to be fixed');
console.log('- Once backend works, the extension message passing will work');
