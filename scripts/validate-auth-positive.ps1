$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/validate-auth-positive.ps1'
& $target @args
exit $LASTEXITCODE

