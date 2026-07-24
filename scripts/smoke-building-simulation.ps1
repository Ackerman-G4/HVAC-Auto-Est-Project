$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/smoke-building-simulation.ps1'
& $target @args
exit $LASTEXITCODE

