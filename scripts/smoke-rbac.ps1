$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/smoke-rbac.ps1'
& $target @args
exit $LASTEXITCODE

