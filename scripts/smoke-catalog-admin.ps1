$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/smoke-catalog-admin.ps1'
& $target @args
exit $LASTEXITCODE

