$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/validate-preflight-strict-local.ps1'
& $target @args
exit $LASTEXITCODE

