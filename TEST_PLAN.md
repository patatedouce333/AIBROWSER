# Comprehensive Test Plan - Architecture Refactoring & Verification

## Phase 1: Verify TypeScript Compilation
**Status**: NEXT
**Goal**: Ensure all TypeScript files compile without errors

### Step 1.1: Run TypeScript Type Check
```bash
npm run typecheck
```
**Expected**: No errors or warnings
**Failures to watch for**:
- "Cannot find name 'chrome'" - indicates missing getChrome() import
- "Property 'XXX' does not exist" - indicates API mismatch
- Circular dependency errors

### Step 1.2: Build Extension (webpack)
```bash
npm run build
```
**Expected**: Successfully compiles to dist/
**Output files**:
- dist/background.js (from index-refactored.ts)
- dist/content.js (from content/index.ts)
- dist/sidebar.js (from sidebar/index.ts)
- dist/options.js (from options/index.ts)
- dist/manifest.json (copied from src/)

**Failures to watch for**:
- "Cannot find module" - missing imports
- "Module not found" - circular dependency
- Webpack bundling errors

## Phase 2: Test Backend Logic (Without Extension)
**Status**: NEXT
**Goal**: Verify core business logic works independently

### Step 2.1: Run Backend Tests
```bash
node src/test-backend.ts
```
**Expected**: All 8 tests pass
**Tests**:
1. ✓ RequestQueue - Can instantiate and configure
2. ✓ VertexClient - Can load config and update
3. ✓ AuthManagerPKCE - Exists and has methods
4. ✓ TaskManager - Can create and manage tasks
5. ✓ CircuitBreaker - Can instantiate and track state
6. ✓ Store - Can use dot-path access and mutations
7. ✓ Validators - XSS protection validates inputs
8. ✓ Message types - All exports exist

**Success criteria**:
- No "Chrome is not defined" errors
- No "Cannot find module" errors
- All 8 tests show ✓ mark
- No timeout errors (would indicate circular dependencies)

### Step 2.2: Run Jest Unit Tests
```bash
npm test
```
**Expected**: 700+ tests pass
**Coverage**: ≥90%

**Tests covered**:
- Unit tests (320+ tests) - Individual class logic
- Integration tests (60+ tests) - Message passing
- Security tests (170+ tests) - XSS, CSRF, injection
- Performance tests (40+ tests) - Timing, limits
- Regression tests (120+ tests) - Known issues

## Phase 3: Verify Extension Loads
**Status**: AFTER Phase 2
**Goal**: Extension loads in Chrome without service worker errors

### Step 3.1: Open Chrome Extensions Page
```
chrome://extensions
```
**Action**: Click "Load unpacked"
**Select**: `/path/to/cometeor/dist/`

**Expected State**:
- ✓ Extension appears in list
- ✓ No errors shown
- ✓ Extension enabled by default
- ✓ No "script evaluation error" message

**Failures to watch for**:
- "Cannot load extension: ..." - manifest error
- "Script evaluation error" - service worker crash
- "Cannot find file..." - missing dist files

### Step 3.2: Check Service Worker Console
**Action**: 
1. Click extension in chrome://extensions
2. Click "Service worker" link
3. Open DevTools (F12)

**Expected logs**:
```
Cometeor service worker loaded
Starting service worker keep-alive
[other initialization logs]
```

**Failures to watch for**:
- "chrome is not defined"
- "getChrome is not a function"
- "Cannot read property 'X' of undefined"
- TypeError or ReferenceError messages
- Infinite loops or timeouts

## Phase 4: Test Core Features
**Status**: AFTER Phase 3
**Goal**: Verify extension functionality works

### Step 4.1: Test Popup UI
**Action**: Click extension icon in Chrome
**Expected**:
- ✓ Popup window opens
- ✓ Status dashboard visible
- ✓ Auth status shows "Not authenticated"
- ✓ Content script status shows detection
- ✓ Circuit breaker shows "CLOSED" (operational)
- ✓ No errors in popup console (F12)

### Step 4.2: Test OAuth2 Flow
**Action**: Click "Login" button in popup
**Expected**:
- ✓ Google OAuth prompt appears
- ✓ Shows 401 or "Invalid client" (placeholder credentials)
- ✓ Gracefully handles failure
- ✓ No service worker crash

**Note**: Full authentication requires real OAuth2 credentials

### Step 4.3: Test Message Passing
**Action**: Open any website, extension should inject content script
**Expected**:
- ✓ Content script loads (check console)
- ✓ Heartbeat messages sent (5-second interval)
- ✓ Background service worker receives messages
- ✓ No message timeout errors

### Step 4.4: Test DOM Action Execution
**Action**: Execute a test action from popup
**Expected**:
- ✓ Click action executes on page
- ✓ Form fills with text
- ✓ Scroll positions update
- ✓ No "Content script is dead" errors

## Phase 5: Troubleshooting Guide

### If TypeScript compilation fails:
1. Check error message for missing getChrome() import
2. Verify all background/ files have: `import { getChrome } from '../shared/dependency-container';`
3. Run: `npm run typecheck 2>&1 | grep -i "cannot find"`

### If Jest tests timeout:
1. Indicates circular dependency or module-level chrome API call
2. Run: `node src/test-backend.ts` to identify which class fails
3. Add getChrome() import and defer chrome API access

### If service worker shows "script evaluation error":
1. Check service worker console (chrome://extensions → Service worker)
2. Look for: "Cannot find module", "chrome is not defined", circular references
3. Verify webpack built from index-refactored.ts, not index.ts

### If messages don't come back:
1. Check MessageDispatcher is being used (not multiple listeners)
2. Verify all handlers registered with messageDispatcher.register()
3. Check content script is alive (heartbeat in background console)
4. Run: `chrome.tabs.sendMessage()` in popup console to test directly

## Files to Monitor
### Critical files for refactoring:
- [✓] `src/shared/dependency-container.ts` - DI container
- [✓] `src/background/keep-alive.ts` - Uses getChrome()
- [✓] `src/background/auth-manager-pkce.ts` - Deferred chrome.runtime.getURL()
- [✓] `src/background/index-refactored.ts` - Uses MessageDispatcher + getChrome()
- [✓] `src/background/tab-manager.ts` - All chrome.tabs calls use getChrome()
- [✓] `src/background/offscreen-manager.ts` - All chrome.offscreen calls use getChrome()
- [✓] `src/background/action-executor.ts` - chrome.tabs.sendMessage uses getChrome()
- [✓] `src/background/token-store.ts` - chrome.storage uses getChrome()
- [✓] `src/background/content-script-monitor.ts` - chrome.tabs.sendMessage uses getChrome()

### Files not modified (pure business logic):
- request-queue.ts, action-planner.ts, context-manager.ts, task-manager.ts
- vertex-client.ts, message-dispatcher.ts, token-store-refactored.ts

### Build configuration:
- webpack.config.js - Entry: index-refactored.ts ✓
- tsconfig.json - types: ["chrome", "node"] ✓
- jest.config.js - TestEnvironment: "node" ✓

## Success Criteria
✓ Phase 1: TypeScript compilation passes
✓ Phase 2: Backend tests run without chrome errors
✓ Phase 3: Extension loads with no service worker errors
✓ Phase 4: Popup opens, message passing works
✓ Phase 5: No console errors, architecture is clean

## Timeline
- Phase 1: 5 minutes (compilation)
- Phase 2: 10 minutes (tests)
- Phase 3: 5 minutes (extension load)
- Phase 4: 15 minutes (feature testing)
- **Total**: ~35 minutes
