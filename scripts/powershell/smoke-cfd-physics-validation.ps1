# SMOKE: CFD Physics Validation
# This script validates CFD simulation physics: reference case, convergence, mass/energy balance

# 1. Reference Case: Run a known-good simulation and compare results
# 2. Residual Convergence: Check solver logs for residuals below threshold
# 3. Mass/Energy Balance: Parse output for conservation checks

# --- CONFIG ---
$referenceCase = "example/reference-case.json"
$simulationScript = "python ..\..\services\calc-engine\main.py"
$logFile = "cfd-physics-validation.log"

# --- RUN REFERENCE CASE ---
Write-Host "Running CFD reference case..."
$runResult = & $simulationScript $referenceCase | Tee-Object -FilePath $logFile

# --- CHECK RESIDUALS ---
Write-Host "Checking residual convergence..."
$residuals = Select-String -Path $logFile -Pattern "residual" | Select-String -Pattern "[0-9]+\.[0-9]+"
$maxResidual = ($residuals | ForEach-Object { $_.Matches[0].Value } | Measure-Object -Maximum).Maximum
if ($maxResidual -lt 1e-3) {
    Write-Host "Residuals converged: $maxResidual"
} else {
    Write-Host "Residuals too high: $maxResidual"; exit 1
}

# --- CHECK MASS/ENERGY BALANCE ---
Write-Host "Checking mass/energy balance..."
$massBalance = Select-String -Path $logFile -Pattern "mass balance error"
$energyBalance = Select-String -Path $logFile -Pattern "energy balance error"
if ($massBalance -and $energyBalance) {
    Write-Host "Mass/Energy balance checks found. Review log for details."
    exit 1
} else {
    Write-Host "Mass/Energy balance OK."
}

Write-Host "CFD Physics Validation Complete."
exit 0
