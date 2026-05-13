@echo off
REM Phase 1: Verification - TypeScript Compilation Check
REM Run this batch file from the cometeor project root

echo.
echo ==========================================
echo PHASE 1: TypeScript Compilation Verification
echo ==========================================
echo.

REM Step 1: TypeScript Type Check
echo [1/4] Running TypeScript type check...
echo Command: npm run typecheck
call npm run typecheck
if errorlevel 1 (
    echo.
    echo ==========================================
    echo FAILED: TypeScript compilation failed
    echo Review errors above and fix before proceeding
    echo ==========================================
    pause
    exit /b 1
)

echo.
echo ==========================================
echo.

REM Step 2: Build webpack bundle
echo [2/4] Building webpack bundle...
echo Command: npm run build
call npm run build
if errorlevel 1 (
    echo.
    echo ==========================================
    echo FAILED: Webpack build failed
    echo Review errors above
    echo ==========================================
    pause
    exit /b 1
)

echo.
echo ==========================================
echo.

REM Step 3: Verify dist files exist
echo [3/4] Verifying build output...
if exist dist\background.js (
    if exist dist\content.js (
        if exist dist\manifest.json (
            echo SUCCESS: All required dist files present
            dir dist\*.js dist\manifest.json
        ) else (
            echo FAILED: Missing dist/manifest.json
            pause
            exit /b 1
        )
    ) else (
        echo FAILED: Missing dist/content.js
        pause
        exit /b 1
    )
) else (
    echo FAILED: Missing dist/background.js
    pause
    exit /b 1
)

echo.
echo ==========================================
echo SUCCESS: PHASE 1 VERIFICATION COMPLETE
echo ==========================================
echo.
echo Next Steps:
echo 1. npm test              - Run Jest tests
echo 2. node src/test-backend.ts - Test backend logic
echo 3. chrome://extensions   - Load extension
echo.
pause
