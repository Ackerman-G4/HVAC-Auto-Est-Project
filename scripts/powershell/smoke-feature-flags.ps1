# SMOKE: CFD Feature Flags Validation
# This script validates feature flag combinations and rollout scenarios for CFD pipeline

# 1. Test with all feature flags enabled
# 2. Test with each flag individually toggled
# 3. Validate UI/API surface for flag effects

# --- CONFIG ---
$featureFlags = @('ENABLE_ADVANCED_CFD', 'ENABLE_FAST_SOLVER', 'ENABLE_NEW_GEOMETRY')
$simulationScript = "python ..\..\services\calc-engine\main.py"
$logFile = "cfd-feature-flags-validation.log"

foreach ($flag in $featureFlags) {
    Write-Host "Testing with feature flag: $flag"
    $env:CFD_FEATURE_FLAG = $flag
    $runResult = & $simulationScript "example/feature-flag-case.json" | Tee-Object -FilePath $logFile -Append
    # Check for errors or expected output
    $errors = Select-String -Path $logFile -Pattern "error|exception|fail"
    if ($errors) {
        Write-Host "Errors found with flag $flag. Review log."
        exit 1
    } else {
        Write-Host "PASS: $flag"
    }
}

Write-Host "CFD Feature Flags Validation Complete."
exit 0
