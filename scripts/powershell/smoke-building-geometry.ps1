# SMOKE: Building Geometry Enhancement
# This script validates complex building geometry handling in CFD pipeline

# 1. Test non-rectangular polygons
# 2. Test complex adjacency and vertical connections
# 3. Test wall metadata propagation

# --- CONFIG ---
$geometryCase = "example/complex-geometry.json"
$simulationScript = "python ..\..\services\calc-engine\main.py"
$logFile = "building-geometry-validation.log"

Write-Host "Running complex geometry case..."
$runResult = & $simulationScript $geometryCase | Tee-Object -FilePath $logFile

Write-Host "Checking for geometry errors..."
$geometryErrors = Select-String -Path $logFile -Pattern "geometry error|invalid polygon|adjacency error|wall metadata error"
if ($geometryErrors) {
    Write-Host "Geometry errors found. Review log for details."
    exit 1
} else {
    Write-Host "Geometry validation passed."
}

Write-Host "Building Geometry Enhancement Validation Complete."
exit 0
