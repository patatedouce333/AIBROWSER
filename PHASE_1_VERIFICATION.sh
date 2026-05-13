#!/bin/bash
# Phase 1: Verification - TypeScript Compilation Check
# Run this script from the cometeor project root

echo "=========================================="
echo "PHASE 1: TypeScript Compilation Verification"
echo "=========================================="
echo ""

# Step 1: TypeScript Type Check
echo "[1/4] Running TypeScript type check..."
echo "Command: npm run typecheck"
npm run typecheck
TYPECHECK_EXIT=$?

echo ""
echo "=========================================="

if [ $TYPECHECK_EXIT -ne 0 ]; then
    echo "❌ TypeScript compilation FAILED"
    echo "Review errors above and fix before proceeding"
    exit 1
fi

echo "✓ TypeScript compilation PASSED"
echo ""

# Step 2: Build webpack bundle
echo "[2/4] Building webpack bundle..."
echo "Command: npm run build"
npm run build
BUILD_EXIT=$?

echo ""
echo "=========================================="

if [ $BUILD_EXIT -ne 0 ]; then
    echo "❌ Webpack build FAILED"
    echo "Review errors above"
    exit 1
fi

echo "✓ Webpack build PASSED"
echo ""

# Step 3: Verify dist files exist
echo "[3/4] Verifying build output..."
if [ -f dist/background.js ] && [ -f dist/content.js ] && [ -f dist/manifest.json ]; then
    echo "✓ All required dist files present:"
    ls -lh dist/*.js dist/manifest.json
else
    echo "❌ Missing dist files"
    exit 1
fi

echo ""
echo "=========================================="
echo "✓ PHASE 1 VERIFICATION COMPLETE"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. npm test              - Run Jest tests"
echo "2. node src/test-backend.ts - Test backend logic"
echo "3. chrome://extensions   - Load extension"
echo ""
