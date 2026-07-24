$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/validate-rbac-positive.ps1'
& $target @args
exit $LASTEXITCODE

