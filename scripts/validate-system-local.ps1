$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/validate-system-local.ps1'
& $target @args
exit $LASTEXITCODE

