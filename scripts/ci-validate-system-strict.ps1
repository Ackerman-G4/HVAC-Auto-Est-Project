$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/ci-validate-system-strict.ps1'
& $target @args
exit $LASTEXITCODE

