# Phase 1 Verification - Quick Start

## Run These Commands Now

### Option A: Windows (Run in PowerShell or CMD)
```batch
cd C:\app reisss\cometeor
PHASE_1_VERIFICATION.bat
```

### Option B: Mac/Linux (Run in Terminal)
```bash
cd /path/to/cometeor
bash PHASE_1_VERIFICATION.sh
```

### Option C: Manual Commands (Any OS)
```bash
npm run typecheck
npm run build
```

---

## What Each Command Does

### 1. npm run typecheck
**What**: Checks TypeScript for type errors without building
**Expected**: No errors or warnings
**Time**: 10-30 seconds
**Success**: "No errors" or clean output

### 2. npm run build
**What**: Compiles TypeScript + bundles with webpack
**Expected**: Creates dist/ folder with .js files
**Time**: 30-60 seconds
**Success**: Builds without errors

### 3. Verify dist files
**Files to check**:
- ✓ dist/background.js (from index-refactored.ts)
- ✓ dist/content.js (content script)
- ✓ dist/manifest.json (extension config)
- ✓ dist/popup.html
- ✓ dist/options.html

---

## Expected Output

### TypeScript Check (Success)
```
✓ Done in 0.50s
```

### Webpack Build (Success)
```
asset background.js 45.2 KiB [compared for emit] (name: background)
asset content.js 32.1 KiB [compared for emit] (name: content)
asset options.js 8.4 KiB [compared for emit] (name: options)
asset sidebar.js 7.8 KiB [compared for emit] (name: sidebar)
webpack 5.89.0 compiled successfully
```

### Dist Files (Success)
```
dist/
  background.js ............... ✓
  content.js .................. ✓
  options.js .................. ✓
  sidebar.js .................. ✓
  manifest.json ............... ✓
  popup.html .................. ✓
  options.html ................ ✓
```

---

## If You See Errors

### Error: "Cannot find module 'getChrome'"
**Cause**: Missing import in a background file
**Fix**: Add `import { getChrome } from '../shared/dependency-container';`

### Error: "chrome is not defined"
**Cause**: Direct chrome API call instead of getChrome()
**Fix**: Change `chrome.X` to `const chrome = getChrome(); chrome.X`

### Error: "Property 'X' does not exist"
**Cause**: Chrome API version mismatch
**Fix**: Check @types/chrome version in package.json

### Build takes >2 minutes
**Cause**: Webpack rebuilding unnecessarily
**Fix**: Delete dist/ folder, run again

---

## After Phase 1 Passes

Run Phase 2 commands:
```bash
npm test                      # Run Jest tests (expect 700+)
node src/test-backend.ts      # Test business logic
```

Then Phase 3:
```
chrome://extensions
→ Load unpacked
→ Select /path/to/cometeor/dist/
```

---

## Documentation Files Reference

| File | Purpose |
|------|---------|
| REFACTORING_SUMMARY.md | What was changed and why |
| TEST_PLAN.md | Complete 5-phase verification guide |
| ARCHITECTURE_REFACTORING_COMPLETE.md | Executive summary |
| PHASE_1_VERIFICATION.sh | Automated Phase 1 script (Mac/Linux) |
| PHASE_1_VERIFICATION.bat | Automated Phase 1 script (Windows) |

---

**Start Here**: Run Phase 1 verification script above ↑
