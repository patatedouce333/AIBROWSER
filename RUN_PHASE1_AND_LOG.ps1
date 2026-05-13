# Phase 1 Verification - Auto-run with logging
# Purpose: Run all verification commands and save output to file

$logFile = "C:\app reisss\cometeor\PHASE1_RESULTS.txt"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Start logging
Add-Content -Path $logFile -Value "========================================" -Force
Add-Content -Path $logFile -Value "PHASE 1 VERIFICATION RESULTS"
Add-Content -Path $logFile -Value "Timestamp: $timestamp"
Add-Content -Path $logFile -Value "========================================`n"

# Change to project directory
Set-Location "C:\app reisss\cometeor"
Add-Content -Path $logFile -Value "Working Directory: $(Get-Location)`n"

# Step 1: TypeScript Check
Add-Content -Path $logFile -Value "STEP 1: TypeScript Compilation Check"
Add-Content -Path $logFile -Value "Command: npm run typecheck`n"
$output = npm run typecheck 2>&1
Add-Content -Path $logFile -Value $output
Add-Content -Path $logFile -Value "`n========================================`n"

# Step 2: Build
Add-Content -Path $logFile -Value "STEP 2: Webpack Build"
Add-Content -Path $logFile -Value "Command: npm run build`n"
$output = npm run build 2>&1
Add-Content -Path $logFile -Value $output
Add-Content -Path $logFile -Value "`n========================================`n"

# Step 3: List dist files
Add-Content -Path $logFile -Value "STEP 3: Verify Dist Files"
Add-Content -Path $logFile -Value "Command: dir dist`n"
if (Test-Path "dist") {
    $files = Get-ChildItem -Path "dist" -Recurse | ForEach-Object {
        "$($_.FullName) ($([math]::Round($_.Length/1024, 2)) KB)"
    }
    Add-Content -Path $logFile -Value ($files -join "`n")
} else {
    Add-Content -Path $logFile -Value "ERROR: dist folder not found!"
}

Add-Content -Path $logFile -Value "`n========================================`n"
Add-Content -Path $logFile -Value "VERIFICATION COMPLETE"
Add-Content -Path $logFile -Value "Results saved to: $logFile`n"

# Display results
Write-Host "Phase 1 Verification Complete!"
Write-Host "Results saved to: $logFile"
Write-Host ""
Write-Host "Opening results file..."
Start-Sleep -Seconds 2
Invoke-Item $logFile
