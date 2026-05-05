$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/validate-system-strict.ps1'
& $target @args
exit $LASTEXITCODE

