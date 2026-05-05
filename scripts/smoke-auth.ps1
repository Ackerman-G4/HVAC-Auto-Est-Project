$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/smoke-auth.ps1'
& $target @args
exit $LASTEXITCODE

