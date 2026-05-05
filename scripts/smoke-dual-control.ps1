$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/smoke-dual-control.ps1'
& $target @args
exit $LASTEXITCODE

