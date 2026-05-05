$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/validate-preflight.ps1'
& $target @args
exit $LASTEXITCODE

